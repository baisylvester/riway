-- Scheduled sales reports. Market administrators and operations staff (verified
-- MFA) subscribe themselves to a weekly or monthly sales summary email per
-- market. The notification worker queues due reports with the same daily report
-- hour as the low-inventory report: weekly reports on Mondays cover the previous
-- Monday-Sunday, monthly reports on the 1st cover the previous calendar month
-- (UTC order-placement days, settled orders only, as in staff_sales_report).
-- Delivery rechecks the subscription and the staff role; the email holds totals
-- and top products only and links to the signed-in report for full detail.
create table private.report_subscriptions (
 user_id uuid not null references public.app_users(id) on delete cascade,
 market text not null references public.markets(code),
 frequency text not null check(frequency in ('weekly','monthly')),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 primary key(user_id,market)
);
create index report_subscriptions_market_idx on private.report_subscriptions(market);
alter table private.report_subscriptions enable row level security;
revoke all on private.report_subscriptions from public,anon,authenticated,service_role;
create policy report_subscriptions_internal_only on private.report_subscriptions for all to anon,authenticated using(false) with check(false);

alter table private.notification_jobs drop constraint notification_jobs_kind_check;
alter table private.notification_jobs add constraint notification_jobs_kind_check check(kind in
 ('support_received','event_registered','store_owner_onboarding','low_inventory_report','membership_requested','membership_confirmed',
  'order_shipped','order_delivered','sales_report'));

-- The caller's subscriptions for the markets they can currently report on.
create function private.my_report_subscriptions() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare allowed text[]; begin
 select array_agg(code order by array_position(array['PH','SG','MY'],code)) into allowed
  from public.markets where private.has_role(code,array['admin','operations']);
 if coalesce(cardinality(allowed),0)=0 then raise exception 'Sales reporting access denied' using errcode='42501'; end if;
 return (select jsonb_agg(jsonb_build_object('market',m,'frequency',s.frequency) order by array_position(allowed,m))
  from unnest(allowed) m left join private.report_subscriptions s on s.user_id=private.app_user_id() and s.market=m);
end $$;

-- Subscribe, change frequency, or unsubscribe (null frequency) for one market.
create function private.set_report_subscription(p_market text,p_frequency text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.app_user_id(); begin
 if actor is null or p_market is null or not private.has_role(p_market,array['admin','operations']) then
  raise exception 'Sales reporting access denied' using errcode='42501';
 end if;
 if p_frequency is null then
  delete from private.report_subscriptions where user_id=actor and market=p_market;
 elsif p_frequency in ('weekly','monthly') then
  insert into private.report_subscriptions(user_id,market,frequency) values(actor,p_market,p_frequency)
  on conflict(user_id,market) do update set frequency=excluded.frequency,updated_at=clock_timestamp();
 else raise exception 'Choose weekly or monthly reports';
 end if;
 insert into public.audit_logs(actor_id,action,entity,entity_id)
 values(actor,'REPORT_SUBSCRIPTION_'||upper(coalesce(p_frequency,'off'))||':'||p_market,'report_subscriptions',actor::text);
 return private.my_report_subscriptions();
end $$;

-- Internal: queue reports due on report_day. Not granted to any API role; the
-- guarded wrapper below limits the day to the current UTC date window.
create function private.queue_sales_reports_for(report_day date) returns integer
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
  select d.user_id,d.market,o.id,o.subtotal_minor,o.discount_minor,o.total_minor from due d join public.orders o
   on o.market=d.market and o.payment_status='paid' and o.status in ('paid','fulfilling','shipped','delivered')
   and o.created_at>=(d.period_from::timestamp at time zone 'UTC') and o.created_at<((d.period_to+1)::timestamp at time zone 'UTC')
 )
 insert into private.notification_jobs(user_id,kind,reference,context)
 select d.user_id,'sales_report',md5('sales-report/'||d.user_id::text||'/'||d.market||'/'||d.frequency||'/'||d.period_from::text)::uuid,
  jsonb_build_object('market',d.market,'currency',m.currency,'frequency',d.frequency,'from',d.period_from,'to',d.period_to,
   'orders',(select count(*) from settled x where x.user_id=d.user_id and x.market=d.market),
   'subtotalMinor',(select coalesce(sum(subtotal_minor),0) from settled x where x.user_id=d.user_id and x.market=d.market),
   'discountMinor',(select coalesce(sum(discount_minor),0) from settled x where x.user_id=d.user_id and x.market=d.market),
   'totalMinor',(select coalesce(sum(total_minor),0) from settled x where x.user_id=d.user_id and x.market=d.market),
   'topProducts',coalesce((select jsonb_agg(jsonb_build_object('name',name,'units',units,'netMinor',net) order by net desc,name)
    from (select left(max(i.product_name),120) as name,sum(i.quantity) units,sum(i.net_minor) net
     from settled x join public.order_items i on i.order_id=x.id where x.user_id=d.user_id and x.market=d.market
     group by i.product_id order by sum(i.net_minor) desc limit 5) t),'[]'::jsonb))
 from due d join public.markets m on m.code=d.market
 -- Only staff who still hold the role are queued; delivery checks again.
 where exists(select 1 from public.staff_roles r where r.user_id=d.user_id and r.market=d.market and r.role in ('admin','operations'))
 on conflict(kind,reference,user_id) do nothing;
 get diagnostics total=row_count;
 return total;
end $$;

create function private.queue_sales_reports(report_day date) returns integer
language plpgsql security definer set search_path='' as $$ begin
 if report_day is null or report_day < (now() at time zone 'UTC')::date-2 or report_day > (now() at time zone 'UTC')::date+1 then
  raise exception 'Invalid report date';
 end if;
 return private.queue_sales_reports_for(report_day);
end $$;

create function public.my_report_subscriptions() returns jsonb
language sql stable security invoker set search_path='' as $$ select private.my_report_subscriptions(); $$;
create function public.set_report_subscription(p_market text,p_frequency text) returns jsonb
language sql security invoker set search_path='' as $$ select private.set_report_subscription(p_market,p_frequency); $$;
create function public.queue_sales_reports(report_day date) returns integer
language sql security invoker set search_path='' as $$ select private.queue_sales_reports(report_day); $$;

revoke all on function private.my_report_subscriptions(),public.my_report_subscriptions(),
 private.set_report_subscription(text,text),public.set_report_subscription(text,text),
 private.queue_sales_reports_for(date),private.queue_sales_reports(date),public.queue_sales_reports(date)
 from public,anon,authenticated,service_role;
grant execute on function private.my_report_subscriptions(),public.my_report_subscriptions(),
 private.set_report_subscription(text,text),public.set_report_subscription(text,text) to authenticated;
grant execute on function private.queue_sales_reports(date),public.queue_sales_reports(date) to service_role;

-- Sales reports are delivered only while the subscription and the market
-- admin/operations role both still exist. Other kinds are unchanged.
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
 else (j.tenant_id is null or exists(select 1 from public.tenants t join public.tenant_memberships m on m.tenant_id=t.id
  where t.id=j.tenant_id and t.active and m.user_id=j.user_id and m.role='owner')) end);
$$;
