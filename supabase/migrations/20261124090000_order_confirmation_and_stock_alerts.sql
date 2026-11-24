-- Paid-order confirmation and corporate low-stock alerts (audit G22, G26).
--
-- 1. Every order whose payment_status first becomes 'paid' (Stripe, Xendit or
--    any later verified gateway path) queues one 'order_confirmed' email job in
--    the existing durable outbox. The job context is a frozen copy of the order
--    snapshot (lines, totals, currency); delivery rechecks that the order is
--    still paid and still owned by the recipient. It is a confirmation, not a
--    tax invoice: legal invoice numbering awaits RIWAY's approved tax rules.
-- 2. Market administrators/operations staff (verified MFA) opt in to a daily
--    corporate low-stock summary per market. The worker queues it at the same
--    daily hour as the tenant report. This uses corporate checkout inventory
--    (public.inventory), never the separate tenant_stock.
-- Existing migrations are unchanged; this file only adds objects and replaces
-- notification_authorized with the same branches plus the two new kinds.

alter table private.notification_jobs drop constraint notification_jobs_kind_check;
alter table private.notification_jobs add constraint notification_jobs_kind_check check(kind in
 ('support_received','event_registered','store_owner_onboarding','low_inventory_report','membership_requested','membership_confirmed',
  'order_shipped','order_delivered','sales_report','order_confirmed','corporate_low_stock'));

-- Order confirmation -------------------------------------------------------
create function private.enqueue_order_confirmation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into private.notification_jobs(user_id,kind,reference,context)
 select NEW.user_id,'order_confirmed',NEW.id,jsonb_build_object(
  'orderId',NEW.id,'market',NEW.market,'currency',NEW.currency,
  'subtotalMinor',NEW.subtotal_minor,'discountMinor',NEW.discount_minor,'totalMinor',NEW.total_minor,
  'placedAt',to_char(NEW.created_at at time zone 'UTC','YYYY-MM-DD'),
  'items',coalesce((select jsonb_agg(jsonb_build_object('name',left(i.product_name,120),'quantity',i.quantity,'netMinor',i.net_minor)
    order by i.product_name,i.id) from (select * from public.order_items where order_id=NEW.id order by product_name,id limit 30) i),'[]'::jsonb))
 where exists(select 1 from public.app_users a where a.id=NEW.user_id)
 on conflict(kind,reference,user_id) do nothing;
 return NEW;
end $$;
revoke all on function private.enqueue_order_confirmation() from public,anon,authenticated,service_role;
create trigger order_confirmation_notification after update of payment_status on public.orders
 for each row when (NEW.payment_status='paid' and OLD.payment_status is distinct from 'paid')
 execute function private.enqueue_order_confirmation();

-- Corporate low-stock alert subscriptions ---------------------------------
create table private.inventory_alert_subscriptions (
 user_id uuid not null references public.app_users(id) on delete cascade,
 market text not null references public.markets(code),
 created_at timestamptz not null default clock_timestamp(),
 primary key(user_id,market)
);
create index inventory_alert_subscriptions_market_idx on private.inventory_alert_subscriptions(market);
alter table private.inventory_alert_subscriptions enable row level security;
revoke all on private.inventory_alert_subscriptions from public,anon,authenticated,service_role;
create policy inventory_alert_subscriptions_internal_only on private.inventory_alert_subscriptions
 for all to anon,authenticated using(false) with check(false);

create function private.my_inventory_alert_subscriptions() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare allowed text[]; begin
 select array_agg(code order by array_position(array['PH','SG','MY'],code)) into allowed
  from public.markets where private.has_role(code,array['admin','operations']);
 if coalesce(cardinality(allowed),0)=0 then raise exception 'Inventory alert access denied' using errcode='42501'; end if;
 return (select jsonb_agg(jsonb_build_object('market',m,'subscribed',s.user_id is not null) order by array_position(allowed,m))
  from unnest(allowed) m left join private.inventory_alert_subscriptions s on s.user_id=private.app_user_id() and s.market=m);
end $$;

create function private.set_inventory_alert_subscription(p_market text,p_enabled boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.app_user_id(); begin
 if actor is null or p_market is null or p_enabled is null or not private.has_role(p_market,array['admin','operations']) then
  raise exception 'Inventory alert access denied' using errcode='42501';
 end if;
 if p_enabled then
  insert into private.inventory_alert_subscriptions(user_id,market) values(actor,p_market) on conflict do nothing;
 else
  delete from private.inventory_alert_subscriptions where user_id=actor and market=p_market;
 end if;
 insert into public.audit_logs(actor_id,action,entity,entity_id)
 values(actor,'INVENTORY_ALERTS_'||case when p_enabled then 'ON' else 'OFF' end||':'||p_market,'inventory_alert_subscriptions',actor::text);
 return private.my_inventory_alert_subscriptions();
end $$;

-- Internal: queue one summary per subscriber/market/day when any corporate
-- inventory row is at or below its threshold (available = on_hand - reserved).
create function private.queue_corporate_low_stock_for(report_day date) returns integer
language plpgsql security definer set search_path='' as $$
declare total integer; begin
 if report_day is null then raise exception 'Invalid report date'; end if;
 insert into private.notification_jobs(user_id,kind,reference,context)
 select s.user_id,'corporate_low_stock',md5('corporate-low-stock/'||s.user_id::text||'/'||s.market||'/'||report_day::text)::uuid,
  jsonb_build_object('market',s.market,'day',report_day,'lowStockCount',count(*)::integer,
   'items',jsonb_path_query_array(jsonb_agg(jsonb_build_object('product',left(p.name,120),'available',i.on_hand-i.reserved,
     'threshold',i.low_stock_threshold) order by i.on_hand-i.reserved,p.name),'$[0 to 99]'))
 from private.inventory_alert_subscriptions s
 join public.inventory i on i.market=s.market and i.on_hand-i.reserved<=i.low_stock_threshold
 join public.products p on p.id=i.product_id and p.status<>'archived'
 where exists(select 1 from public.staff_roles r where r.user_id=s.user_id and r.market=s.market and r.role in ('admin','operations'))
 group by s.user_id,s.market
 on conflict(kind,reference,user_id) do nothing;
 get diagnostics total=row_count;
 return total;
end $$;

create function private.queue_corporate_low_stock(report_day date) returns integer
language plpgsql security definer set search_path='' as $$ begin
 if report_day is null or report_day < (now() at time zone 'UTC')::date-2 or report_day > (now() at time zone 'UTC')::date+1 then
  raise exception 'Invalid report date';
 end if;
 return private.queue_corporate_low_stock_for(report_day);
end $$;

create function public.my_inventory_alert_subscriptions() returns jsonb
language sql stable security invoker set search_path='' as $$ select private.my_inventory_alert_subscriptions(); $$;
create function public.set_inventory_alert_subscription(p_market text,p_enabled boolean) returns jsonb
language sql security invoker set search_path='' as $$ select private.set_inventory_alert_subscription(p_market,p_enabled); $$;
create function public.queue_corporate_low_stock(report_day date) returns integer
language sql security invoker set search_path='' as $$ select private.queue_corporate_low_stock(report_day); $$;

revoke all on function private.my_inventory_alert_subscriptions(),public.my_inventory_alert_subscriptions(),
 private.set_inventory_alert_subscription(text,boolean),public.set_inventory_alert_subscription(text,boolean),
 private.queue_corporate_low_stock_for(date),private.queue_corporate_low_stock(date),public.queue_corporate_low_stock(date)
 from public,anon,authenticated,service_role;
grant execute on function private.my_inventory_alert_subscriptions(),public.my_inventory_alert_subscriptions(),
 private.set_inventory_alert_subscription(text,boolean),public.set_inventory_alert_subscription(text,boolean) to authenticated;
grant execute on function private.queue_corporate_low_stock(date),public.queue_corporate_low_stock(date) to service_role;

-- Delivery authorization: previous branches unchanged; order confirmations
-- require the order to remain paid and owned by the recipient; corporate
-- alerts require the subscription and the admin/operations role.
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
 when j.kind='sales_report' then j.tenant_id is null and exists(
  select 1 from private.report_subscriptions s join public.staff_roles r on r.user_id=s.user_id and r.market=s.market and r.role in ('admin','operations')
  where s.user_id=j.user_id and s.market=j.context->>'market' and s.frequency=j.context->>'frequency')
 when j.kind='order_confirmed' then j.tenant_id is null and exists(
  select 1 from public.orders o where o.id=j.reference and o.user_id=j.user_id and o.payment_status='paid'
  and o.status in ('paid','fulfilling','shipped','delivered'))
 when j.kind='corporate_low_stock' then j.tenant_id is null and exists(
  select 1 from private.inventory_alert_subscriptions s join public.staff_roles r on r.user_id=s.user_id and r.market=s.market and r.role in ('admin','operations')
  where s.user_id=j.user_id and s.market=j.context->>'market')
 else (j.tenant_id is null or exists(select 1 from public.tenants t join public.tenant_memberships m on m.tenant_id=t.id
  where t.id=j.tenant_id and t.active and m.user_id=j.user_id and m.role='owner')) end);
$$;
