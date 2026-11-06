-- Keep deployed migration history intact; tighten setup and add owner controls.
create or replace function private.setup_tenant_inventory(t uuid, kind text, payload jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.tenant_access(t,array['owner']) then raise exception 'Store owner access required'; end if;
 perform private.check_rate('tenant_setup',30,60);
 if kind='location' then
  insert into public.tenant_locations(tenant_id,name,market) values(t,payload->>'name',payload->>'market');
 elsif kind='product' then
  if not exists(select 1 from public.products where id=(payload->>'product_id')::uuid and status='published') then raise exception 'Published product required'; end if;
  insert into public.tenant_products(tenant_id,product_id,sku) values(t,(payload->>'product_id')::uuid,payload->>'sku');
 elsif kind='member' then
  if payload->>'role' not in ('owner','inventory','viewer') then raise exception 'Invalid role'; end if;
  insert into public.tenant_memberships(tenant_id,user_id,role) values(t,(payload->>'user_id')::uuid,payload->>'role');
 elsif kind='access' then
  if payload->>'role' not in ('owner','inventory','viewer','revoke') then raise exception 'Invalid role'; end if;
  perform 1 from public.tenants where id=t for update;
  perform 1 from public.tenant_memberships where tenant_id=t and user_id=(payload->>'user_id')::uuid for update;
  if not found then raise exception 'Store member not found' using errcode='P0002'; end if;
  if exists(select 1 from public.tenant_memberships where tenant_id=t and user_id=(payload->>'user_id')::uuid and role='owner')
   and payload->>'role'<>'owner' and (select count(*) from public.tenant_memberships where tenant_id=t and role='owner')<=1 then raise exception 'A store must retain an owner'; end if;
  if payload->>'role'='revoke' then delete from public.tenant_memberships where tenant_id=t and user_id=(payload->>'user_id')::uuid;
  else update public.tenant_memberships set role=payload->>'role' where tenant_id=t and user_id=(payload->>'user_id')::uuid; end if;
 elsif kind='status' then
  if not private.is_platform_admin() then raise exception 'RIWAY super admin required'; end if;
  update public.tenants set active=(payload->>'active')::boolean where id=t;
 else raise exception 'Invalid setup operation'; end if;
 insert into public.audit_logs(actor_id,action,entity,entity_id) values(private.app_user_id(),'SETUP_'||upper(kind),'tenants',t::text);
end $$;

create function private.set_tenant_stock_threshold(t uuid,l uuid,p uuid,threshold integer) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.tenant_access(t,array['owner']) then raise exception 'Store owner access required'; end if;
 if threshold is null or threshold<0 or threshold>1000000 then raise exception 'Invalid stock threshold'; end if;
 perform private.check_rate('tenant_setup',30,60);
 -- Composite foreign keys enforce that both references belong to this tenant.
 insert into public.tenant_stock(tenant_id,location_id,tenant_product_id,low_stock_threshold)
 values(t,l,p,threshold)
 on conflict(tenant_id,location_id,tenant_product_id) do update
 set low_stock_threshold=excluded.low_stock_threshold,version=public.tenant_stock.version+1,updated_at=now();
 insert into public.audit_logs(actor_id,action,entity,entity_id)
 values(private.app_user_id(),'SET_LOW_STOCK_THRESHOLD','tenant_stock',t::text||'/'||l::text||'/'||p::text||':'||threshold::text);
end $$;
revoke all on function private.set_tenant_stock_threshold(uuid,uuid,uuid,integer) from public,anon;
grant execute on function private.set_tenant_stock_threshold(uuid,uuid,uuid,integer) to authenticated;
create function public.set_tenant_stock_threshold(t uuid,l uuid,p uuid,threshold integer) returns void language sql security invoker set search_path='' as $$
 select private.set_tenant_stock_threshold(t,l,p,threshold)
$$;
revoke all on function public.set_tenant_stock_threshold(uuid,uuid,uuid,integer) from public,anon;
grant execute on function public.set_tenant_stock_threshold(uuid,uuid,uuid,integer) to authenticated;
