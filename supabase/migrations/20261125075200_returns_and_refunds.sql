-- Return intake, explicit market policy approval and a durable refund ledger.
-- No actual market policy, gateway capability or legal document is seeded.
create table private.refund_policies(
 id uuid primary key default gen_random_uuid(),market text not null references public.markets(code),version text not null check(length(btrim(version))between 3 and 120),
 terms text not null check(length(btrim(terms))between 20 and 8000),allow_partial boolean not null,
 approval_reference text not null check(length(btrim(approval_reference))between 5 and 200),approved_by uuid not null references public.app_users(id),approved_at timestamptz not null default clock_timestamp(),withdrawn_at timestamptz,unique(market,version)
);
create unique index refund_policy_active_idx on private.refund_policies(market)where withdrawn_at is null;
create index refund_policy_actor_idx on private.refund_policies(approved_by);
create table private.return_cases(
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),user_id uuid not null references public.app_users(id),market text not null references public.markets(code),
 kind text not null check(kind in('return','refund','paid_cancellation')),reason text not null check(length(btrim(reason))between 5 and 1000),
 status text not null default 'open'check(status in('open','in_review','closed','rejected')),resolution text,revision integer not null default 0,created_at timestamptz not null default clock_timestamp()
);
create unique index return_case_open_idx on private.return_cases(order_id)where status in('open','in_review');
create index return_case_owner_idx on private.return_cases(user_id,created_at desc);
create index return_case_market_idx on private.return_cases(market,created_at desc);
create table private.order_refunds(
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),case_id uuid not null references private.return_cases(id),policy_id uuid not null references private.refund_policies(id),
 approval_reference text not null check(length(btrim(approval_reference))between 5 and 200),approved_by uuid not null references public.app_users(id),
 amount_minor bigint not null check(amount_minor>0),currency text not null check(currency in('PHP','SGD','MYR')),
 gateway text not null check(gateway in('stripe','xendit')),livemode boolean not null,provider_payment_id text not null,sub_account_id text,
 phase text not null default 'approved'check(phase in('approved','processing','pending','succeeded','failed','review','cancelled')),
 provider_refund_id text,candidate_provider_id text,attempts integer not null default 0,lease uuid,lease_until timestamptz,
 first_dispatched_at timestamptz,next_check_at timestamptz not null default clock_timestamp(),last_error_code text,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),unique(order_id,approval_reference)
);
create unique index refund_provider_id_idx on private.order_refunds(gateway,livemode,coalesce(sub_account_id,''),provider_refund_id)where provider_refund_id is not null;
create index refund_case_idx on private.order_refunds(case_id);
create index refund_policy_idx on private.order_refunds(policy_id);
create index refund_approver_idx on private.order_refunds(approved_by);
create index refund_pending_idx on private.order_refunds(next_check_at)where phase in('approved','processing','pending','review');
create table private.refund_line_allocations(
 refund_id uuid not null references private.order_refunds(id),item_id uuid not null references public.order_items(id),amount_minor bigint not null check(amount_minor>0),primary key(refund_id,item_id)
);
create index refund_allocation_item_idx on private.refund_line_allocations(item_id);
create table private.return_stock_receipts(
 id uuid primary key default gen_random_uuid(),case_id uuid not null references private.return_cases(id),order_id uuid not null references public.orders(id),
 product_id uuid not null references public.products(id),quantity integer not null check(quantity>0),disposition text not null check(disposition in('restock','quarantine','discard')),
 reference text not null check(length(btrim(reference))between 5 and 200),actor_id uuid not null references public.app_users(id),created_at timestamptz not null default clock_timestamp(),unique(order_id,reference)
);
create index return_receipt_case_idx on private.return_stock_receipts(case_id);
create index return_receipt_product_idx on private.return_stock_receipts(product_id);
create index return_receipt_actor_idx on private.return_stock_receipts(actor_id);
do $$declare t text;begin foreach t in array array['refund_policies','return_cases','order_refunds','refund_line_allocations','return_stock_receipts']loop
 execute format('alter table private.%I enable row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 execute format('create policy internal_only on private.%I for all using(false) with check(false)',t);
end loop;end $$;
alter table public.orders add column refunded_minor bigint not null default 0 check(refunded_minor between 0 and total_minor);
alter table public.orders add column refund_policy_snapshot jsonb;
create function private.protect_refund_policy()returns trigger language plpgsql set search_path='' as $$begin
 if (to_jsonb(NEW)-'withdrawn_at')is distinct from(to_jsonb(OLD)-'withdrawn_at')or OLD.withdrawn_at is not null or NEW.withdrawn_at is null then raise exception 'Approved refund policies are immutable';end if;return NEW;
end $$;

-- Transactional status notices contain only a signed-in account link and
-- status, never the customer's reason, address or provider identifiers.
alter table private.notification_jobs drop constraint notification_jobs_kind_check;
alter table private.notification_jobs add constraint notification_jobs_kind_check check(kind in
 ('support_received','event_registered','inventory_alert','store_owner_onboarding','low_inventory_report','membership_requested','membership_confirmed',
 'order_shipped','order_delivered','sales_report','order_confirmed','corporate_low_stock','consultation_update','consultation_reminder','reorder_reminder','return_update'));
create function private.queue_return_notice()returns trigger language plpgsql security definer set search_path='' as $$
declare o public.orders;stage text;case_id uuid;revision integer;context jsonb;begin
 if TG_TABLE_NAME='return_cases'then
  if TG_OP='INSERT'then stage:='received';
  elsif NEW.status in('closed','rejected')and NEW.status is distinct from OLD.status then stage:='resolved';
  else return NEW;end if;
  case_id:=NEW.id;revision:=NEW.revision;
  context:=jsonb_build_object('orderId',NEW.order_id,'caseId',case_id,'stage',stage,'revision',revision);
 else
  if NEW.phase<>'succeeded'or NEW.phase is not distinct from OLD.phase then return NEW;end if;
  stage:='processed';case_id:=NEW.case_id;revision:=0;
  context:=jsonb_build_object('orderId',NEW.order_id,'caseId',case_id,'stage',stage,'refundId',NEW.id,'amountMinor',NEW.amount_minor,'currency',NEW.currency);
 end if;
 select * into o from public.orders where id=NEW.order_id;
 insert into private.notification_jobs(user_id,kind,reference,context)values(o.user_id,'return_update',md5('return-notice/'||NEW.id::text||'/'||stage||'/'||revision::text)::uuid,context)on conflict(kind,reference,user_id)do nothing;
 return NEW;
end $$;
create trigger return_case_notice after insert or update of status on private.return_cases for each row execute function private.queue_return_notice();
create trigger refund_processed_notice after update of phase on private.order_refunds for each row execute function private.queue_return_notice();
alter function private.notification_authorized(uuid,uuid)rename to notification_authorized_before_returns;
create function private.notification_authorized(job uuid,token uuid)returns boolean language sql stable security definer set search_path='' as $$
 select case when(select kind from private.notification_jobs where id=job)='return_update'then exists(
 select 1 from private.notification_jobs j join private.return_cases c on c.id=(j.context->>'caseId')::uuid join public.orders o on o.id=c.order_id
 where j.id=job and j.lease=token and j.status='processing'and j.lease_until>now()and j.user_id=o.user_id and j.context->>'orderId'=o.id::text and
 (j.context->>'stage'='received'or(j.context->>'stage'='resolved'and c.status in('closed','rejected')and(j.context->>'revision')::integer=c.revision)
 or(j.context->>'stage'='processed'and exists(select 1 from private.order_refunds r where r.id=(j.context->>'refundId')::uuid and r.case_id=c.id and r.phase='succeeded'))))
 else private.notification_authorized_before_returns(job,token)end
$$;
revoke all on function private.queue_return_notice(),private.notification_authorized_before_returns(uuid,uuid),private.notification_authorized(uuid,uuid)from public,anon,authenticated,service_role;
grant execute on function private.notification_authorized(uuid,uuid)to service_role;

-- Do not infer replenishment timing from a disputed/returned purchase.
do $$declare signature regprocedure;definition text;needle text:='o.payment_status=''paid''';begin
 foreach signature in array array['private.queue_reorder_reminders()'::regprocedure,'private.notification_authorized_before_returns(uuid,uuid)'::regprocedure]loop
  definition:=pg_get_functiondef(signature);
  if strpos(definition,needle)=0 then raise exception 'Unexpected reorder refund-suppression baseline';end if;
  definition:=replace(definition,needle,needle||' and o.refunded_minor=0 and not exists(select 1 from private.return_cases rc where rc.order_id=o.id and rc.status in(''open'',''in_review''))');
  execute definition;
 end loop;
end $$;
create trigger refund_policy_immutable before update on private.refund_policies for each row execute function private.protect_refund_policy();
create function private.protect_order_refund_policy()returns trigger language plpgsql set search_path='' as $$begin
 if NEW.refund_policy_snapshot is distinct from OLD.refund_policy_snapshot then raise exception 'Order refund terms are immutable';end if;return NEW;
end $$;
create trigger order_refund_terms_immutable before update of refund_policy_snapshot on public.orders for each row execute function private.protect_order_refund_policy();
alter function private.plan_commerce_checkout(text,jsonb,text,boolean)rename to plan_commerce_checkout_before_refund_policy;
create function private.plan_commerce_checkout(p_market text,p_items jsonb,p_code text,p_order boolean default false)returns jsonb language plpgsql security definer set search_path='' as $$declare plan jsonb;p private.refund_policies;snapshot jsonb;q jsonb;begin
 plan:=private.plan_commerce_checkout_before_refund_policy(p_market,p_items,p_code,p_order);
 select * into p from private.refund_policies where market=p_market and withdrawn_at is null for share;
 if not found then return plan;end if;
 snapshot:=jsonb_build_object('policyId',p.id,'version',p.version,'terms',p.terms,'allowPartial',p.allow_partial);
 q:=plan->'quote';q:=q||jsonb_build_object('refundPolicy',snapshot,'quoteHash',encode(sha256(convert_to(jsonb_build_object('previousHash',q->>'quoteHash','refundPolicy',snapshot)::text,'UTF8')),'hex'));
 return jsonb_set(plan,'{quote}',q);
end $$;
do $$declare definition text;begin
 definition:=pg_get_functiondef('private.create_commerce_order_without_membership(text,jsonb,jsonb,uuid,text,text,text)'::regprocedure);
 if strpos(definition,'bonus_items,address')=0 or strpos(definition,'coalesce(quote->''bonusItems'',''[]''::jsonb),delivery,sponsor')=0 then raise exception 'Unexpected refund snapshot checkout baseline';end if;
 definition:=replace(definition,'bonus_items,address','bonus_items,refund_policy_snapshot,address');
 definition:=replace(definition,'coalesce(quote->''bonusItems'',''[]''::jsonb),delivery,sponsor','coalesce(quote->''bonusItems'',''[]''::jsonb),quote->''refundPolicy'',delivery,sponsor');execute definition;
end $$;
revoke all on function private.protect_refund_policy(),private.protect_order_refund_policy(),private.plan_commerce_checkout_before_refund_policy(text,jsonb,text,boolean),private.plan_commerce_checkout(text,jsonb,text,boolean)from public,anon,authenticated,service_role;

create function private.approve_refund_policy(p_market text,p_version text,p_terms text,p_partial boolean,p_reference text)returns uuid language plpgsql security definer set search_path='' as $$declare id uuid;begin
 if not private.has_role(p_market,array['admin','compliance'])then raise exception 'Refund policy approval denied'using errcode='42501';end if;
 if p_partial is null then raise exception 'Approve partial-refund rule'using errcode='22023';end if;
 insert into private.refund_policies(market,version,terms,allow_partial,approval_reference,approved_by)values(p_market,btrim(p_version),btrim(p_terms),p_partial,btrim(p_reference),private.app_user_id())returning refund_policies.id into id;
 insert into public.audit_logs(actor_id,action,entity,entity_id)values(private.app_user_id(),'REFUND_POLICY_APPROVED','refund_policies',id::text);return id;
end $$;
create function private.withdraw_refund_policy(p_id uuid)returns void language plpgsql security definer set search_path='' as $$declare p private.refund_policies;begin
 select * into p from private.refund_policies where id=p_id for update;
 if not found or not private.has_role(p.market,array['admin','compliance'])then raise exception 'Policy withdrawal denied'using errcode='42501';end if;
 if p.withdrawn_at is not null then return;end if;
 update private.refund_policies set withdrawn_at=coalesce(withdrawn_at,clock_timestamp())where id=p.id;
 insert into public.audit_logs(actor_id,action,entity,entity_id)values(private.app_user_id(),'REFUND_POLICY_WITHDRAWN','refund_policies',p.id::text);
end $$;
create function private.request_order_return(p_order uuid,p_kind text,p_reason text)returns uuid language plpgsql security definer set search_path='' as $$declare o public.orders;c private.return_cases;begin
 select * into o from public.orders where id=p_order for update;
 if not found or o.user_id is distinct from private.app_user_id()then raise exception 'Order access denied'using errcode='42501';end if;
 if o.payment_status<>'paid'or o.status not in('paid','fulfilling','shipped','delivered')then raise exception 'Contact support for this order'using errcode='22023';end if;
 select * into c from private.return_cases where order_id=o.id and status in('open','in_review');
 if found then
  if c.kind is distinct from p_kind or c.reason is distinct from btrim(p_reason)then raise exception 'A return case is already open; contact support to add details'using errcode='40001';end if;return c.id;
 end if;
 perform private.check_rate('return_case',10,3600);
 insert into private.return_cases(order_id,user_id,market,kind,reason)values(o.id,o.user_id,o.market,p_kind,btrim(p_reason))returning * into c;
 insert into public.audit_logs(actor_id,action,entity,entity_id)values(private.app_user_id(),'RETURN_REQUESTED','return_cases',c.id::text);return c.id;
end $$;
create function private.approve_order_refund(p_case uuid,p_policy uuid,p_allocations jsonb,p_reference text)returns uuid language plpgsql security definer set search_path='' as $$
declare c private.return_cases;o public.orders;p private.refund_policies;r private.order_refunds;s private.stripe_checkouts;x private.xendit_payments;
 a jsonb;line public.order_items;amount bigint:=0;held bigint;ref text:=btrim(p_reference);begin
 select * into c from private.return_cases where id=p_case;
 select * into o from public.orders where id=c.order_id for update;
 if o.id is null or not private.has_role(o.market,array['admin','compliance'])then raise exception 'Refund approval denied'using errcode='42501';end if;
 select * into c from private.return_cases where id=p_case for update;
 if p_allocations is null or jsonb_typeof(p_allocations)<>'array'or jsonb_array_length(p_allocations)not between 1 and 30 or octet_length(p_allocations::text)>16000 then raise exception 'Choose refund line amounts'using errcode='22023';end if;
 if(select count(distinct entry.value->>'itemId')from jsonb_array_elements(p_allocations)entry)<>jsonb_array_length(p_allocations)then raise exception 'Duplicate refund lines'using errcode='22023';end if;
 select * into r from private.order_refunds where order_id=o.id and approval_reference=ref;
 if found then
  if r.case_id<>c.id or r.policy_id is distinct from p_policy or
  (select jsonb_agg(jsonb_build_object('itemId',item_id,'amountMinor',amount_minor)order by item_id)from private.refund_line_allocations where refund_id=r.id)
  is distinct from(select jsonb_agg(jsonb_build_object('itemId',(entry.value->>'itemId')::uuid,'amountMinor',(entry.value->>'amountMinor')::bigint)order by(entry.value->>'itemId')::uuid)from jsonb_array_elements(p_allocations)entry)then raise exception 'Refund approval reference was reused with different data'using errcode='22023';end if;return r.id;
 end if;
 if c.status not in('open','in_review')or o.payment_status<>'paid'then raise exception 'Refund case or payment is closed'using errcode='40001';end if;
 select * into p from private.refund_policies where id=p_policy and market=o.market and
 ((o.refund_policy_snapshot is not null and o.refund_policy_snapshot->>'policyId'=id::text)or(o.refund_policy_snapshot is null and withdrawn_at is null))for share;
 if not found then raise exception 'Current approved market refund policy required'using errcode='22023';end if;
 for a in select value from jsonb_array_elements(p_allocations)loop
  if jsonb_typeof(a)<>'object'or a-array['itemId','amountMinor']<>'{}'::jsonb or jsonb_typeof(a->'amountMinor')is distinct from 'number'or (a->>'amountMinor')::bigint<=0 then raise exception 'Invalid refund allocation'using errcode='22023';end if;
  select * into line from public.order_items where id=(a->>'itemId')::uuid and order_id=o.id;
  if not found then raise exception 'Refund line unavailable'using errcode='22023';end if;
  select coalesce(sum(l.amount_minor),0)into held from private.refund_line_allocations l join private.order_refunds f on f.id=l.refund_id where l.item_id=line.id and f.phase not in('failed','cancelled');
  if held+(a->>'amountMinor')::bigint>line.net_minor then raise exception 'Refund exceeds remaining line amount'using errcode='40001';end if;
  amount:=amount+(a->>'amountMinor')::bigint;
 end loop;
 select coalesce(sum(amount_minor),0)into held from private.order_refunds where order_id=o.id and phase not in('failed','cancelled');
 if held+amount>o.total_minor or((not p.allow_partial or c.kind='paid_cancellation')and amount<>o.total_minor-held)then raise exception 'Refund amount conflicts with approved policy or remaining payment'using errcode='40001';end if;
 select * into s from private.stripe_checkouts where order_id=o.id and phase='paid'and payment_intent is not null;
 select * into x from private.xendit_payments where order_id=o.id and phase='paid'and provider_payment_id is not null;
 if(s.id is null)=(x.id is null)then raise exception 'Reconcile the original paid gateway before refunding'using errcode='22023';end if;
 insert into private.order_refunds(order_id,case_id,policy_id,approval_reference,approved_by,amount_minor,currency,gateway,livemode,provider_payment_id,sub_account_id)
 values(o.id,c.id,p.id,ref,private.app_user_id(),amount,o.currency,case when s.id is not null then 'stripe'else 'xendit'end,coalesce(s.livemode,x.livemode),coalesce(s.payment_intent,x.provider_payment_id),x.sub_account_id)returning * into r;
 insert into private.refund_line_allocations(refund_id,item_id,amount_minor)select r.id,(entry.value->>'itemId')::uuid,(entry.value->>'amountMinor')::bigint from jsonb_array_elements(p_allocations)entry;
 update private.return_cases set status='in_review',revision=revision+1 where id=c.id;
 insert into public.audit_logs(actor_id,action,entity,entity_id)values(private.app_user_id(),'REFUND_APPROVED','order_refunds',r.id::text);return r.id;
end $$;
create function private.return_context(p_order uuid)returns jsonb language plpgsql stable security definer set search_path='' as $$declare o public.orders;staff boolean;begin
 select * into o from public.orders where id=p_order;staff:=private.has_role(o.market,array['admin','compliance','operations']);
 if o.id is null or private.app_user_id()is null or(o.user_id<>private.app_user_id()and not staff)then raise exception 'Return access denied'using errcode='42501';end if;
 return jsonb_build_object('orderId',o.id,'market',o.market,'currency',o.currency,'totalMinor',o.total_minor,'refundedMinor',o.refunded_minor,
 'remainingMinor',o.total_minor-(select coalesce(sum(amount_minor),0)from private.order_refunds where order_id=o.id and phase not in('failed','cancelled')),
 'canApprove',private.has_role(o.market,array['admin','compliance']),'canReceive',private.has_role(o.market,array['admin','operations']),
 'policy',case when o.refund_policy_snapshot is not null then o.refund_policy_snapshot||jsonb_build_object('id',o.refund_policy_snapshot->'policyId')when staff then(select jsonb_build_object('id',id,'version',version,'terms',terms,'allowPartial',allow_partial)from private.refund_policies where market=o.market and withdrawn_at is null)else null end,
 'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'name',i.product_name,'netMinor',i.net_minor,'remainingMinor',i.net_minor-(select coalesce(sum(l.amount_minor),0)from private.refund_line_allocations l join private.order_refunds f on f.id=l.refund_id where item_id=i.id and f.phase not in('failed','cancelled')))order by i.id)from public.order_items i where order_id=o.id),'[]'::jsonb),
 'cases',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'reason',reason,'status',status,'resolution',resolution,'revision',revision,'createdAt',created_at)order by created_at desc,id)from private.return_cases where order_id=o.id),'[]'::jsonb),
 'refunds',coalesce((select jsonb_agg(jsonb_build_object('id',id,'caseId',case_id,'amountMinor',amount_minor,'phase',phase,'createdAt',created_at,'attention',case when phase='review'then 'Provider reconciliation required'else null end)order by created_at,id)from private.order_refunds where order_id=o.id),'[]'::jsonb),
 'goods',coalesce((select jsonb_agg(jsonb_build_object('productId',i.product_id,'name',p.name,'quantity',i.quantity,'received',(select coalesce(sum(quantity),0)from private.return_stock_receipts where order_id=o.id and product_id=i.product_id))order by i.product_id)from private.order_inventory_items i join public.products p on p.id=i.product_id where i.order_id=o.id),'[]'::jsonb));
end $$;
create function private.staff_return_cases(p_market text,p_page integer default 0)returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not private.has_role(p_market,array['admin','compliance','operations'])then raise exception 'Return staff access denied'using errcode='42501';end if;
 if p_page is null or p_page not between 0 and 10000 then raise exception 'Invalid page'using errcode='22023';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'orderId',order_id,'kind',kind,'status',status,'createdAt',created_at))from(select * from private.return_cases where market=p_market order by created_at desc,id limit 25 offset p_page*25)c),'[]'::jsonb);
end $$;
create function private.record_return_stock(p_case uuid,p_product uuid,p_quantity integer,p_disposition text,p_reference text)returns uuid language plpgsql security definer set search_path='' as $$
declare c private.return_cases;o public.orders;s private.return_stock_receipts;ordered integer;received bigint;actor uuid:=private.app_user_id();begin
 select * into c from private.return_cases where id=p_case;select * into o from public.orders where id=c.order_id for update;
 if o.id is null or not private.has_role(o.market,array['admin','operations'])then raise exception 'Return inventory access denied'using errcode='42501';end if;
 select * into s from private.return_stock_receipts where order_id=o.id and reference=btrim(p_reference);
 if found then
  if s.case_id<>c.id or s.product_id is distinct from p_product or s.quantity is distinct from p_quantity or s.disposition is distinct from p_disposition then raise exception 'Receipt reference changed'using errcode='22023';end if;return s.id;
 end if;
 select quantity into ordered from private.order_inventory_items where order_id=o.id and product_id=p_product;
 select coalesce(sum(quantity),0)into received from private.return_stock_receipts where order_id=o.id and product_id=p_product;
 if p_quantity is null or p_quantity<1 or ordered is null or received+p_quantity>ordered then raise exception 'Returned quantity exceeds shipped physical goods'using errcode='22023';end if;
 insert into private.return_stock_receipts(case_id,order_id,product_id,quantity,disposition,reference,actor_id)values(c.id,o.id,p_product,p_quantity,p_disposition,btrim(p_reference),actor)returning * into s;
 if p_disposition='restock'then
  update public.inventory set on_hand=on_hand+p_quantity where product_id=p_product and market=o.market;
  if not found then raise exception 'Inventory reconciliation required'using errcode='40001';end if;
  insert into public.inventory_movements(product_id,market,delta,reason,actor_id)values(p_product,o.market,p_quantity,'RETURN_RECEIPT:'||s.id,case when exists(select 1 from auth.users where id=actor)then actor else null end);
 end if;
 insert into public.audit_logs(actor_id,action,entity,entity_id)values(actor,'RETURN_STOCK_'||upper(p_disposition),'return_stock_receipts',s.id::text);return s.id;
end $$;

-- Service-only claiming persists dispatch intent before the network call. A
-- lost Xendit response must be reconciled, never blindly submitted again.
create function public.claim_order_refunds(p_gateway text,p_live boolean,p_limit integer default 10)returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.order_refunds;rows jsonb:='[]';first boolean;token uuid;begin
 if p_gateway is null or p_gateway not in('stripe','xendit')or p_live is null or p_limit is null or p_limit not between 1 and 20 then raise exception 'Invalid refund claim';end if;
 update private.order_refunds set phase='review',last_error_code='retry_budget_exhausted',lease=null,lease_until=null,updated_at=clock_timestamp()
 where gateway=p_gateway and livemode=p_live and phase in('processing','pending','review')and attempts>=12 and(lease_until is null or lease_until<clock_timestamp())and last_error_code is distinct from 'retry_budget_exhausted';
 for r in select f.* from private.order_refunds f where f.gateway=p_gateway and f.livemode=p_live and f.phase in('approved','processing','pending','review')and f.attempts<12 and f.next_check_at<=clock_timestamp()
 and(f.lease_until is null or f.lease_until<clock_timestamp())order by f.next_check_at,f.id limit p_limit for update of f skip locked loop
  first:=r.first_dispatched_at is null;token:=gen_random_uuid();
  update private.order_refunds set phase='processing',attempts=attempts+1,lease=token,lease_until=clock_timestamp()+interval '2 minutes',first_dispatched_at=coalesce(first_dispatched_at,clock_timestamp()),updated_at=clock_timestamp()where id=r.id returning * into r;
  rows:=rows||jsonb_build_array(jsonb_build_object('id',r.id,'orderId',r.order_id,'lease',token,'firstSubmission',first,'firstDispatchedAt',r.first_dispatched_at,'gateway',r.gateway,'livemode',r.livemode,'paymentId',r.provider_payment_id,'subAccountId',r.sub_account_id,'providerRefundId',coalesce(r.provider_refund_id,r.candidate_provider_id),'amountMinor',r.amount_minor,'currency',r.currency));
 end loop;return rows;
end $$;
create function public.apply_order_refund(p_id uuid,p_provider_id text,p_payment_id text,p_amount bigint,p_currency text,p_phase text)returns text language plpgsql security definer set search_path='' as $$
declare r private.order_refunds;o public.orders;total bigint;begin
 select * into r from private.order_refunds where id=p_id;select * into o from public.orders where id=r.order_id for update;
 select * into r from private.order_refunds where id=p_id for update;
 if r.id is null or p_provider_id is null or length(p_provider_id)not between 5 and 160 or p_payment_id is distinct from r.provider_payment_id or p_amount is distinct from r.amount_minor or upper(p_currency)is distinct from r.currency or p_phase is null or p_phase not in('pending','succeeded','failed','review')then raise exception 'Refund provider facts do not match approval'using errcode='22023';end if;
 if r.provider_refund_id is not null and r.provider_refund_id<>p_provider_id then raise exception 'Refund provider binding changed'using errcode='22023';end if;
 if r.phase in('succeeded','failed')then return r.phase;end if;
 if r.phase='cancelled'then raise exception 'Refund was cancelled before dispatch'using errcode='40001';end if;
 update private.order_refunds set provider_refund_id=p_provider_id,phase=p_phase,lease=null,lease_until=null,last_error_code=null,next_check_at=clock_timestamp()+interval '5 minutes',updated_at=clock_timestamp()where id=r.id;
 if p_phase='succeeded'then
  select coalesce(sum(amount_minor),0)into total from private.order_refunds where order_id=o.id and phase='succeeded';
  if total>o.total_minor then raise exception 'Refund reconciliation exceeds original payment';end if;
  update public.orders set refunded_minor=total,payment_status=case when total=total_minor then 'refunded'else payment_status end,status=case when total=total_minor then 'refunded'else status end where id=o.id;
  insert into public.audit_logs(action,entity,entity_id)values('REFUND_SUCCEEDED_COMPENSATION_REVIEW','order_refunds',r.id::text);
 end if;
 return p_phase;
end $$;
create function public.flag_order_refund(p_id uuid,p_lease uuid)returns void language sql security definer set search_path='' as $$
 update private.order_refunds set phase='review',lease=null,lease_until=null,last_error_code='provider_reconciliation_required',next_check_at=clock_timestamp()+interval '5 minutes',updated_at=clock_timestamp()where id=p_id and lease=p_lease and phase='processing'
$$;
create function public.order_refund_job(p_id uuid)returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'orderId',r.order_id,'lease',r.lease,'firstSubmission',false,'firstDispatchedAt',r.first_dispatched_at,'gateway',r.gateway,'livemode',r.livemode,'paymentId',r.provider_payment_id,'subAccountId',r.sub_account_id,'providerRefundId',coalesce(r.provider_refund_id,r.candidate_provider_id),'amountMinor',r.amount_minor,'currency',r.currency)from private.order_refunds r where r.id=p_id
$$;
create function private.resolve_return_case(p_case uuid,p_revision integer,p_decision text,p_note text)returns void language plpgsql security definer set search_path='' as $$declare c private.return_cases;begin
 select * into c from private.return_cases where id=p_case;
 perform 1 from public.orders where id=c.order_id for update;
 if c.id is null or not private.has_role(c.market,array['admin','compliance'])then raise exception 'Case resolution denied'using errcode='42501';end if;
 select * into c from private.return_cases where id=p_case for update;
 if p_revision is distinct from c.revision then raise exception 'Return case changed'using errcode='40001';end if;
 if p_decision is null or p_decision not in('closed','rejected')or p_note is null or length(btrim(p_note))not between 5 and 1000 then raise exception 'Decision and customer-facing explanation required'using errcode='22023';end if;
 if exists(select 1 from private.order_refunds where case_id=c.id and phase not in('failed','cancelled','succeeded'))then raise exception 'Reconcile pending refunds before closing'using errcode='40001';end if;
 if p_decision='rejected'and exists(select 1 from private.order_refunds where case_id=c.id and phase='succeeded')then raise exception 'A refunded case cannot be rejected'using errcode='22023';end if;
 update private.return_cases set status=p_decision,resolution=btrim(p_note),revision=revision+1 where id=c.id;
 insert into public.audit_logs(actor_id,action,entity,entity_id)values(private.app_user_id(),'RETURN_CASE_'||upper(p_decision),'return_cases',c.id::text);
end $$;
create function private.manage_order_refund(p_id uuid,p_action text,p_provider_id text default null)returns void language plpgsql security definer set search_path='' as $$declare r private.order_refunds;o public.orders;begin
 select * into r from private.order_refunds where id=p_id;select * into o from public.orders where id=r.order_id for update;
 if o.id is null or not private.has_role(o.market,array['admin','compliance'])then raise exception 'Refund management denied'using errcode='42501';end if;
 select * into r from private.order_refunds where id=p_id for update;
 if p_action='cancel'and r.phase='approved'and r.first_dispatched_at is null then
  update private.order_refunds set phase='cancelled',updated_at=clock_timestamp()where id=r.id;
 elsif p_action='reconcile'and r.phase in('pending','processing','review')and p_provider_id is not null and length(btrim(p_provider_id))between 5 and 160 then
  -- This is only a candidate. A service must fetch and match provider facts.
  update private.order_refunds set candidate_provider_id=btrim(p_provider_id),attempts=0,next_check_at=clock_timestamp(),updated_at=clock_timestamp()where id=r.id;
 else raise exception 'Only undispatched refunds can be cancelled; dispatched refunds require canonical reconciliation'using errcode='40001';end if;
 insert into public.audit_logs(actor_id,action,entity,entity_id)values(private.app_user_id(),'REFUND_MANAGE_'||upper(p_action),'order_refunds',r.id::text);
end $$;
create function private.staff_refund_policy(p_market text)returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not private.has_role(p_market,array['admin','compliance','operations'])then raise exception 'Policy access denied'using errcode='42501';end if;
 return jsonb_build_object('canApprove',private.has_role(p_market,array['admin','compliance']),'policy',(select jsonb_build_object('id',id,'version',version,'terms',terms,'allowPartial',allow_partial)from private.refund_policies where market=p_market and withdrawn_at is null));
end $$;

alter function private.export_my_data()rename to export_my_data_before_returns;
create function private.export_my_data()returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 result:=private.export_my_data_before_returns();
 result:=jsonb_set(result,'{orders}',coalesce((select jsonb_agg(item||jsonb_build_object('refundedMinor',o.refunded_minor,'refundPolicy',o.refund_policy_snapshot))from jsonb_array_elements(result->'orders')item join public.orders o on o.id=(item->>'id')::uuid and o.user_id=private.app_user_id()),'[]'::jsonb));
 return result||jsonb_build_object('returnCases',coalesce((select jsonb_agg(jsonb_build_object('id',id,'orderId',order_id,'kind',kind,'reason',reason,'status',status,'resolution',resolution,'createdAt',created_at))from private.return_cases where user_id=private.app_user_id()),'[]'::jsonb),
 'refunds',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'orderId',r.order_id,'amountMinor',r.amount_minor,'currency',r.currency,'phase',r.phase,'createdAt',r.created_at))from private.order_refunds r join public.orders o on o.id=r.order_id where o.user_id=private.app_user_id()),'[]'::jsonb));
end $$;
revoke all on function private.export_my_data(),private.export_my_data_before_returns()from public,anon,authenticated,service_role;
grant execute on function private.export_my_data()to authenticated;

-- Public wrappers use caller identity; only reconciliation functions use service access.
create function public.approve_refund_policy(p_market text,p_version text,p_terms text,p_partial boolean,p_reference text)returns uuid language sql security invoker set search_path='' as $$select private.approve_refund_policy(p_market,p_version,p_terms,p_partial,p_reference)$$;
create function public.withdraw_refund_policy(p_id uuid)returns void language sql security invoker set search_path='' as $$select private.withdraw_refund_policy(p_id)$$;
create function public.request_order_return(p_order uuid,p_kind text,p_reason text)returns uuid language sql security invoker set search_path='' as $$select private.request_order_return(p_order,p_kind,p_reason)$$;
create function public.approve_order_refund(p_case uuid,p_policy uuid,p_allocations jsonb,p_reference text)returns uuid language sql security invoker set search_path='' as $$select private.approve_order_refund(p_case,p_policy,p_allocations,p_reference)$$;
create function public.return_context(p_order uuid)returns jsonb language sql stable security invoker set search_path='' as $$select private.return_context(p_order)$$;
create function public.staff_return_cases(p_market text,p_page integer default 0)returns jsonb language sql stable security invoker set search_path='' as $$select private.staff_return_cases(p_market,p_page)$$;
create function public.record_return_stock(p_case uuid,p_product uuid,p_quantity integer,p_disposition text,p_reference text)returns uuid language sql security invoker set search_path='' as $$select private.record_return_stock(p_case,p_product,p_quantity,p_disposition,p_reference)$$;
create function public.resolve_return_case(p_case uuid,p_revision integer,p_decision text,p_note text)returns void language sql security invoker set search_path='' as $$select private.resolve_return_case(p_case,p_revision,p_decision,p_note)$$;
create function public.manage_order_refund(p_id uuid,p_action text,p_provider_id text default null)returns void language sql security invoker set search_path='' as $$select private.manage_order_refund(p_id,p_action,p_provider_id)$$;
create function public.staff_refund_policy(p_market text)returns jsonb language sql stable security invoker set search_path='' as $$select private.staff_refund_policy(p_market)$$;
do $$declare p record;begin
 for p in select n.nspname,pr.oid::regprocedure as signature from pg_proc pr join pg_namespace n on n.oid=pr.pronamespace where n.nspname in('public','private')and pr.proname in('approve_refund_policy','withdraw_refund_policy','request_order_return','approve_order_refund','return_context','staff_return_cases','record_return_stock','resolve_return_case','manage_order_refund','staff_refund_policy','claim_order_refunds','apply_order_refund','flag_order_refund','order_refund_job')loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',p.signature);
  if p.nspname='public'and p.signature::text~'(claim_order_refunds|apply_order_refund|flag_order_refund|order_refund_job)'then execute format('grant execute on function %s to service_role',p.signature);
  else execute format('grant execute on function %s to authenticated',p.signature);end if;
 end loop;
end $$;

-- Refund-adjusted sales reports. Original order dates and sold units are
-- retained; only verified successful monetary refunds reduce net amounts.
-- Legacy refunded orders without a verified refund ledger stay excluded.
create or replace function private.staff_sales_report(p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare allowed text[]; result jsonb; begin
 select array_agg(code order by array_position(array['PH','SG','MY'],code)) into allowed
  from public.markets where private.has_role(code,array['admin','operations']);
 if coalesce(cardinality(allowed),0)=0 then raise exception 'Sales reporting access denied' using errcode='42501'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Choose a date range of up to 366 days'; end if;
 with settled as (
  select o.id,o.user_id,o.created_at,o.market,o.currency,o.sponsor_id,o.promotion_offer_id,o.subtotal_minor,o.discount_minor,o.total_minor-o.refunded_minor as total_minor,o.refunded_minor from public.orders o
  where o.market=any(allowed) and (o.payment_status='paid' or(o.payment_status='refunded'and o.refunded_minor>0)) and o.status in ('paid','fulfilling','shipped','delivered','refunded')
   and o.created_at>=(p_from::timestamp at time zone 'UTC') and o.created_at<((p_to+1)::timestamp at time zone 'UTC')
 ), lines as (
  select i.product_id,i.product_name,i.package_offer_id,i.quantity,i.net_minor-coalesce((select sum(a.amount_minor)from private.refund_line_allocations a join private.order_refunds r on r.id=a.refund_id where a.item_id=i.id and r.phase='succeeded'),0)as net_minor,s.market,s.currency
  from public.order_items i join settled s on s.id=i.order_id
 ), channelled as (
  select s.*,case
   when exists(select 1 from private.membership_enrollments e where e.order_id=s.id and e.status in ('pending_verification','confirmed','rejected')) then 'membership_enrolment'
   when exists(select 1 from public.orders p where p.user_id=s.user_id and p.id<>s.id and p.payment_status='paid'
    and p.status in ('paid','fulfilling','shipped','delivered') and (p.created_at,p.id)<(s.created_at,s.id)) then 'repeat_purchase'
   else 'first_purchase' end as channel
  from settled s
 )
 select jsonb_build_object('from',p_from,'to',p_to,'markets',to_jsonb(allowed),'refundsIncluded',true,
  'byMarket',coalesce((select jsonb_agg(jsonb_build_object('market',market,'currency',currency,'orders',orders,
    'subtotalMinor',subtotal,'discountMinor',discount,'totalMinor',total,'refundedMinor',refunds) order by array_position(allowed,market))
   from (select market,currency,count(*) orders,sum(subtotal_minor) subtotal,sum(discount_minor) discount,sum(total_minor) total,sum(refunded_minor) refunds
    from settled group by market,currency) m),'[]'::jsonb),
  'byChannel',coalesce((select jsonb_agg(jsonb_build_object('market',market,'currency',currency,'channel',channel,'orders',orders,
    'voucherOrders',voucher_orders,'discountMinor',discount,'totalMinor',total,'refundedMinor',refunds)
    order by array_position(allowed,market),array_position(array['membership_enrolment','first_purchase','repeat_purchase'],channel))
   from (select market,currency,channel,count(*) orders,count(*) filter(where promotion_offer_id is not null) voucher_orders,
    sum(discount_minor) discount,sum(total_minor) total,sum(refunded_minor) refunds from channelled group by market,currency,channel) c),'[]'::jsonb),
  'byProduct',coalesce((select jsonb_agg(jsonb_build_object('market',market,'currency',currency,'productId',product_id,
    'name',name,'units',units,'netMinor',net) order by array_position(allowed,market),net desc,product_id)
   from (select market,currency,product_id,max(product_name) as name,sum(quantity) units,sum(net_minor) net
    from lines group by market,currency,product_id order by sum(net_minor) desc limit 500) p),'[]'::jsonb),
  'byPackage',coalesce((select jsonb_agg(jsonb_build_object('market',market,'currency',currency,'packageOfferId',package_offer_id,
    'name',name,'units',units,'netMinor',net) order by array_position(allowed,market),net desc,package_offer_id)
   from (select l.market,l.currency,l.package_offer_id,max(c.name) as name,sum(l.quantity) units,sum(l.net_minor) net
    from lines l join private.commerce_offers c on c.id=l.package_offer_id
    group by l.market,l.currency,l.package_offer_id order by sum(l.net_minor) desc limit 500) k),'[]'::jsonb),
  'byDistributor',coalesce((select jsonb_agg(jsonb_build_object('market',market,'currency',currency,'distributorId',sponsor_id,
    'code',code,'name',name,'orders',orders,'totalMinor',total,'refundedMinor',refunds) order by array_position(allowed,market),total desc,sponsor_id)
   from (select s.market,s.currency,s.sponsor_id,max(d.code) as code,max(d.display_name) as name,count(*) orders,sum(s.total_minor) total,sum(s.refunded_minor) refunds
    from settled s left join public.distributor_profiles d on d.user_id=s.sponsor_id
    group by s.market,s.currency,s.sponsor_id order by sum(s.total_minor) desc limit 500) r),'[]'::jsonb))
 into result;
 return result;
end $$;


create or replace function private.queue_sales_reports_for(report_day date) returns integer
language plpgsql security definer set search_path='' as $$
declare total integer; begin
 if report_day is null then raise exception 'Invalid report date'; end if;
 with due as (
  select s.user_id,s.market,s.frequency,
   case s.frequency when 'weekly' then report_day-7 else (date_trunc('month',report_day)-interval '1 month')::date end as period_from,
   report_day-1 as period_to
  from private.report_subscriptions s
  where (s.frequency='weekly' and extract(isodow from report_day)=1) or (s.frequency='monthly' and extract(day from report_day)=1)
 ), settled as (
  select d.user_id,d.market,o.id,o.subtotal_minor,o.discount_minor,o.total_minor-o.refunded_minor as total_minor,o.refunded_minor from due d join public.orders o
   on o.market=d.market and (o.payment_status='paid'or(o.payment_status='refunded'and o.refunded_minor>0)) and o.status in ('paid','fulfilling','shipped','delivered','refunded')
   and o.created_at>=(d.period_from::timestamp at time zone 'UTC') and o.created_at<((d.period_to+1)::timestamp at time zone 'UTC')
 )
 insert into private.notification_jobs(user_id,kind,reference,context)
 select d.user_id,'sales_report',md5('sales-report/'||d.user_id::text||'/'||d.market||'/'||d.frequency||'/'||d.period_from::text)::uuid,
  jsonb_build_object('market',d.market,'currency',m.currency,'frequency',d.frequency,'from',d.period_from,'to',d.period_to,
   'orders',(select count(*) from settled x where x.user_id=d.user_id and x.market=d.market),
   'subtotalMinor',(select coalesce(sum(subtotal_minor),0) from settled x where x.user_id=d.user_id and x.market=d.market),
   'discountMinor',(select coalesce(sum(discount_minor),0) from settled x where x.user_id=d.user_id and x.market=d.market),
   'refundedMinor',(select coalesce(sum(refunded_minor),0)from settled x where x.user_id=d.user_id and x.market=d.market),
   'totalMinor',(select coalesce(sum(total_minor),0) from settled x where x.user_id=d.user_id and x.market=d.market),
   'topProducts',coalesce((select jsonb_agg(jsonb_build_object('name',name,'units',units,'netMinor',net) order by net desc,name)
    from (select left(max(i.product_name),120) as name,sum(i.quantity) units,sum(i.net_minor-coalesce((select sum(a.amount_minor)from private.refund_line_allocations a join private.order_refunds r on r.id=a.refund_id where a.item_id=i.id and r.phase='succeeded'),0)) net
     from settled x join public.order_items i on i.order_id=x.id where x.user_id=d.user_id and x.market=d.market
     group by i.product_id order by sum(i.net_minor-coalesce((select sum(a.amount_minor)from private.refund_line_allocations a join private.order_refunds r on r.id=a.refund_id where a.item_id=i.id and r.phase='succeeded'),0)) desc limit 5) t),'[]'::jsonb))
 from due d join public.markets m on m.code=d.market
 -- Only staff who still hold the role are queued; delivery checks again.
 where exists(select 1 from public.staff_roles r where r.user_id=d.user_id and r.market=d.market and r.role in ('admin','operations'))
 on conflict(kind,reference,user_id) do nothing;
 get diagnostics total=row_count;
 return total;
end $$;
