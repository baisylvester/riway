-- Scheduled replenishment reviews use the existing optional reorder-email consent.
-- Only an approved lead time enables this email. Sending never creates an order.
alter table private.notification_jobs drop constraint notification_jobs_kind_check;
alter table private.notification_jobs add constraint notification_jobs_kind_check check(kind in (
 'support_received','event_registered','inventory_alert','store_owner_onboarding','low_inventory_report',
 'membership_requested','membership_confirmed','order_shipped','order_delivered','sales_report',
 'order_confirmed','corporate_low_stock','consultation_update','consultation_reminder','reorder_reminder',
 'return_update','replenishment_reminder'
));
create index replenishment_active_due_idx on private.replenishment_schedules(next_due_at,id) where state='active';

create table private.replenishment_reminders (
 id uuid primary key default gen_random_uuid(),
 schedule_id uuid not null references private.replenishment_schedules(id),
 cycle integer not null,
 due_at timestamptz not null,
 lead_days integer not null,
 timing_reference text not null,
 consent_revision integer not null,
 unique(schedule_id,cycle)
);
alter table private.replenishment_reminders enable row level security;
revoke all on private.replenishment_reminders from public,anon,authenticated,service_role;

create function private.replenishment_reminder_candidates()
returns table (
 schedule_id uuid, user_id uuid, market text, cycle integer, due_at timestamptz, lead_days integer,
 timing_reference text, consent_revision integer, unsubscribe_token uuid
) language sql stable security invoker set search_path='' as $$
 select s.id,s.user_id,s.market,s.cycle,s.next_due_at,p.reorder_lead_days,p.reorder_timing_reference,
  pref.revision,pref.unsubscribe_token
 from private.replenishment_schedules s
 join private.replenishment_rules r on r.id=s.rule_id and r.withdrawn_at is null
 join private.reorder_preferences pref on pref.user_id=s.user_id and pref.email_enabled
 join public.products p on p.id=s.product_id and p.category<>'Packages' and p.status='published'
 join public.product_offers f on f.product_id=s.product_id and f.market=s.market
 join public.markets m on m.code=s.market
 join public.inventory stock on stock.product_id=s.product_id and stock.market=s.market
 join public.orders source on source.id=s.source_order_id and source.user_id=s.user_id
 join public.sponsor_attributions a on a.user_id=s.user_id and a.distributor_id=s.sponsor_id
 join public.distributor_profiles d on d.user_id=s.sponsor_id and d.active and d.verified_at is not null
 left join lateral private.replenishment_current_order(s.id,s.cycle) renewal on true
 where s.state='active' and p.reorder_lead_days is not null and p.reorder_timing_reference is not null
  and s.next_due_at>now()-interval '24 hours' and s.next_due_at<=now()+interval '30 days'
  and s.next_due_at<=now()+make_interval(days=>p.reorder_lead_days)
  and f.regulatory_approved and f.approval_reference is not null and s.quantity<=f.max_quantity
  and m.online_sales_approved and m.payments_ready and m.policy_reference is not null
  and stock.on_hand-stock.reserved>=s.quantity
  and source.payment_status='paid' and source.status in ('paid','fulfilling','shipped','delivered') and source.refunded_minor=0
  and not exists(select 1 from private.return_cases c where c.order_id=source.id and c.status in ('open','in_review'))
  and (renewal.id is null or (renewal.status='cancelled' and renewal.payment_status<>'paid'))
$$;

create function private.queue_replenishment_reminders()
returns integer language sql security definer set search_path='' as $$
 with candidates as materialized (
  select c.* from private.replenishment_reminder_candidates() c
  where not exists(select 1 from private.replenishment_reminders r where r.schedule_id=c.schedule_id and r.cycle=c.cycle)
  order by c.due_at,c.schedule_id limit 100
 ), scheduled as (
  insert into private.replenishment_reminders(schedule_id,cycle,due_at,lead_days,timing_reference,consent_revision)
  select c.schedule_id,c.cycle,c.due_at,c.lead_days,c.timing_reference,c.consent_revision from candidates c
  on conflict(schedule_id,cycle) do nothing returning id,schedule_id,cycle
 ), queued as (
  insert into private.notification_jobs(user_id,kind,reference,context)
  select c.user_id,'replenishment_reminder',s.id,jsonb_build_object(
   'scheduleId',s.schedule_id,'market',c.market,'dueDate',to_char(c.due_at at time zone 'UTC','YYYY-MM-DD'),
   'unsubscribeToken',c.unsubscribe_token)
  from scheduled s join candidates c using(schedule_id,cycle) returning id
 )
 select count(*)::integer from queued
$$;

-- Suppress an ordinary reminder while a current approved schedule is active
-- for that exact product and user, including old ordinary jobs already pending.
alter function private.notification_authorized(uuid,uuid) rename to notification_authorized_before_replenishment;
create function private.notification_authorized(job uuid,token uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select case kind
  when 'replenishment_reminder' then
   j.lease=token and j.status='processing' and j.lease_until>now() and exists(
    select 1 from private.replenishment_reminders r join private.replenishment_reminder_candidates() c
      on c.schedule_id=r.schedule_id and c.cycle=r.cycle
    where r.id=j.reference and j.user_id=c.user_id and r.due_at=c.due_at and r.lead_days=c.lead_days
      and r.timing_reference=c.timing_reference and r.consent_revision=c.consent_revision
   )
  when 'reorder_reminder' then
   private.notification_authorized_before_replenishment(job,token) and not exists (
    select 1 from private.reorder_reminders rr join public.orders o on o.id=rr.order_id
    join private.replenishment_schedules s on s.user_id=rr.user_id and s.market=o.market and s.product_id=rr.product_id
    join private.replenishment_rules r on r.id=s.rule_id
    where rr.id=j.reference and s.state='active' and r.withdrawn_at is null
   )
  else private.notification_authorized_before_replenishment(job,token)
 end from private.notification_jobs j where j.id=job
$$;

create or replace function public.notification_authorized(job uuid,token uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce(private.notification_authorized(job,token),false)
$$;
create function public.queue_replenishment_reminders()
returns integer language sql security invoker set search_path='' as $$select private.queue_replenishment_reminders()$$;
revoke all on function private.replenishment_reminder_candidates(),private.queue_replenishment_reminders(),
 public.queue_replenishment_reminders(),private.notification_authorized_before_replenishment(uuid,uuid),
 private.notification_authorized(uuid,uuid),public.notification_authorized(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.queue_replenishment_reminders(),public.queue_replenishment_reminders(),
 private.notification_authorized(uuid,uuid),public.notification_authorized(uuid,uuid) to service_role;
