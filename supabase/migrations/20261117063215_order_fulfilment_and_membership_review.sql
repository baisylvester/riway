-- Order fulfilment v1. Market operations staff move paid orders through packing,
-- dispatch and delivery one step at a time. Courier rate, label and tracking APIs
-- remain a separate integration: carrier and tracking details are entered by
-- RIWAY staff. Stock was already consumed at payment, so no step changes stock.
create table private.order_fulfilment_events (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id),
 market text not null references public.markets(code),
 from_status text not null check(from_status in ('paid','fulfilling','shipped')),
 to_status text not null check(to_status in ('fulfilling','shipped','delivered')),
 method text check(method in ('courier','collection')),
 carrier text check(length(carrier) between 2 and 80 and carrier !~ '[[:cntrl:]]'),
 tracking_number text check(tracking_number ~ '^[A-Za-z0-9][A-Za-z0-9 -]{2,62}[A-Za-z0-9]$'),
 tracking_url text check(length(tracking_url)<=500 and tracking_url ~ '^https://[^[:space:][:cntrl:]]+$'),
 -- Line breaks are allowed in notes; every other control character is refused.
 note text check(length(note) between 1 and 500 and note !~ '[\x01-\x09\x0b-\x1f\x7f]'),
 actor_id uuid not null references public.app_users(id),
 created_at timestamptz not null default clock_timestamp(),
 unique(order_id,to_status),
 check((to_status='shipped')=(method is not null)),
 check(method is distinct from 'courier' or (carrier is not null and tracking_number is not null)),
 check(method is distinct from 'collection' or (note is not null and carrier is null and tracking_number is null and tracking_url is null)),
 check(to_status='shipped' or (carrier is null and tracking_number is null and tracking_url is null))
);
create index order_fulfilment_events_market_idx on private.order_fulfilment_events(market,created_at desc);
create index order_fulfilment_events_actor_idx on private.order_fulfilment_events(actor_id);
alter table private.order_fulfilment_events enable row level security;
revoke all on private.order_fulfilment_events from public,anon,authenticated,service_role;
create policy order_fulfilment_events_internal_only on private.order_fulfilment_events for all to anon,authenticated using(false) with check(false);

alter table private.notification_jobs drop constraint notification_jobs_kind_check;
alter table private.notification_jobs add constraint notification_jobs_kind_check check(kind in
 ('support_received','event_registered','store_owner_onboarding','low_inventory_report','membership_requested','membership_confirmed',
  'order_shipped','order_delivered'));

create function private.order_fulfilment_json(p_order uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('orderId',o.id,'market',o.market,'status',o.status,'paymentStatus',o.payment_status,
  'events',coalesce((select jsonb_agg(jsonb_build_object('fromStatus',e.from_status,'toStatus',e.to_status,'method',e.method,
   'carrier',e.carrier,'trackingNumber',e.tracking_number,'trackingUrl',e.tracking_url,'note',e.note,'createdAt',e.created_at)
   order by e.created_at,e.id) from private.order_fulfilment_events e where e.order_id=o.id),'[]'::jsonb))
 from public.orders o where o.id=p_order;
$$;

create function private.advance_order_fulfilment(p_order uuid,p_status text,p_method text default null,p_carrier text default null,
 p_tracking_number text default null,p_tracking_url text default null,p_note text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.orders; e private.order_fulfilment_events; expected text;
 v_method text:=nullif(btrim(p_method),''); v_carrier text:=nullif(btrim(p_carrier),''); v_tracking text:=nullif(btrim(p_tracking_number),'');
 v_url text:=nullif(btrim(p_tracking_url),''); v_note text:=nullif(btrim(p_note),''); begin
 select * into o from public.orders where id=p_order;
 if not found or not private.has_role(o.market,array['admin','operations']) then raise exception 'Order fulfilment access denied' using errcode='42501'; end if;
 select * into o from public.orders where id=p_order for update;
 -- An exact replay returns the current state; a conflicting replay is refused.
 select * into e from private.order_fulfilment_events where order_id=o.id and to_status=p_status;
 if found then
  if e.method is distinct from v_method or e.carrier is distinct from v_carrier or e.tracking_number is distinct from v_tracking
   or e.tracking_url is distinct from v_url or e.note is distinct from v_note then raise exception 'This fulfilment step was already recorded with different details'; end if;
  return private.order_fulfilment_json(o.id);
 end if;
 expected:=case p_status when 'fulfilling' then 'paid' when 'shipped' then 'fulfilling' when 'delivered' then 'shipped' end;
 if expected is null then raise exception 'Unknown fulfilment step'; end if;
 if o.payment_status<>'paid' then raise exception 'Only paid orders can be fulfilled'; end if;
 if o.status<>expected then raise exception 'This order is not ready for that fulfilment step' using errcode='40001'; end if;
 if p_status='shipped' then
  if v_method is null or v_method not in ('courier','collection') then raise exception 'Choose courier delivery or service-centre collection'; end if;
  if v_method='courier' and (v_carrier is null or v_tracking is null) then raise exception 'Courier dispatch requires a carrier and tracking number'; end if;
  if v_method='collection' and (v_note is null or v_carrier is not null or v_tracking is not null or v_url is not null) then raise exception 'Collection requires service-centre details only'; end if;
 elsif v_method is not null or v_carrier is not null or v_tracking is not null or v_url is not null then
  raise exception 'Carrier details belong to the dispatch step';
 end if;
 insert into private.order_fulfilment_events(order_id,market,from_status,to_status,method,carrier,tracking_number,tracking_url,note,actor_id)
 values(o.id,o.market,o.status,p_status,v_method,v_carrier,v_tracking,v_url,v_note,private.app_user_id()) returning * into e;
 update public.orders set status=p_status where id=o.id;
 insert into public.audit_logs(actor_id,action,entity,entity_id) values(private.app_user_id(),'ORDER_FULFILMENT_'||upper(p_status)||':'||o.market,'orders',o.id::text);
 if p_status in ('shipped','delivered') then
  insert into private.notification_jobs(user_id,kind,reference) values(o.user_id,'order_'||p_status,e.id) on conflict(kind,reference,user_id) do nothing;
 end if;
 return private.order_fulfilment_json(o.id);
end $$;

-- The order's owner and the market's operations staff can read its fulfilment history.
create function private.order_fulfilment(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare o public.orders; begin
 select * into o from public.orders where id=p_order;
 if not found or (o.user_id is distinct from private.app_user_id() and not private.has_role(o.market,array['admin','operations'])) then
  raise exception 'Order access denied' using errcode='42501';
 end if;
 return private.order_fulfilment_json(o.id);
end $$;

create function public.advance_order_fulfilment(p_order uuid,p_status text,p_method text default null,p_carrier text default null,
 p_tracking_number text default null,p_tracking_url text default null,p_note text default null) returns jsonb
language sql security invoker set search_path='' as $$
 select private.advance_order_fulfilment(p_order,p_status,p_method,p_carrier,p_tracking_number,p_tracking_url,p_note); $$;
create function public.order_fulfilment(p_order uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.order_fulfilment(p_order); $$;

-- Customer shipping notices stay valid only while the order still reflects them.
create or replace function private.notification_authorized(job uuid,token uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.notification_jobs j where j.id=job and j.lease=token and j.status='processing' and j.lease_until>now()
 and case when j.kind in ('membership_requested','membership_confirmed') then j.tenant_id is null and exists(
  select 1 from private.membership_enrollments e join public.orders o on o.id=e.order_id
  where e.id=j.reference and e.user_id=j.user_id and o.user_id=e.user_id
  and o.payment_status='paid' and o.status in ('paid','fulfilling','shipped','delivered')
  and ((j.kind='membership_requested' and e.status='pending_verification')
   or (j.kind='membership_confirmed' and e.status='confirmed' and exists(select 1 from public.memberships m where m.user_id=e.user_id and m.status='active' and m.external_member_id=e.external_member_id))))
 when j.kind in ('order_shipped','order_delivered') then j.tenant_id is null and exists(
  select 1 from private.order_fulfilment_events e join public.orders o on o.id=e.order_id
  where e.id=j.reference and o.user_id=j.user_id and o.payment_status='paid'
  and ((j.kind='order_shipped' and e.to_status='shipped' and o.status in ('shipped','delivered'))
   or (j.kind='order_delivered' and e.to_status='delivered' and o.status='delivered')))
 else (j.tenant_id is null or exists(select 1 from public.tenants t join public.tenant_memberships m on m.tenant_id=t.id
  where t.id=j.tenant_id and t.active and m.user_id=j.user_id and m.role='owner')) end);
$$;

-- Membership review: an enrolment awaiting RIWAY confirmation can now also be
-- rejected when staff cannot match it to a RIWAY record. Rejection frees the
-- customer to enrol again. It does not refund or cancel the paid order.
alter table private.membership_enrollments drop constraint membership_enrollments_status_check;
alter table private.membership_enrollments add constraint membership_enrollments_status_check
 check(status in ('pending_payment','pending_verification','confirmed','not_applied','cancelled','rejected'));
alter table private.membership_enrollments
 add column rejected_at timestamptz,
 add column rejection_reference text check(length(rejection_reference) between 5 and 200),
 add column rejected_by uuid references public.app_users(id),
 add constraint membership_enrollments_rejection_check
  check((status='rejected')=(rejected_at is not null and rejection_reference is not null and rejected_by is not null));
create index membership_enrollments_rejecter_idx on private.membership_enrollments(rejected_by);

create or replace function private.protect_membership_enrollment() returns trigger
language plpgsql security invoker set search_path='' as $$ begin
 if (to_jsonb(NEW)-array['status','paid_at','confirmed_at','external_member_id','confirmation_reference','confirmed_by','rejected_at','rejection_reference','rejected_by'])
 <>(to_jsonb(OLD)-array['status','paid_at','confirmed_at','external_member_id','confirmation_reference','confirmed_by','rejected_at','rejection_reference','rejected_by'])
 or (OLD.status<>'pending_payment' and OLD.status<>'pending_verification')
 or (OLD.status='pending_payment' and NEW.status not in ('pending_verification','not_applied','cancelled'))
 or (OLD.status='pending_verification' and NEW.status not in ('confirmed','rejected')) then raise exception 'Membership purchase and consent history are immutable'; end if;
 return NEW;
end $$;

create or replace function private.membership_enrollment_json(e private.membership_enrollments) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',e.id,'orderId',e.order_id,'userId',e.user_id,'market',e.market,'ruleId',e.rule_id,
 'packageOfferId',e.rule_snapshot->'packageOfferId','packageName',e.rule_snapshot->'packageName','tierCode',e.rule_snapshot->'tierCode','tierName',e.rule_snapshot->'tierName',
 'quantity',e.quantity,'sponsorId',e.sponsor_id,'sponsorMemberId',e.sponsor_member_id,'status',e.status,'createdAt',e.created_at,'consentedAt',e.consented_at,'paidAt',e.paid_at,'confirmedAt',e.confirmed_at,
 'termsVersion',e.rule_snapshot->'termsVersion','termsText',e.rule_snapshot->'termsText','codeVersion',e.rule_snapshot->'codeVersion','codeText',e.rule_snapshot->'codeText',
 'externalMemberId',e.external_member_id,'confirmationReference',e.confirmation_reference,
 'rejectedAt',e.rejected_at,'rejectionReference',e.rejection_reference);
$$;

create function private.reject_membership_enrollment(p_enrollment uuid,p_reference text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e private.membership_enrollments; reference text:=btrim(p_reference); begin
 select * into e from private.membership_enrollments where id=p_enrollment;
 if not found or not private.has_role(e.market,array['admin','compliance']) then raise exception 'Membership review access denied' using errcode='42501'; end if;
 if reference is null or length(reference) not between 5 and 200 or reference ~ '[[:cntrl:]]' then raise exception 'A review reference is required'; end if;
 -- Same per-user lock as payment and confirmation, so they cannot interleave.
 perform pg_advisory_xact_lock(hashtextextended('membership:'||e.user_id::text,0));
 select * into e from private.membership_enrollments where id=p_enrollment for update;
 if e.status='rejected' then
  if e.rejection_reference<>reference then raise exception 'Membership was already rejected with a different reference'; end if;
  return private.membership_enrollment_json(e);
 end if;
 if e.status<>'pending_verification' then raise exception 'Only an enrolment awaiting RIWAY confirmation can be rejected'; end if;
 update private.membership_enrollments set status='rejected',rejected_at=clock_timestamp(),rejection_reference=reference,rejected_by=private.app_user_id()
  where id=e.id returning * into e;
 insert into public.audit_logs(actor_id,action,entity,entity_id) values(private.app_user_id(),'MEMBERSHIP_REJECT:'||e.market,'membership_enrollments',e.id::text);
 return private.membership_enrollment_json(e);
end $$;
create function public.reject_membership_enrollment(p_enrollment uuid,p_reference text) returns jsonb
language sql security invoker set search_path='' as $$ select private.reject_membership_enrollment(p_enrollment,p_reference); $$;

revoke all on function private.order_fulfilment_json(uuid),
 private.advance_order_fulfilment(uuid,text,text,text,text,text,text),public.advance_order_fulfilment(uuid,text,text,text,text,text,text),
 private.order_fulfilment(uuid),public.order_fulfilment(uuid),
 private.reject_membership_enrollment(uuid,text),public.reject_membership_enrollment(uuid,text)
 from public,anon,authenticated,service_role;
grant execute on function
 private.advance_order_fulfilment(uuid,text,text,text,text,text,text),public.advance_order_fulfilment(uuid,text,text,text,text,text,text),
 private.order_fulfilment(uuid),public.order_fulfilment(uuid),
 private.reject_membership_enrollment(uuid,text),public.reject_membership_enrollment(uuid,text)
 to authenticated;
