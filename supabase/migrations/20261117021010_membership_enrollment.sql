-- Membership contract v1: first enrolment only, against one explicitly approved
-- commercial package. No sample rule, tier, member or external identity is seeded.
-- Payment creates a pending verification request, never membership privileges.
create table private.membership_rules (
 id uuid primary key default gen_random_uuid(),
 package_offer_id uuid not null references private.commerce_offers(id),
 market text not null references public.markets(code),
 tier_code text not null check(tier_code ~ '^[A-Z0-9_-]{2,40}$'),
 tier_name text not null check(length(tier_name) between 2 and 80),
 minimum_quantity integer not null check(minimum_quantity between 1 and 24),
 terms_version text not null check(length(terms_version) between 3 and 100),
 terms_text text not null check(length(terms_text) between 20 and 12000),
 code_version text not null check(length(code_version) between 3 and 100),
 code_text text not null check(length(code_text) between 20 and 12000),
 approval_reference text not null check(length(approval_reference) between 5 and 200),
 approved_by uuid not null references public.app_users(id),
 approved_at timestamptz not null default clock_timestamp(),
 withdrawn_at timestamptz,
 withdrawal_reference text check(length(withdrawal_reference) between 5 and 200),
 check((withdrawn_at is null)=(withdrawal_reference is null))
);
create unique index membership_rules_active_package_idx on private.membership_rules(package_offer_id) where withdrawn_at is null;
create index membership_rules_market_idx on private.membership_rules(market,approved_at desc,id);
create index membership_rules_approver_idx on private.membership_rules(approved_by);
alter table private.membership_rules enable row level security;
revoke all on private.membership_rules from public,anon,authenticated,service_role;
create policy membership_rules_internal_only on private.membership_rules for all to anon,authenticated using(false) with check(false);

create table private.membership_enrollments (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null unique references public.orders(id),
 user_id uuid not null references public.app_users(id),
 market text not null references public.markets(code),
 rule_id uuid not null references private.membership_rules(id),
 sponsor_id uuid not null references public.distributor_profiles(user_id),
 sponsor_member_id text not null,
 quantity integer not null check(quantity between 1 and 24),
 rule_snapshot jsonb not null,
 consent jsonb not null,
 consent_hash text not null check(consent_hash ~ '^[a-f0-9]{64}$'),
 consented_at timestamptz not null default clock_timestamp(),
 created_at timestamptz not null default clock_timestamp(),
 status text not null default 'pending_payment' check(status in ('pending_payment','pending_verification','confirmed','not_applied','cancelled')),
 paid_at timestamptz,
 confirmed_at timestamptz,
 external_member_id text,
 confirmation_reference text,
 confirmed_by uuid references public.app_users(id),
 check((status='confirmed')=(confirmed_at is not null and external_member_id is not null and confirmation_reference is not null and confirmed_by is not null)),
 check(status not in ('pending_verification','confirmed','not_applied') or paid_at is not null)
);
create unique index membership_enrollments_first_idx on private.membership_enrollments(user_id) where status in ('pending_verification','confirmed');
create index membership_enrollments_owner_idx on private.membership_enrollments(user_id,created_at desc,id);
create index membership_enrollments_market_idx on private.membership_enrollments(market,created_at desc,id);
create index membership_enrollments_rule_idx on private.membership_enrollments(rule_id);
create index membership_enrollments_sponsor_idx on private.membership_enrollments(sponsor_id);
create index membership_enrollments_confirmer_idx on private.membership_enrollments(confirmed_by);
alter table private.membership_enrollments enable row level security;
revoke all on private.membership_enrollments from public,anon,authenticated,service_role;
create policy membership_enrollments_internal_only on private.membership_enrollments for all to anon,authenticated using(false) with check(false);

alter table private.notification_jobs drop constraint notification_jobs_kind_check;
alter table private.notification_jobs add constraint notification_jobs_kind_check check(kind in
 ('support_received','event_registered','store_owner_onboarding','low_inventory_report','membership_requested','membership_confirmed'));

create function private.protect_membership_rule() returns trigger
language plpgsql security invoker set search_path='' as $$ begin
 if (to_jsonb(NEW)-array['withdrawn_at','withdrawal_reference'])<>(to_jsonb(OLD)-array['withdrawn_at','withdrawal_reference'])
 or OLD.withdrawn_at is not null or NEW.withdrawn_at is null then raise exception 'Membership rules are immutable'; end if;
 return NEW;
end $$;
create trigger membership_rules_immutable before update on private.membership_rules for each row execute function private.protect_membership_rule();

create function private.protect_membership_enrollment() returns trigger
language plpgsql security invoker set search_path='' as $$ begin
 if (to_jsonb(NEW)-array['status','paid_at','confirmed_at','external_member_id','confirmation_reference','confirmed_by'])
 <>(to_jsonb(OLD)-array['status','paid_at','confirmed_at','external_member_id','confirmation_reference','confirmed_by'])
 or (OLD.status<>'pending_payment' and OLD.status<>'pending_verification')
 or (OLD.status='pending_payment' and NEW.status not in ('pending_verification','not_applied','cancelled'))
 or (OLD.status='pending_verification' and NEW.status<>'confirmed') then raise exception 'Membership purchase and consent history are immutable'; end if;
 return NEW;
end $$;
create trigger membership_enrollments_immutable before update on private.membership_enrollments for each row execute function private.protect_membership_enrollment();

create function private.enqueue_membership_notification() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if NEW.status in ('pending_verification','confirmed') and NEW.status<>OLD.status then
  insert into private.notification_jobs(user_id,kind,reference)
  values(NEW.user_id,case when NEW.status='confirmed' then 'membership_confirmed' else 'membership_requested' end,NEW.id)
  on conflict(kind,reference,user_id) do nothing;
 end if;
 return NEW;
end $$;
create trigger membership_notification after update of status on private.membership_enrollments for each row execute function private.enqueue_membership_notification();

create or replace function private.notification_authorized(job uuid,token uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.notification_jobs j where j.id=job and j.lease=token and j.status='processing' and j.lease_until>now()
 and case when j.kind in ('membership_requested','membership_confirmed') then j.tenant_id is null and exists(
  select 1 from private.membership_enrollments e join public.orders o on o.id=e.order_id
  where e.id=j.reference and e.user_id=j.user_id and o.user_id=e.user_id
  and o.payment_status='paid' and o.status in ('paid','fulfilling','shipped','delivered')
  and ((j.kind='membership_requested' and e.status='pending_verification')
   or (j.kind='membership_confirmed' and e.status='confirmed' and exists(select 1 from public.memberships m where m.user_id=e.user_id and m.status='active' and m.external_member_id=e.external_member_id))))
 else (j.tenant_id is null or exists(select 1 from public.tenants t join public.tenant_memberships m on m.tenant_id=t.id
  where t.id=j.tenant_id and t.active and m.user_id=j.user_id and m.role='owner')) end);
$$;

create function private.membership_rule_json(r private.membership_rules) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',r.id,'packageOfferId',r.package_offer_id,'market',r.market,'tierCode',r.tier_code,'tierName',r.tier_name,
 'minimumQuantity',r.minimum_quantity,'termsVersion',r.terms_version,'termsText',r.terms_text,'codeVersion',r.code_version,'codeText',r.code_text,
 'approvalReference',r.approval_reference,'approvedBy',r.approved_by,'approvedAt',r.approved_at,'withdrawnAt',r.withdrawn_at,
 'productId',o.product_id,'packageName',o.name)
 from private.commerce_offers o where o.id=r.package_offer_id;
$$;
create function private.membership_enrollment_json(e private.membership_enrollments) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',e.id,'orderId',e.order_id,'userId',e.user_id,'market',e.market,'ruleId',e.rule_id,
 'packageOfferId',e.rule_snapshot->'packageOfferId','packageName',e.rule_snapshot->'packageName','tierCode',e.rule_snapshot->'tierCode','tierName',e.rule_snapshot->'tierName',
 'quantity',e.quantity,'sponsorId',e.sponsor_id,'sponsorMemberId',e.sponsor_member_id,'status',e.status,'createdAt',e.created_at,'consentedAt',e.consented_at,'paidAt',e.paid_at,'confirmedAt',e.confirmed_at,
 'termsVersion',e.rule_snapshot->'termsVersion','termsText',e.rule_snapshot->'termsText','codeVersion',e.rule_snapshot->'codeVersion','codeText',e.rule_snapshot->'codeText',
 'externalMemberId',e.external_member_id,'confirmationReference',e.confirmation_reference);
$$;

create function private.approve_membership_rule(p_package_offer uuid,p_tier_code text,p_tier_name text,p_minimum_quantity integer,
 p_terms_version text,p_terms_text text,p_code_version text,p_code_text text,p_reference text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o private.commerce_offers; r private.membership_rules; begin
 select * into o from private.commerce_offers where id=p_package_offer for share;
 if not found or not private.has_role(o.market,array['admin','compliance']) then raise exception 'Membership approval access denied' using errcode='42501'; end if;
 if o.kind<>'package' or o.withdrawn_at is not null or not exists(select 1 from public.products where id=o.product_id and category='Packages' and status='published') then raise exception 'An active approved package is required'; end if;
 if p_tier_code is null or p_tier_code !~ '^[A-Z0-9_-]{2,40}$' or length(btrim(p_tier_name)) not between 2 and 80
 or p_minimum_quantity is null or p_minimum_quantity not between 1 and 24
 or length(btrim(p_terms_version)) not between 3 and 100 or length(btrim(p_terms_text)) not between 20 and 12000
 or length(btrim(p_code_version)) not between 3 and 100 or length(btrim(p_code_text)) not between 20 and 12000
 or length(btrim(p_reference)) not between 5 and 200
 or p_tier_name is null or p_terms_version is null or p_terms_text is null or p_code_version is null or p_code_text is null or p_reference is null then raise exception 'Complete approved membership rules and consent documents are required'; end if;
 insert into private.membership_rules(package_offer_id,market,tier_code,tier_name,minimum_quantity,terms_version,terms_text,code_version,code_text,approval_reference,approved_by)
 values(o.id,o.market,p_tier_code,btrim(p_tier_name),p_minimum_quantity,btrim(p_terms_version),btrim(p_terms_text),btrim(p_code_version),btrim(p_code_text),btrim(p_reference),private.app_user_id()) returning * into r;
 insert into public.audit_logs(actor_id,action,entity,entity_id) values(private.app_user_id(),'MEMBERSHIP_RULE_APPROVE:'||o.market,'membership_rules',r.id::text);
 return private.membership_rule_json(r);
end $$;
create function private.withdraw_membership_rule(p_rule uuid,p_reference text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.membership_rules; begin
 select * into r from private.membership_rules where id=p_rule for update;
 if not found or not private.has_role(r.market,array['admin','compliance']) then raise exception 'Membership approval access denied' using errcode='42501'; end if;
 if p_reference is null or length(btrim(p_reference)) not between 5 and 200 then raise exception 'A withdrawal reference is required'; end if;
 if r.withdrawn_at is null then
  update private.membership_rules set withdrawn_at=clock_timestamp(),withdrawal_reference=btrim(p_reference) where id=r.id returning * into r;
  insert into public.audit_logs(actor_id,action,entity,entity_id) values(private.app_user_id(),'MEMBERSHIP_RULE_WITHDRAW:'||r.market,'membership_rules',r.id::text);
 end if;
 return private.membership_rule_json(r);
end $$;

-- Keep the existing calculation contract intact. Qualified quotes additionally
-- bind the exact rule/legal content; an unqualified quote preserves its old hash.
alter function private.plan_commerce_checkout(text,jsonb,text,boolean) rename to plan_commerce_checkout_without_membership;
create function private.plan_commerce_checkout(p_market text,p_items jsonb,p_code text,p_order boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare plan jsonb; choice jsonb:=null; r record; n integer:=0; uid uuid:=private.app_user_id(); begin
 plan:=private.plan_commerce_checkout_without_membership(p_market,p_items,p_code,p_order);
 if not exists(select 1 from public.memberships where user_id=uid)
 and not exists(select 1 from private.membership_enrollments where user_id=uid and status in ('pending_verification','confirmed')) then
  for r in select mr as rule, o.product_id, o.name as package_name,(item->>'quantity')::integer as quantity
   from private.membership_rules mr join private.commerce_offers o on o.id=mr.package_offer_id
   join jsonb_array_elements(plan->'quote'->'items') item on (item->>'packageOfferId')::uuid=o.id
   where mr.market=p_market and mr.withdrawn_at is null and o.withdrawn_at is null and (item->>'quantity')::integer>=mr.minimum_quantity
   order by mr.id for share of mr,o loop
   n:=n+1;
   choice:=jsonb_build_object('ruleId',(r.rule).id,'packageOfferId',(r.rule).package_offer_id,'productId',r.product_id,'packageName',r.package_name,
    'tierCode',(r.rule).tier_code,'tierName',(r.rule).tier_name,'minimumQuantity',(r.rule).minimum_quantity,
    'termsVersion',(r.rule).terms_version,'termsText',(r.rule).terms_text,'codeVersion',(r.rule).code_version,'codeText',(r.rule).code_text);
  end loop;
  if n>1 then raise exception 'Choose one qualifying membership package per order'; end if;
 end if;
 plan:=jsonb_set(plan,'{quote}',(plan->'quote')||jsonb_build_object('membership',choice));
 if choice is not null then
  plan:=jsonb_set(plan,'{quote,quoteHash}',to_jsonb(encode(sha256(convert_to(jsonb_build_object('commerceHash',plan->'quote'->>'quoteHash','membership',choice)::text,'UTF8')),'hex')));
 end if;
 return plan;
end $$;
-- Rebind the existing quote body after renaming its implementation dependency.
create or replace function private.quote_commerce_checkout(m text,items jsonb,promotion_code text default null) returns jsonb
language sql security definer set search_path='' as $$ select private.plan_commerce_checkout(m,items,promotion_code,false)->'quote'; $$;
create or replace function public.quote_commerce_checkout(m text,items jsonb,promotion_code text default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.quote_commerce_checkout(m,items,promotion_code); $$;

alter function private.create_commerce_order(text,jsonb,jsonb,uuid,text,text,text) rename to create_commerce_order_without_membership;
create function private.create_membership_commerce_order(m text,items jsonb,delivery jsonb,key uuid,terms text,promotion_code text default null,quote_hash text default null,membership_consent jsonb default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.app_user_id(); existing public.orders; e private.membership_enrollments; plan jsonb; choice jsonb; oid uuid; consent_digest text; quantity integer; sponsor_member text; begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if key is null then raise exception 'An order retry key is required'; end if;
 if membership_consent is not null then
  if jsonb_typeof(membership_consent) is distinct from 'object' or not(membership_consent ?& array['ruleId','termsVersion','codeVersion','accepted'])
   or membership_consent-array['ruleId','termsVersion','codeVersion','accepted']<>'{}'::jsonb
   or membership_consent->'accepted' is distinct from 'true'::jsonb then raise exception 'Membership consent is incomplete'; end if;
  consent_digest:=encode(sha256(convert_to(membership_consent::text,'UTF8')),'hex');
 end if;
 -- Same lock as legacy creation, so replay and first insertion cannot split.
 perform pg_advisory_xact_lock(hashtextextended(uid::text||key::text,0));
 select * into existing from public.orders where user_id=uid and idempotency_key=key;
 if found then
  select * into e from private.membership_enrollments where order_id=existing.id;
  if (e.id is null and membership_consent is not null) or (e.id is not null and e.consent_hash is distinct from consent_digest) then raise exception 'Order retry must use its original membership consent'; end if;
  -- Legacy request hashes and exact original retries remain valid even after
  -- rules are withdrawn or membership is confirmed. No current requalification.
  return private.create_commerce_order_without_membership(m,items,delivery,key,terms,promotion_code,quote_hash);
 end if;
 -- Acquire the voucher's exclusive creation lock from the outset. Taking its
 -- quotation SHARE lock then upgrading to UPDATE can deadlock simultaneous carts.
 plan:=private.plan_commerce_checkout(m,items,promotion_code,true); choice:=plan->'quote'->'membership';
 if choice is not null and choice<>'null'::jsonb then
  if membership_consent is null or membership_consent->>'ruleId' is distinct from choice->>'ruleId'
   or membership_consent->>'termsVersion' is distinct from choice->>'termsVersion'
   or membership_consent->>'codeVersion' is distinct from choice->>'codeVersion' then raise exception 'Current membership terms and Code of Conduct consent are required'; end if;
  if quote_hash is null then raise exception 'Review the current membership quote before ordering'; end if;
 elsif membership_consent is not null then raise exception 'Membership qualification changed. Review the current quote.' using errcode='40001'; end if;
 oid:=private.create_commerce_order_without_membership(m,items,delivery,key,terms,promotion_code,quote_hash);
 if choice is not null and choice<>'null'::jsonb then
  select (item->>'quantity')::integer into quantity from jsonb_array_elements(plan->'quote'->'items') item where item->>'productId'=choice->>'productId';
  select d.external_member_id into sponsor_member from public.orders o join public.distributor_profiles d on d.user_id=o.sponsor_id where o.id=oid;
  insert into private.membership_enrollments(order_id,user_id,market,rule_id,sponsor_id,sponsor_member_id,quantity,rule_snapshot,consent,consent_hash)
   select oid,uid,m,(choice->>'ruleId')::uuid,o.sponsor_id,sponsor_member,quantity,choice,membership_consent,consent_digest from public.orders o where o.id=oid;
 end if;
 return oid;
end $$;
create function public.create_membership_commerce_order(m text,items jsonb,delivery jsonb,key uuid,terms text,promotion_code text default null,quote_hash text default null,membership_consent jsonb default null) returns uuid
language sql security invoker set search_path='' as $$ select private.create_membership_commerce_order(m,items,delivery,key,terms,promotion_code,quote_hash,membership_consent); $$;
-- Every older exposed order entry point is rebound to the membership guard.
create function private.create_commerce_order(m text,items jsonb,delivery jsonb,key uuid,terms text,promotion_code text default null,quote_hash text default null) returns uuid
language sql security definer set search_path='' as $$ select private.create_membership_commerce_order(m,items,delivery,key,terms,promotion_code,quote_hash,null); $$;
create or replace function public.create_commerce_order(m text,items jsonb,delivery jsonb,key uuid,terms text,promotion_code text default null,quote_hash text default null) returns uuid
language sql security invoker set search_path='' as $$ select private.create_commerce_order(m,items,delivery,key,terms,promotion_code,quote_hash); $$;
create or replace function private.checkout(m text,items jsonb,delivery jsonb,key uuid,terms text) returns uuid
language sql security definer set search_path='' as $$ select private.create_membership_commerce_order(m,items,delivery,key,terms,null,null,null); $$;
create or replace function public.create_order(m text,items jsonb,delivery jsonb,key uuid,terms text) returns uuid
language sql security invoker set search_path='' as $$ select private.checkout(m,items,delivery,key,terms); $$;

create function private.update_membership_enrollment() returns trigger
language plpgsql security definer set search_path='' as $$
declare e private.membership_enrollments; begin
 -- Late paid/review orders set payment_status alone. They do not qualify.
 if not exists(select 1 from private.membership_enrollments where order_id=NEW.id and status='pending_payment') then return NEW; end if;
 if NEW.status='paid' and NEW.payment_status='paid' then
  perform pg_advisory_xact_lock(hashtextextended('membership:'||NEW.user_id::text,0));
  select * into e from private.membership_enrollments where order_id=NEW.id for update;
  if e.status<>'pending_payment' then return NEW; end if;
  if exists(select 1 from public.memberships where user_id=NEW.user_id)
   or exists(select 1 from private.membership_enrollments where user_id=NEW.user_id and status in ('pending_verification','confirmed')) then
   update private.membership_enrollments set status='not_applied',paid_at=clock_timestamp() where id=e.id;
  else
   update private.membership_enrollments set status='pending_verification',paid_at=clock_timestamp() where id=e.id;
  end if;
 elsif NEW.status='cancelled' and NEW.payment_status<>'paid' then
  update private.membership_enrollments set status='cancelled' where order_id=NEW.id and status='pending_payment';
 end if;
 return NEW;
end $$;
create trigger membership_paid_order after update of status,payment_status on public.orders for each row execute function private.update_membership_enrollment();

create function private.confirm_membership_enrollment(p_enrollment uuid,p_external_member_id text,p_reference text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e private.membership_enrollments; external_id text:=btrim(p_external_member_id); reference text:=btrim(p_reference); begin
 select * into e from private.membership_enrollments where id=p_enrollment;
 if not found or not private.has_role(e.market,array['admin','compliance']) then raise exception 'Membership confirmation access denied' using errcode='42501'; end if;
 if external_id is null or length(external_id) not between 2 and 128 or external_id ~ '[[:cntrl:]]'
  or reference is null or length(reference) not between 5 and 200 then raise exception 'A verified RIWAY member ID and confirmation reference are required'; end if;
 -- Payment and confirmation take the same per-user lock before enrollment rows.
 perform pg_advisory_xact_lock(hashtextextended('membership:'||e.user_id::text,0));
 select * into e from private.membership_enrollments where id=p_enrollment for update;
 if e.status='confirmed' then
  if e.external_member_id<>external_id or e.confirmation_reference<>reference then raise exception 'Membership was already confirmed with different data'; end if;
  return private.membership_enrollment_json(e);
 end if;
 if e.status<>'pending_verification' or not exists(select 1 from public.orders where id=e.order_id and status in ('paid','fulfilling','shipped','delivered') and payment_status='paid') then raise exception 'A verified paid membership purchase is required'; end if;
 if exists(select 1 from public.memberships where user_id=e.user_id) then raise exception 'Existing membership cannot be replaced by enrolment'; end if;
 insert into public.memberships(user_id,external_member_id,tier,status,synced_at) values(e.user_id,external_id,e.rule_snapshot->>'tierName','active',clock_timestamp());
 update private.membership_enrollments set status='confirmed',external_member_id=external_id,confirmation_reference=reference,confirmed_by=private.app_user_id(),confirmed_at=clock_timestamp() where id=e.id returning * into e;
 insert into public.audit_logs(actor_id,action,entity,entity_id) values(private.app_user_id(),'MEMBERSHIP_CONFIRM:'||e.market,'membership_enrollments',e.id::text);
 return private.membership_enrollment_json(e);
end $$;

create function private.staff_memberships(page integer default 1) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare allowed text[]; rules jsonb; enrollments jsonb; more boolean; begin
 if page is null or page not between 1 and 1000 then raise exception 'Invalid membership page'; end if;
 select array_agg(code order by array_position(array['PH','SG','MY'],code)) into allowed from public.markets where private.has_role(code,array['admin','compliance']);
 if coalesce(cardinality(allowed),0)=0 then raise exception 'Membership access denied' using errcode='42501'; end if;
 select coalesce(jsonb_agg(private.membership_rule_json(row.item) order by (row.item).approved_at desc,(row.item).id),'[]'::jsonb) into rules
 from (select r as item from private.membership_rules r where r.market=any(allowed) order by r.approved_at desc,r.id limit 20 offset ((page-1)*20)) row;
 select coalesce(jsonb_agg(private.membership_enrollment_json(row.item) order by (row.item).created_at desc,(row.item).id),'[]'::jsonb) into enrollments
 from (select e as item from private.membership_enrollments e where e.market=any(allowed) order by e.created_at desc,e.id limit 20 offset ((page-1)*20)) row;
 more:=exists(select 1 from private.membership_rules where market=any(allowed) order by approved_at desc,id limit 1 offset (page*20))
  or exists(select 1 from private.membership_enrollments where market=any(allowed) order by created_at desc,id limit 1 offset (page*20));
 return jsonb_build_object('rules',rules,'enrollments',enrollments,'markets',allowed,'page',page,'hasMore',more);
end $$;
create function private.my_memberships(page integer default 1) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=private.app_user_id(); membership jsonb; enrollments jsonb; begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if page is null or page not between 1 and 1000 then raise exception 'Invalid membership page'; end if;
 select jsonb_build_object('externalMemberId',external_member_id,'tier',tier,'status',status,'syncedAt',synced_at) into membership from public.memberships where user_id=uid;
 select coalesce(jsonb_agg(private.membership_enrollment_json(row.item) order by (row.item).created_at desc,(row.item).id),'[]'::jsonb) into enrollments
 from (select e as item from private.membership_enrollments e where e.user_id=uid order by e.created_at desc,e.id limit 20 offset ((page-1)*20)) row;
 return jsonb_build_object('membership',membership,'enrollments',enrollments,'page',page,
 'hasMore',exists(select 1 from private.membership_enrollments where user_id=uid order by created_at desc,id limit 1 offset (page*20)));
end $$;

create function public.approve_membership_rule(p_package_offer uuid,p_tier_code text,p_tier_name text,p_minimum_quantity integer,p_terms_version text,p_terms_text text,p_code_version text,p_code_text text,p_reference text) returns jsonb
language sql security invoker set search_path='' as $$ select private.approve_membership_rule(p_package_offer,p_tier_code,p_tier_name,p_minimum_quantity,p_terms_version,p_terms_text,p_code_version,p_code_text,p_reference); $$;
create function public.withdraw_membership_rule(p_rule uuid,p_reference text) returns jsonb
language sql security invoker set search_path='' as $$ select private.withdraw_membership_rule(p_rule,p_reference); $$;
create function public.confirm_membership_enrollment(p_enrollment uuid,p_external_member_id text,p_reference text) returns jsonb
language sql security invoker set search_path='' as $$ select private.confirm_membership_enrollment(p_enrollment,p_external_member_id,p_reference); $$;
create function public.staff_memberships(page integer default 1) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.staff_memberships(page); $$;
create function public.my_memberships(page integer default 1) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.my_memberships(page); $$;

revoke all on function private.protect_membership_rule(),private.protect_membership_enrollment(),private.membership_rule_json(private.membership_rules),
 private.membership_enrollment_json(private.membership_enrollments),private.update_membership_enrollment(),private.enqueue_membership_notification(),
 private.plan_commerce_checkout_without_membership(text,jsonb,text,boolean),private.plan_commerce_checkout(text,jsonb,text,boolean),
 private.create_commerce_order_without_membership(text,jsonb,jsonb,uuid,text,text,text),private.create_commerce_order(text,jsonb,jsonb,uuid,text,text,text),
 private.create_membership_commerce_order(text,jsonb,jsonb,uuid,text,text,text,jsonb),public.create_membership_commerce_order(text,jsonb,jsonb,uuid,text,text,text,jsonb),
 private.approve_membership_rule(uuid,text,text,integer,text,text,text,text,text),public.approve_membership_rule(uuid,text,text,integer,text,text,text,text,text),
 private.withdraw_membership_rule(uuid,text),public.withdraw_membership_rule(uuid,text),private.confirm_membership_enrollment(uuid,text,text),public.confirm_membership_enrollment(uuid,text,text),
 private.staff_memberships(integer),public.staff_memberships(integer),private.my_memberships(integer),public.my_memberships(integer)
 from public,anon,authenticated,service_role;
grant execute on function private.create_commerce_order(text,jsonb,jsonb,uuid,text,text,text),
 private.create_membership_commerce_order(text,jsonb,jsonb,uuid,text,text,text,jsonb),public.create_membership_commerce_order(text,jsonb,jsonb,uuid,text,text,text,jsonb),
 private.approve_membership_rule(uuid,text,text,integer,text,text,text,text,text),public.approve_membership_rule(uuid,text,text,integer,text,text,text,text,text),
 private.withdraw_membership_rule(uuid,text),public.withdraw_membership_rule(uuid,text),private.confirm_membership_enrollment(uuid,text,text),public.confirm_membership_enrollment(uuid,text,text),
 private.staff_memberships(integer),public.staff_memberships(integer),private.my_memberships(integer),public.my_memberships(integer) to authenticated;
