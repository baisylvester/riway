-- Store-owner onboarding and a once-per-day low-inventory report for each owner.
alter table private.notification_jobs drop constraint notification_jobs_kind_check;
alter table private.notification_jobs add constraint notification_jobs_kind_check
 check(kind in ('support_received','event_registered','store_owner_onboarding','low_inventory_report'));
alter table private.notification_jobs drop constraint notification_jobs_kind_reference_key;
alter table private.notification_jobs add constraint notification_dedup unique(kind,reference,user_id);
alter table private.notification_jobs add column tenant_id uuid references public.tenants(id);
alter table private.notification_jobs add column context jsonb not null default '{}'::jsonb check(jsonb_typeof(context)='object');
create index notification_tenant_idx on private.notification_jobs(tenant_id);

create or replace function private.enqueue_notification() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.notification_jobs(user_id,kind,reference)
 values(NEW.user_id,case when TG_TABLE_NAME='support_tickets' then 'support_received' else 'event_registered' end,NEW.id)
 on conflict(kind,reference,user_id) do nothing;
 return NEW;
end $$;

create function private.enqueue_owner_onboarding() returns trigger language plpgsql security definer set search_path='' as $$
declare store_name text; begin
 if NEW.role<>'owner' then return NEW; end if;
 if TG_OP='UPDATE' and OLD.role='owner' then return NEW; end if;
 select name into store_name from public.tenants where id=NEW.tenant_id and active;
 if store_name is null then return NEW; end if;
 insert into private.notification_jobs(user_id,kind,reference,tenant_id,context)
 values(NEW.user_id,'store_owner_onboarding',NEW.tenant_id,NEW.tenant_id,jsonb_build_object('store',store_name))
 on conflict(kind,reference,user_id) do nothing;
 return NEW;
end $$;
revoke all on function private.enqueue_owner_onboarding() from public,anon,authenticated;
create trigger owner_onboarding after insert or update of role on public.tenant_memberships
 for each row execute function private.enqueue_owner_onboarding();

create function private.queue_low_inventory_reports(report_day date) returns integer language plpgsql security definer set search_path='' as $$
declare total integer; begin
 if report_day is null or report_day < (now() at time zone 'UTC')::date-2 or report_day > (now() at time zone 'UTC')::date+1 then raise exception 'Invalid report date'; end if;
 insert into private.notification_jobs(user_id,kind,reference,tenant_id,context)
 select m.user_id,'low_inventory_report',md5('low-inventory/'||t.id::text||'/'||report_day::text)::uuid,t.id,
  jsonb_build_object('store',t.name,'day',report_day,'lowStockCount',count(*)::integer,
   'items',jsonb_path_query_array(jsonb_agg(jsonb_build_object('sku',p.sku,'location',l.name,'available',s.on_hand-s.reserved-s.allocated-s.damaged,'threshold',s.low_stock_threshold) order by p.sku,l.name),'$[0 to 99]'))
 from public.tenants t join public.tenant_memberships m on m.tenant_id=t.id and m.role='owner'
 join public.tenant_stock s on s.tenant_id=t.id
 join public.tenant_products p on p.id=s.tenant_product_id and p.tenant_id=t.id
 join public.tenant_locations l on l.id=s.location_id and l.tenant_id=t.id
 where t.active and s.on_hand-s.reserved-s.allocated-s.damaged<=s.low_stock_threshold
 group by t.id,t.name,m.user_id
 on conflict(kind,reference,user_id) do nothing;
 get diagnostics total=row_count;
 return total;
end $$;
revoke all on function private.queue_low_inventory_reports(date) from public,anon,authenticated;
grant execute on function private.queue_low_inventory_reports(date) to service_role;
create function public.queue_low_inventory_reports(report_day date) returns integer language sql security invoker set search_path='' as $$ select private.queue_low_inventory_reports(report_day) $$;
revoke all on function public.queue_low_inventory_reports(date) from public,anon,authenticated;
grant execute on function public.queue_low_inventory_reports(date) to service_role;

-- Recheck role and tenant status at delivery time. Revoked owners receive no report.
create function private.notification_authorized(job uuid,token uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.notification_jobs j where j.id=job and j.lease=token and j.status='processing' and j.lease_until>now()
  and (j.tenant_id is null or exists(select 1 from public.tenants t join public.tenant_memberships m on m.tenant_id=t.id
   where t.id=j.tenant_id and t.active and m.user_id=j.user_id and m.role='owner')));
$$;
revoke all on function private.notification_authorized(uuid,uuid) from public,anon,authenticated;
grant execute on function private.notification_authorized(uuid,uuid) to service_role;
create function public.notification_authorized(job uuid,token uuid) returns boolean language sql stable security invoker set search_path='' as $$ select private.notification_authorized(job,token) $$;
revoke all on function public.notification_authorized(uuid,uuid) from public,anon,authenticated;
grant execute on function public.notification_authorized(uuid,uuid) to service_role;
