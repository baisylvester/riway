-- RIWAY compensation order-volume outbox (audit G02).
--
-- RIWAY owns every sponsor/binary/development/matching bonus calculation and
-- payout. This platform only delivers frozen order facts so RIWAY can credit
-- volume: one 'order_paid' event when a verified payment settles, and one
-- 'order_reversed' event when a paid order is later refunded or cancelled.
-- Each event carries a stable external idempotency reference. Events are
-- leased by a service-only worker, retried with bounded exponential backoff,
-- and marked failed for staff review after the retry budget or a permanent
-- rejection. A reversal is never delivered before its order_paid event has been
-- acknowledged. Delivery is disabled until RIWAY supplies the API contract;
-- events still accumulate so nothing is lost before activation.
-- Payloads hold no customer name, address, phone or email.

create table private.compensation_volume_events (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id),
 event_type text not null check(event_type in ('order_paid','order_reversed')),
 external_reference text not null unique check(external_reference ~ '^riway-web:order:[0-9a-f-]{36}:(paid|reversed)$'),
 market text not null references public.markets(code),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 status text not null default 'pending' check(status in ('pending','processing','acknowledged','failed')),
 attempts integer not null default 0 check(attempts>=0),
 lease uuid, lease_until timestamptz,
 next_attempt_at timestamptz not null default clock_timestamp(),
 acknowledged_at timestamptz, ack_reference text check(ack_reference is null or length(ack_reference) between 1 and 200),
 last_error_code text check(last_error_code is null or last_error_code ~ '^[a-z0-9_]{1,64}$'),
 created_at timestamptz not null default clock_timestamp(),
 unique(order_id,event_type),
 check(status<>'acknowledged' or (acknowledged_at is not null and ack_reference is not null))
);
create index compensation_ready_idx on private.compensation_volume_events(next_attempt_at) where status in ('pending','processing');
create index compensation_market_status_idx on private.compensation_volume_events(market,status,created_at desc);
alter table private.compensation_volume_events enable row level security;
revoke all on private.compensation_volume_events from public,anon,authenticated,service_role;
create policy compensation_volume_events_internal_only on private.compensation_volume_events
 for all to anon,authenticated using(false) with check(false);

-- Frozen payload from the order snapshot. sponsorMemberId is the verified
-- distributor's RIWAY member id at the time of the order; customerMemberId is
-- present only for an active linked membership.
create function private.compensation_payload(p_order uuid,p_event text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('schemaVersion',1,'eventType',p_event,'orderId',o.id,'market',o.market,'currency',o.currency,
  'placedAt',o.created_at,'subtotalMinor',o.subtotal_minor,'discountMinor',o.discount_minor,'totalMinor',o.total_minor,
  'sponsorMemberId',d.external_member_id,
  'customerMemberId',(select m.external_member_id from public.memberships m where m.user_id=o.user_id and m.status='active'),
  'lines',coalesce((select jsonb_agg(jsonb_build_object('productId',i.product_id,'name',left(i.product_name,120),'quantity',i.quantity,
    'unitMinor',i.unit_minor,'discountMinor',i.discount_minor,'netMinor',i.net_minor,'packageOfferId',i.package_offer_id) order by i.id)
   from public.order_items i where i.order_id=o.id),'[]'::jsonb))
 from public.orders o left join public.distributor_profiles d on d.user_id=o.sponsor_id where o.id=p_order;
$$;
revoke all on function private.compensation_payload(uuid,text) from public,anon,authenticated,service_role;

create function private.enqueue_compensation_event() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if NEW.payment_status='paid' and OLD.payment_status is distinct from 'paid' then
  insert into private.compensation_volume_events(order_id,event_type,external_reference,market,payload)
  values(NEW.id,'order_paid','riway-web:order:'||NEW.id||':paid',NEW.market,private.compensation_payload(NEW.id,'order_paid'))
  on conflict do nothing;
 elsif (NEW.payment_status='refunded' and OLD.payment_status is distinct from 'refunded')
  or (NEW.status in ('cancelled','refunded') and OLD.status is distinct from NEW.status and OLD.payment_status='paid') then
  -- Only orders whose paid volume was queued can be reversed.
  if exists(select 1 from private.compensation_volume_events where order_id=NEW.id and event_type='order_paid') then
   insert into private.compensation_volume_events(order_id,event_type,external_reference,market,payload)
   values(NEW.id,'order_reversed','riway-web:order:'||NEW.id||':reversed',NEW.market,private.compensation_payload(NEW.id,'order_reversed'))
   on conflict do nothing;
  end if;
 end if;
 return NEW;
end $$;
revoke all on function private.enqueue_compensation_event() from public,anon,authenticated,service_role;
create trigger compensation_volume_event after update of payment_status,status on public.orders
 for each row execute function private.enqueue_compensation_event();

-- Worker: lease up to p_limit ready events. A reversal waits for its paid
-- event's acknowledgement. Ten attempts, then failed for staff review.
create function private.claim_compensation_events(p_limit integer) returns setof private.compensation_volume_events
language plpgsql security definer set search_path='' as $$
begin
 if p_limit is null or p_limit not between 1 and 25 then raise exception 'Invalid claim size'; end if;
 update private.compensation_volume_events set status='failed',last_error_code='retry_budget_exhausted',lease=null,lease_until=null
 where status='processing' and attempts>=10 and lease_until<=clock_timestamp();
 return query update private.compensation_volume_events e set status='processing',attempts=e.attempts+1,lease=gen_random_uuid(),
  lease_until=clock_timestamp()+interval '5 minutes'
 where e.id in (select c.id from private.compensation_volume_events c
  where c.attempts<10 and ((c.status='pending' and c.next_attempt_at<=clock_timestamp()) or (c.status='processing' and c.lease_until<=clock_timestamp()))
  and (c.event_type='order_paid' or exists(select 1 from private.compensation_volume_events p
   where p.order_id=c.order_id and p.event_type='order_paid' and p.status='acknowledged'))
  order by c.next_attempt_at,c.created_at for update skip locked limit p_limit)
 returning e.*;
end $$;

create function private.finish_compensation_event(p_id uuid,p_token uuid,p_result text,p_reference text default null,p_error text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_error text:=coalesce(nullif(p_error,''),case when p_result='rejected' then 'rejected' else 'provider_unavailable' end); begin
 if p_result not in ('acknowledged','retry','rejected') then raise exception 'Invalid delivery result'; end if;
 if p_result='acknowledged' and (p_reference is null or length(btrim(p_reference)) not between 1 and 200) then
  raise exception 'Acknowledgement reference required';
 end if;
 if v_error !~ '^[a-z0-9_]{1,64}$' then v_error:='provider_error'; end if;
 update private.compensation_volume_events set
  status=case when p_result='acknowledged' then 'acknowledged' when p_result='retry' and attempts<10 then 'pending' else 'failed' end,
  acknowledged_at=case when p_result='acknowledged' then clock_timestamp() else acknowledged_at end,
  ack_reference=case when p_result='acknowledged' then btrim(p_reference) else ack_reference end,
  last_error_code=case when p_result='acknowledged' then null else v_error end,
  next_attempt_at=clock_timestamp()+make_interval(secs=>least(21600,60*power(2,attempts)::integer)),
  lease=null,lease_until=null
 where id=p_id and lease=p_token and status='processing' and lease_until>clock_timestamp();
 return found;
end $$;

-- Reconciliation: paid orders with no queued volume event (for example orders
-- settled before this migration). Explicit, bounded backfill only.
create function private.enqueue_missing_compensation_events(p_since timestamptz) returns integer
language plpgsql security definer set search_path='' as $$
declare total integer; begin
 if p_since is null or p_since < clock_timestamp()-interval '31 days' then raise exception 'Backfill window must be within 31 days'; end if;
 insert into private.compensation_volume_events(order_id,event_type,external_reference,market,payload)
 select o.id,'order_paid','riway-web:order:'||o.id||':paid',o.market,private.compensation_payload(o.id,'order_paid')
 from public.orders o where o.payment_status in ('paid','refunded') and o.created_at>=p_since and o.sponsor_id is not null
 and not exists(select 1 from private.compensation_volume_events e where e.order_id=o.id and e.event_type='order_paid')
 on conflict do nothing;
 get diagnostics total=row_count;
 insert into private.compensation_volume_events(order_id,event_type,external_reference,market,payload)
 select o.id,'order_reversed','riway-web:order:'||o.id||':reversed',o.market,private.compensation_payload(o.id,'order_reversed')
 from public.orders o where (o.payment_status='refunded' or o.status in ('cancelled','refunded')) and o.created_at>=p_since
 and exists(select 1 from private.compensation_volume_events e where e.order_id=o.id and e.event_type='order_paid')
 and not exists(select 1 from private.compensation_volume_events e where e.order_id=o.id and e.event_type='order_reversed')
 on conflict do nothing;
 return total;
end $$;

-- Staff visibility (market admin/operations, verified MFA): counts and the
-- most recent failed/stale events. No customer data is returned.
create function private.staff_compensation_sync() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare allowed text[]; begin
 select array_agg(code order by array_position(array['PH','SG','MY'],code)) into allowed
  from public.markets where private.has_role(code,array['admin','operations']);
 if coalesce(cardinality(allowed),0)=0 then raise exception 'Compensation sync access denied' using errcode='42501'; end if;
 return jsonb_build_object(
  'counts',(select coalesce(jsonb_object_agg(s,(select count(*) from private.compensation_volume_events e where e.market=any(allowed) and e.status=s)),'{}'::jsonb)
   from unnest(array['pending','processing','acknowledged','failed']) s),
  'stalePending',(select count(*) from private.compensation_volume_events e where e.market=any(allowed) and e.status in ('pending','processing') and e.created_at<clock_timestamp()-interval '1 hour'),
  'attention',coalesce((select jsonb_agg(x order by x->>'createdAt' desc) from (
    select jsonb_build_object('id',e.id,'orderId',e.order_id,'market',e.market,'eventType',e.event_type,'status',e.status,
     'attempts',e.attempts,'lastErrorCode',e.last_error_code,'createdAt',e.created_at,'nextAttemptAt',e.next_attempt_at) x
    from private.compensation_volume_events e where e.market=any(allowed)
    and (e.status='failed' or (e.status in ('pending','processing') and e.created_at<clock_timestamp()-interval '1 hour'))
    order by e.created_at desc limit 50) t),'[]'::jsonb));
end $$;

create function private.retry_compensation_event(p_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare e private.compensation_volume_events; actor uuid:=private.app_user_id(); begin
 select * into e from private.compensation_volume_events where id=p_id;
 if not found or not private.has_role(e.market,array['admin','operations']) then
  raise exception 'Compensation sync access denied' using errcode='42501';
 end if;
 update private.compensation_volume_events set status='pending',attempts=0,next_attempt_at=clock_timestamp(),last_error_code=null
 where id=p_id and status='failed';
 if not found then return false; end if;
 insert into public.audit_logs(actor_id,action,entity,entity_id) values(actor,'COMPENSATION_RETRY:'||e.event_type,'compensation_volume_events',p_id::text);
 return true;
end $$;

create function public.claim_compensation_events(p_limit integer) returns jsonb
language sql security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'lease',c.lease,'eventType',c.event_type,'externalReference',c.external_reference,
  'attempts',c.attempts,'payload',c.payload)),'[]'::jsonb) from private.claim_compensation_events(p_limit) c;
$$;
create function public.finish_compensation_event(p_id uuid,p_token uuid,p_result text,p_reference text default null,p_error text default null)
returns boolean language sql security invoker set search_path='' as $$ select private.finish_compensation_event(p_id,p_token,p_result,p_reference,p_error) $$;
create function public.enqueue_missing_compensation_events(p_since timestamptz) returns integer
language sql security invoker set search_path='' as $$ select private.enqueue_missing_compensation_events(p_since) $$;
create function public.staff_compensation_sync() returns jsonb
language sql stable security invoker set search_path='' as $$ select private.staff_compensation_sync() $$;
create function public.retry_compensation_event(p_id uuid) returns boolean
language sql security invoker set search_path='' as $$ select private.retry_compensation_event(p_id) $$;

revoke all on function private.claim_compensation_events(integer),public.claim_compensation_events(integer),
 private.finish_compensation_event(uuid,uuid,text,text,text),public.finish_compensation_event(uuid,uuid,text,text,text),
 private.enqueue_missing_compensation_events(timestamptz),public.enqueue_missing_compensation_events(timestamptz),
 private.staff_compensation_sync(),public.staff_compensation_sync(),
 private.retry_compensation_event(uuid),public.retry_compensation_event(uuid)
 from public,anon,authenticated,service_role;
grant execute on function private.claim_compensation_events(integer),public.claim_compensation_events(integer),
 private.finish_compensation_event(uuid,uuid,text,text,text),public.finish_compensation_event(uuid,uuid,text,text,text),
 private.enqueue_missing_compensation_events(timestamptz),public.enqueue_missing_compensation_events(timestamptz) to service_role;
grant execute on function private.staff_compensation_sync(),public.staff_compensation_sync(),
 private.retry_compensation_event(uuid),public.retry_compensation_event(uuid) to authenticated;
