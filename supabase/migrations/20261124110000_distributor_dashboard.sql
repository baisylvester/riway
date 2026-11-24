-- Distributor dashboard, reorder cycles, approved materials and store photo
-- (audit G04, G05; cycle data also feeds later reminders, G08).
--
-- Privacy defaults until RIWAY approves wider disclosure:
--  * Only an active, verified distributor sees data, and only for orders whose
--    frozen sponsor_id is that distributor. No downline, no other distributor.
--  * Customers appear under a stable pseudonymous label (per distributor), never
--    by name, email, phone, address or account id.
--  * Only settled orders (paid, not cancelled/refunded) within 365 days.
-- Expected reorder dates use a staff-approved per-product cycle (days of use per
-- unit); products without an approved cycle produce no date.
-- Marketing materials are approved records (approval reference required) that
-- link to approved same-site or official RIWAY image/file locations.
-- Store photos are set by compliance/admin staff from an approved location;
-- distributor self-upload with moderation remains a separate step.

alter table public.products add column replenishment_days integer
 check(replenishment_days is null or replenishment_days between 7 and 365);
alter table public.products add column replenishment_reference text
 check(replenishment_reference is null or length(replenishment_reference) between 3 and 120);
alter table public.products add constraint products_replenishment_approved
 check((replenishment_days is null)=(replenishment_reference is null));

alter table public.distributor_profiles add column photo_url text
 check(photo_url is null or (length(photo_url)<=500 and (photo_url ~ '^/images/[a-zA-Z0-9._-]+$' or photo_url ~ '^https://static[.]wixstatic[.]com/[A-Za-z0-9._~/%-]+$')));
alter table public.distributor_profiles add column photo_reference text
 check(photo_reference is null or length(photo_reference) between 3 and 120);
alter table public.distributor_profiles add constraint distributor_photo_approved
 check((photo_url is null)=(photo_reference is null));

create table private.distributor_materials (
 id uuid primary key default gen_random_uuid(),
 market text references public.markets(code),
 title text not null check(length(title) between 3 and 120),
 description text not null default '' check(length(description)<=500),
 url text not null check(length(url)<=500 and (url ~ '^/[A-Za-z0-9._~%-][A-Za-z0-9._~/%-]*$' or url ~ '^https://(static[.]wixstatic[.]com|www[.]riway[.]com|riway[.]com)/[A-Za-z0-9._~/%?=&-]*$')),
 approval_reference text not null check(length(approval_reference) between 3 and 120),
 published boolean not null default true,
 created_by uuid not null references public.app_users(id),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp()
);
create index distributor_materials_market_idx on private.distributor_materials(market) where published;
alter table private.distributor_materials enable row level security;
revoke all on private.distributor_materials from public,anon,authenticated,service_role;
create policy distributor_materials_internal_only on private.distributor_materials for all to anon,authenticated using(false) with check(false);

-- The caller's verified distributor profile, or null.
create function private.my_verified_distributor() returns public.distributor_profiles
language sql stable security definer set search_path='' as $$
 select d.* from public.distributor_profiles d where d.user_id=private.app_user_id() and d.active and d.verified_at is not null;
$$;
revoke all on function private.my_verified_distributor() from public,anon,authenticated,service_role;

create function private.my_distributor_dashboard() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare d public.distributor_profiles; begin
 d:=private.my_verified_distributor();
 if d.user_id is null then raise exception 'Verified distributor access required' using errcode='42501'; end if;
 return (with settled as (
  select o.id,o.user_id,o.market,o.currency,o.status,o.total_minor,o.created_at,
   'Customer '||upper(substr(md5(d.user_id::text||'/'||o.user_id::text),1,6)) as label
  from public.orders o where o.sponsor_id=d.user_id and o.payment_status='paid'
   and o.status in ('paid','fulfilling','shipped','delivered') and o.created_at>=clock_timestamp()-interval '365 days'
 ), cycles as (
  select s.user_id,s.id,s.created_at,
   min(s.created_at+make_interval(days=>p.replenishment_days*i.quantity)) as due
  from settled s join public.order_items i on i.order_id=s.id join public.products p on p.id=i.product_id
  where p.replenishment_days is not null group by s.user_id,s.id,s.created_at
 ), latest as (
  select distinct on (user_id) user_id,due from cycles order by user_id,created_at desc
 )
 select jsonb_build_object('code',d.code,'market',d.market,
  'orders',coalesce((select jsonb_agg(jsonb_build_object('reference',upper(substr(s.id::text,1,8)),'placedAt',s.created_at,'market',s.market,
    'status',s.status,'currency',s.currency,'totalMinor',s.total_minor,'customer',s.label,
    'units',(select coalesce(sum(quantity),0) from public.order_items where order_id=s.id)) order by s.created_at desc)
   from (select * from settled order by created_at desc limit 100) s),'[]'::jsonb),
  'customers',coalesce((select jsonb_agg(c order by c->>'lastOrderAt' desc) from (
    select jsonb_build_object('customer',min(s.label),'firstOrderAt',min(s.created_at),'lastOrderAt',max(s.created_at),
     'paidOrders',count(*),'expectedReorderOn',(select to_char(l.due at time zone 'UTC','YYYY-MM-DD') from latest l where l.user_id=s.user_id)) c
    from settled s group by s.user_id limit 200) t),'[]'::jsonb),
  'materials',coalesce((select jsonb_agg(jsonb_build_object('title',m.title,'description',m.description,'url',m.url) order by m.created_at desc)
   from private.distributor_materials m where m.published and (m.market is null or m.market=d.market)),'[]'::jsonb)));
end $$;

-- Public store lookup with the approved photo (additive; lookup_distributor is unchanged).
create function private.lookup_distributor_store(c text) returns table(code text,display_name text,market text,photo_url text)
language sql stable security definer set search_path='' as $$
 select d.code,d.display_name,d.market,d.photo_url from public.distributor_profiles d where d.code=c and d.active and d.verified_at is not null;
$$;

-- Staff: approved reorder cycle per product (admin/compliance, any market, MFA).
create function private.set_product_replenishment(p_product uuid,p_days integer,p_reference text) returns void
language plpgsql security definer set search_path='' as $$
declare v_ref text:=nullif(btrim(p_reference),''); begin
 if not private.has_role(null,array['admin','compliance']) then raise exception 'Product cycle access denied' using errcode='42501'; end if;
 if (p_days is null)<>(v_ref is null) then raise exception 'A reorder cycle needs an approval reference'; end if;
 update public.products set replenishment_days=p_days,replenishment_reference=v_ref where id=p_product;
 if not found then raise exception 'Product not found'; end if;
 insert into public.audit_logs(actor_id,action,entity,entity_id)
 values(private.app_user_id(),'PRODUCT_REPLENISHMENT:'||coalesce(p_days::text,'off'),'products',p_product::text);
end $$;

-- Staff: approved distributor store photo (admin/compliance in the distributor's market, MFA).
create function private.set_distributor_photo(p_code text,p_url text,p_reference text) returns void
language plpgsql security definer set search_path='' as $$
declare d public.distributor_profiles; v_url text:=nullif(btrim(p_url),''); v_ref text:=nullif(btrim(p_reference),''); begin
 select * into d from public.distributor_profiles where code=p_code;
 if not found or not private.has_role(d.market,array['admin','compliance']) then raise exception 'Distributor photo access denied' using errcode='42501'; end if;
 if (v_url is null)<>(v_ref is null) then raise exception 'A photo needs an approval reference'; end if;
 update public.distributor_profiles set photo_url=v_url,photo_reference=v_ref where user_id=d.user_id;
 insert into public.audit_logs(actor_id,action,entity,entity_id)
 values(private.app_user_id(),'DISTRIBUTOR_PHOTO:'||case when v_url is null then 'removed' else 'approved' end,'distributor_profiles',d.user_id::text);
end $$;

-- Staff: approved marketing materials (admin/editor/compliance with MFA; a
-- market-specific item needs that market, an all-market item any market).
create function private.save_distributor_material(p_id uuid,p_market text,p_title text,p_description text,p_url text,p_reference text,p_published boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare existing private.distributor_materials; result uuid; actor uuid:=private.app_user_id(); begin
 if not private.has_role(p_market,array['admin','editor','compliance']) then raise exception 'Material access denied' using errcode='42501'; end if;
 if p_id is null then
  insert into private.distributor_materials(market,title,description,url,approval_reference,published,created_by)
  values(p_market,btrim(p_title),coalesce(btrim(p_description),''),btrim(p_url),btrim(p_reference),coalesce(p_published,true),actor) returning id into result;
 else
  select * into existing from private.distributor_materials where id=p_id for update;
  if not found or not private.has_role(existing.market,array['admin','editor','compliance']) then raise exception 'Material access denied' using errcode='42501'; end if;
  update private.distributor_materials set market=p_market,title=btrim(p_title),description=coalesce(btrim(p_description),''),url=btrim(p_url),
   approval_reference=btrim(p_reference),published=coalesce(p_published,true),updated_at=clock_timestamp() where id=p_id returning id into result;
 end if;
 insert into public.audit_logs(actor_id,action,entity,entity_id) values(actor,'DISTRIBUTOR_MATERIAL_SAVED','distributor_materials',result::text);
 return result;
end $$;

create function private.staff_distributor_materials() returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
 if not private.has_role(null,array['admin','editor','compliance']) then raise exception 'Material access denied' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'market',m.market,'title',m.title,'description',m.description,'url',m.url,
  'approvalReference',m.approval_reference,'published',m.published,'updatedAt',m.updated_at) order by m.updated_at desc)
  from private.distributor_materials m where m.market is null or private.has_role(m.market,array['admin','editor','compliance'])),'[]'::jsonb);
end $$;

create function public.my_distributor_dashboard() returns jsonb language sql stable security invoker set search_path='' as $$ select private.my_distributor_dashboard() $$;
create function public.lookup_distributor_store(c text) returns table(code text,display_name text,market text,photo_url text)
 language sql stable security invoker set search_path='' as $$ select * from private.lookup_distributor_store(c) $$;
create function public.set_product_replenishment(p_product uuid,p_days integer,p_reference text) returns void
 language sql security invoker set search_path='' as $$ select private.set_product_replenishment(p_product,p_days,p_reference) $$;
create function public.set_distributor_photo(p_code text,p_url text,p_reference text) returns void
 language sql security invoker set search_path='' as $$ select private.set_distributor_photo(p_code,p_url,p_reference) $$;
create function public.save_distributor_material(p_id uuid,p_market text,p_title text,p_description text,p_url text,p_reference text,p_published boolean)
 returns uuid language sql security invoker set search_path='' as $$ select private.save_distributor_material(p_id,p_market,p_title,p_description,p_url,p_reference,p_published) $$;
create function public.staff_distributor_materials() returns jsonb language sql stable security invoker set search_path='' as $$ select private.staff_distributor_materials() $$;

revoke all on function private.my_distributor_dashboard(),public.my_distributor_dashboard(),
 private.lookup_distributor_store(text),public.lookup_distributor_store(text),
 private.set_product_replenishment(uuid,integer,text),public.set_product_replenishment(uuid,integer,text),
 private.set_distributor_photo(text,text,text),public.set_distributor_photo(text,text,text),
 private.save_distributor_material(uuid,text,text,text,text,text,boolean),public.save_distributor_material(uuid,text,text,text,text,text,boolean),
 private.staff_distributor_materials(),public.staff_distributor_materials()
 from public,anon,authenticated,service_role;
grant execute on function private.lookup_distributor_store(text),public.lookup_distributor_store(text) to anon,authenticated;
grant execute on function private.my_distributor_dashboard(),public.my_distributor_dashboard(),
 private.set_product_replenishment(uuid,integer,text),public.set_product_replenishment(uuid,integer,text),
 private.set_distributor_photo(text,text,text),public.set_distributor_photo(text,text,text),
 private.save_distributor_material(uuid,text,text,text,text,text,boolean),public.save_distributor_material(uuid,text,text,text,text,text,boolean),
 private.staff_distributor_materials(),public.staff_distributor_materials() to authenticated;
