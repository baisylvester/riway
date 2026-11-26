-- Reorder email is optional and off by default. Timing is approved per product;
-- there is no invented campaign, subscription mandate or automatic charge.
alter table public.products add column reorder_lead_days integer check(reorder_lead_days between 0 and 30),
 add column reorder_timing_reference text check(length(btrim(reorder_timing_reference)) between 3 and 120);
alter table public.products add constraint reorder_timing_approved check((reorder_lead_days is null)=(reorder_timing_reference is null));
create table private.reorder_preferences (
 user_id uuid primary key references public.app_users(id),email_enabled boolean not null default false,
 consent_version text not null check(consent_version='reorder-email-v1'),revision integer not null default 0,
 unsubscribe_token uuid not null unique default gen_random_uuid(),updated_at timestamptz not null default clock_timestamp()
);
create table private.reorder_reminders (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id),
 order_id uuid not null references public.orders(id),product_id uuid not null references public.products(id),
 due_at timestamptz not null,cycle_days integer not null,lead_days integer not null,
 timing_reference text not null,consent_revision integer not null,
 unique(order_id,product_id)
);
create index reorder_reminder_user_idx on private.reorder_reminders(user_id);
create index reorder_reminder_product_idx on private.reorder_reminders(product_id);
alter table private.reorder_preferences enable row level security;
alter table private.reorder_reminders enable row level security;
revoke all on private.reorder_preferences,private.reorder_reminders from public,anon,authenticated,service_role;
create policy reorder_preferences_internal on private.reorder_preferences for all using(false) with check(false);
create policy reorder_reminders_internal on private.reorder_reminders for all using(false) with check(false);
create function private.my_reorder_preference() returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 if private.app_user_id() is null then raise exception 'Sign in required' using errcode='42501';end if;
 return coalesce((select jsonb_build_object('emailEnabled',email_enabled,'revision',revision,'consentVersion',consent_version,'updatedAt',updated_at)from private.reorder_preferences where user_id=private.app_user_id()),jsonb_build_object('emailEnabled',false,'revision',0,'consentVersion','reorder-email-v1','updatedAt',null));
end $$;
create function private.set_reorder_preference(p_enabled boolean,p_revision integer,p_version text) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.app_user_id();r private.reorder_preferences;begin
 if actor is null then raise exception 'Sign in required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,2508));
 select * into r from private.reorder_preferences where user_id=actor for update;
 if p_revision is null or p_revision<>coalesce(r.revision,0)then raise exception 'Preferences changed; reload' using errcode='40001';end if;
 if p_enabled is null or p_version is null or p_version<>'reorder-email-v1' then raise exception 'Current consent is required' using errcode='22023';end if;
 insert into private.reorder_preferences(user_id,email_enabled,consent_version,revision)values(actor,p_enabled,p_version,1)
 on conflict(user_id)do update set email_enabled=p_enabled,revision=private.reorder_preferences.revision+1,updated_at=clock_timestamp();
 insert into public.audit_logs(actor_id,action,entity,entity_id)values(actor,case when p_enabled then 'REORDER_EMAIL_OPT_IN:reorder-email-v1' else 'REORDER_EMAIL_OPT_OUT' end,'app_users',actor::text);
end $$;
create function private.unsubscribe_reorder(p_token uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare u uuid;begin
 update private.reorder_preferences set email_enabled=false,revision=revision+1,updated_at=clock_timestamp()
 where unsubscribe_token=p_token and email_enabled returning user_id into u;
 if u is not null then insert into public.audit_logs(actor_id,action,entity,entity_id)values(u,'REORDER_EMAIL_LINK_OPT_OUT','app_users',u::text);end if;
 return true; -- Do not reveal whether a token exists; bearer can only opt out.
end $$;
create function private.set_reorder_timing(p_product uuid,p_days integer,p_reference text) returns void language plpgsql security definer set search_path='' as $$ begin
 if not private.has_role(null,array['admin','compliance'])then raise exception 'Timing approval denied' using errcode='42501';end if;
 if (p_days is null)<>(nullif(btrim(p_reference),'')is null)then raise exception 'Timing approval reference required' using errcode='22023';end if;
 update public.products set reorder_lead_days=p_days,reorder_timing_reference=nullif(btrim(p_reference),'')where id=p_product;
 if not found then raise exception 'Product unavailable' using errcode='22023';end if;
 insert into public.audit_logs(actor_id,action,entity,entity_id)values(private.app_user_id(),'REORDER_TIMING_APPROVED','products',p_product::text);
end $$;
alter table private.notification_jobs drop constraint notification_jobs_kind_check;
alter table private.notification_jobs add constraint notification_jobs_kind_check check(kind in
 ('support_received','event_registered','inventory_alert','store_owner_onboarding','low_inventory_report','membership_requested','membership_confirmed',
 'order_shipped','order_delivered','sales_report','order_confirmed','corporate_low_stock','consultation_update','consultation_reminder','reorder_reminder'));
create function private.queue_reorder_reminders()returns integer language plpgsql security definer set search_path='' as $$
declare candidate record;r uuid;total integer:=0;begin
 for candidate in
 select o.id as order_id,o.user_id,o.market,i.product_id,p.replenishment_days as cycle_days,p.reorder_lead_days as lead_days,p.reorder_timing_reference,
 o.created_at+make_interval(days=>p.replenishment_days*i.quantity)as due_at,pref.revision,pref.unsubscribe_token
 from public.orders o join public.order_items i on i.order_id=o.id join public.products p on p.id=i.product_id
 join private.reorder_preferences pref on pref.user_id=o.user_id and pref.email_enabled
 join public.product_offers f on f.product_id=p.id and f.market=o.market join public.markets market_policy on market_policy.code=o.market
 join public.inventory stock on stock.product_id=p.id and stock.market=o.market
 where o.payment_status='paid' and o.status in('paid','fulfilling','shipped','delivered')and p.status='published'
 and p.replenishment_days is not null and p.reorder_lead_days is not null and f.regulatory_approved and market_policy.online_sales_approved and market_policy.payments_ready and stock.on_hand>stock.reserved
 and o.created_at+make_interval(days=>p.replenishment_days*i.quantity)>now()
 and o.created_at+make_interval(days=>p.replenishment_days*i.quantity-p.reorder_lead_days)<=now()
 and not exists(select 1 from public.orders later join public.order_items li on li.order_id=later.id
  where later.user_id=o.user_id and later.market=o.market and li.product_id=p.id and later.payment_status='paid'
  and later.status in('paid','fulfilling','shipped','delivered')and(later.created_at,later.id)>(o.created_at,o.id))
 and not exists(select 1 from private.reorder_reminders rr where rr.order_id=o.id and rr.product_id=p.id)
 order by o.created_at limit 100 loop
  insert into private.reorder_reminders(user_id,order_id,product_id,due_at,cycle_days,lead_days,timing_reference,consent_revision)
  values(candidate.user_id,candidate.order_id,candidate.product_id,candidate.due_at,candidate.cycle_days,candidate.lead_days,candidate.reorder_timing_reference,candidate.revision)
  on conflict do nothing returning id into r;
  if r is not null then
   insert into private.notification_jobs(user_id,kind,reference,context)values(candidate.user_id,'reorder_reminder',r,jsonb_build_object('orderId',candidate.order_id,'market',candidate.market,'unsubscribeToken',candidate.unsubscribe_token));total:=total+1;
  end if;
 end loop;return total;
end $$;
alter function private.notification_authorized(uuid,uuid)rename to notification_authorized_before_reorder;
create function private.notification_authorized(job uuid,token uuid)returns boolean language sql stable security definer set search_path='' as $$
 select case when(select kind from private.notification_jobs where id=job)='reorder_reminder'then exists(
  select 1 from private.notification_jobs j join private.reorder_reminders r on r.id=j.reference
  join private.reorder_preferences pref on pref.user_id=r.user_id join public.products p on p.id=r.product_id
  join public.orders o on o.id=r.order_id join public.product_offers f on f.product_id=p.id and f.market=o.market join public.markets market_policy on market_policy.code=o.market
  join public.inventory stock on stock.product_id=p.id and stock.market=o.market
  where j.id=job and j.lease=token and j.status='processing'and j.lease_until>now()and j.user_id=r.user_id
  and pref.email_enabled and pref.revision=r.consent_revision and r.due_at>now()
  and p.replenishment_days=r.cycle_days and p.reorder_lead_days=r.lead_days and p.reorder_timing_reference=r.timing_reference
  and o.payment_status='paid'and o.status in('paid','fulfilling','shipped','delivered')and p.status='published'and f.regulatory_approved and market_policy.online_sales_approved and market_policy.payments_ready and stock.on_hand>stock.reserved
  and not exists(select 1 from public.orders later join public.order_items li on li.order_id=later.id where later.user_id=o.user_id and later.market=o.market and li.product_id=p.id and later.payment_status='paid'and later.status in('paid','fulfilling','shipped','delivered')and(later.created_at,later.id)>(o.created_at,o.id)))
 else private.notification_authorized_before_reorder(job,token)end
$$;
create function public.my_reorder_preference()returns jsonb language sql stable security invoker set search_path='' as $$select private.my_reorder_preference()$$;
create function public.set_reorder_preference(p_enabled boolean,p_revision integer,p_version text)returns void language sql security invoker set search_path='' as $$select private.set_reorder_preference(p_enabled,p_revision,p_version)$$;
create function public.unsubscribe_reorder(p_token uuid)returns boolean language sql security invoker set search_path='' as $$select private.unsubscribe_reorder(p_token)$$;
create function public.set_reorder_timing(p_product uuid,p_days integer,p_reference text)returns void language sql security invoker set search_path='' as $$select private.set_reorder_timing(p_product,p_days,p_reference)$$;
create function public.queue_reorder_reminders()returns integer language sql security invoker set search_path='' as $$select private.queue_reorder_reminders()$$;
revoke all on function private.my_reorder_preference(),public.my_reorder_preference(),private.set_reorder_preference(boolean,integer,text),public.set_reorder_preference(boolean,integer,text),
 private.unsubscribe_reorder(uuid),public.unsubscribe_reorder(uuid),private.set_reorder_timing(uuid,integer,text),public.set_reorder_timing(uuid,integer,text),private.queue_reorder_reminders(),public.queue_reorder_reminders(),
 private.notification_authorized(uuid,uuid),private.notification_authorized_before_reorder(uuid,uuid)from public,anon,authenticated,service_role;
grant execute on function private.my_reorder_preference(),public.my_reorder_preference(),private.set_reorder_preference(boolean,integer,text),public.set_reorder_preference(boolean,integer,text),private.set_reorder_timing(uuid,integer,text),public.set_reorder_timing(uuid,integer,text)to authenticated;
grant execute on function private.unsubscribe_reorder(uuid),public.unsubscribe_reorder(uuid)to anon,authenticated;
grant execute on function private.queue_reorder_reminders(),public.queue_reorder_reminders(),private.notification_authorized(uuid,uuid)to service_role;

alter function private.export_my_data()rename to export_my_data_before_preferences;
create function private.export_my_data()returns jsonb language sql security definer set search_path='' as $$
 select private.export_my_data_before_preferences()||jsonb_build_object('reorderPreferences',private.my_reorder_preference())
$$;
revoke all on function private.export_my_data(),private.export_my_data_before_preferences()from public,anon,authenticated,service_role;
grant execute on function private.export_my_data()to authenticated;
