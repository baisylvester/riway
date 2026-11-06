-- Independent tenant stock. Existing RIWAY commerce inventory remains unchanged.
create table private.platform_admins(user_id uuid primary key references public.app_users(id));
revoke all on private.platform_admins from public,anon,authenticated;
create function private.is_platform_admin() returns boolean language sql stable security definer set search_path='' as $$
 select private.mfa_verified() and exists(select 1 from private.platform_admins where user_id=(select private.app_user_id()));
$$;
revoke all on function private.is_platform_admin() from public;
grant execute on function private.is_platform_admin() to authenticated;
create function public.is_platform_admin() returns boolean language sql stable security invoker set search_path='' as $$ select private.is_platform_admin() $$;
revoke all on function public.is_platform_admin() from public,anon;
grant execute on function public.is_platform_admin() to authenticated;

create table public.tenants(
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 2 and 120),
 active boolean not null default true, created_at timestamptz not null default now()
);
create table public.tenant_memberships(
 tenant_id uuid references public.tenants(id), user_id uuid references public.app_users(id),
 role text not null check(role in ('owner','inventory','viewer')), primary key(tenant_id,user_id)
);
create index tenant_membership_user_idx on public.tenant_memberships(user_id);
create function private.tenant_access(t uuid, roles text[] default array['owner','inventory','viewer']) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_platform_admin() or (private.mfa_verified() and exists(select 1 from public.tenants where id=t and active)
 and exists(select 1 from public.tenant_memberships where tenant_id=t and user_id=(select private.app_user_id()) and role=any(roles)));
$$;
revoke all on function private.tenant_access(uuid,text[]) from public;
grant execute on function private.tenant_access(uuid,text[]) to authenticated;

create table public.tenant_locations(
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 name text not null check(length(name) between 2 and 100), market text not null references public.markets(code),
 unique(id,tenant_id), unique(tenant_id,name)
);
create table public.tenant_products(
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 product_id uuid not null references public.products(id), sku text not null check(sku ~ '^[A-Za-z0-9._-]{1,64}$'),
 unique(id,tenant_id), unique(tenant_id,sku), unique(tenant_id,product_id)
);
create index tenant_products_product_idx on public.tenant_products(product_id);
create table public.tenant_stock(
 tenant_id uuid not null references public.tenants(id), location_id uuid not null, tenant_product_id uuid not null,
 on_hand integer not null default 0, reserved integer not null default 0, allocated integer not null default 0,
 damaged integer not null default 0, low_stock_threshold integer not null default 5 check(low_stock_threshold>=0),
 version bigint not null default 0, updated_at timestamptz not null default now(),
 primary key(tenant_id,location_id,tenant_product_id),
 foreign key(location_id,tenant_id) references public.tenant_locations(id,tenant_id),
 foreign key(tenant_product_id,tenant_id) references public.tenant_products(id,tenant_id),
 check(on_hand>=0 and reserved>=0 and allocated>=0 and damaged>=0 and reserved::bigint+allocated+damaged<=on_hand)
);
create index tenant_stock_location_idx on public.tenant_stock(location_id,tenant_id);
create index tenant_stock_product_idx on public.tenant_stock(tenant_product_id,tenant_id);
create table public.tenant_stock_ledger(
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 location_id uuid not null, tenant_product_id uuid not null, actor_id uuid not null references public.app_users(id),
 operation text not null check(operation in ('receive','adjust','reserve','release','allocate','fulfill','damage','restore')),
 quantity integer not null check(quantity<>0 and quantity between -1000000 and 1000000), reason text not null check(length(reason) between 5 and 500),
 idempotency_key uuid not null, request_payload jsonb not null, balance_after jsonb not null,
 created_at timestamptz not null default now(), unique(tenant_id,idempotency_key),
 foreign key(location_id,tenant_id) references public.tenant_locations(id,tenant_id),
 foreign key(tenant_product_id,tenant_id) references public.tenant_products(id,tenant_id)
);
create index tenant_ledger_created_idx on public.tenant_stock_ledger(tenant_id,created_at desc);
create index tenant_ledger_location_idx on public.tenant_stock_ledger(location_id,tenant_id);
create index tenant_ledger_product_idx on public.tenant_stock_ledger(tenant_product_id,tenant_id);
create index tenant_ledger_actor_idx on public.tenant_stock_ledger(actor_id);

do $$ declare t text; begin
 foreach t in array array['tenants','tenant_memberships','tenant_locations','tenant_products','tenant_stock','tenant_stock_ledger'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy tenant_read on public.tenants for select to authenticated using(private.tenant_access(id) or private.is_platform_admin());
create policy membership_read on public.tenant_memberships for select to authenticated using(private.tenant_access(tenant_id));
create policy location_read on public.tenant_locations for select to authenticated using(private.tenant_access(tenant_id));
create policy tenant_product_read on public.tenant_products for select to authenticated using(private.tenant_access(tenant_id));
create policy tenant_stock_read on public.tenant_stock for select to authenticated using(private.tenant_access(tenant_id));
create policy tenant_ledger_read on public.tenant_stock_ledger for select to authenticated using(private.tenant_access(tenant_id));

create function private.create_tenant(n text, owner_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare t uuid; begin
 if not private.is_platform_admin() then raise exception 'RIWAY super admin required'; end if;
 insert into public.tenants(name) values(n) returning id into t;
 insert into public.tenant_memberships(tenant_id,user_id,role) values(t,owner_id,'owner');
 insert into public.audit_logs(actor_id,action,entity,entity_id) values(private.app_user_id(),'CREATE','tenants',t::text);
 return t;
end $$;
revoke all on function private.create_tenant(text,uuid) from public;
grant execute on function private.create_tenant(text,uuid) to authenticated;
create function public.create_tenant(n text,owner_id uuid) returns uuid language sql security invoker set search_path='' as $$ select private.create_tenant(n,owner_id) $$;
revoke all on function public.create_tenant(text,uuid) from public,anon;
grant execute on function public.create_tenant(text,uuid) to authenticated;

create function private.setup_tenant_inventory(t uuid, kind text, payload jsonb) returns void language plpgsql security definer set search_path='' as $$
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
revoke all on function private.setup_tenant_inventory(uuid,text,jsonb) from public;
grant execute on function private.setup_tenant_inventory(uuid,text,jsonb) to authenticated;
create function public.setup_tenant_inventory(t uuid,kind text,payload jsonb) returns void language sql security invoker set search_path='' as $$ select private.setup_tenant_inventory(t,kind,payload) $$;
revoke all on function public.setup_tenant_inventory(uuid,text,jsonb) from public,anon;
grant execute on function public.setup_tenant_inventory(uuid,text,jsonb) to authenticated;

create function private.mutate_tenant_stock(t uuid,l uuid,p uuid,op text,q integer,reason text,key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare prior public.tenant_stock_ledger; fingerprint jsonb; result jsonb;
begin
 if not private.tenant_access(t,array['owner','inventory']) then raise exception 'Inventory access required'; end if;
 if key is null or q is null or q=0 or abs(q::bigint)>1000000 or op is null or op not in ('receive','adjust','reserve','release','allocate','fulfill','damage','restore')
  or (op<>'adjust' and q<1) or reason is null or length(reason) not between 5 and 500 then raise exception 'Invalid stock movement'; end if;
 fingerprint:=jsonb_build_object('location',l,'product',p,'operation',op,'quantity',q,'reason',reason,'actor',private.app_user_id());
 perform pg_advisory_xact_lock(hashtextextended(t::text||':'||key::text,0));
 select * into prior from public.tenant_stock_ledger where tenant_id=t and idempotency_key=key;
 if found then
  if prior.request_payload<>fingerprint then raise exception 'Idempotency conflict'; end if;
  return prior.balance_after;
 end if;
 perform private.check_rate('tenant_inventory',60,60);
 -- Composite FKs reject locations/products belonging to a different store.
 insert into public.tenant_stock(tenant_id,location_id,tenant_product_id) values(t,l,p) on conflict do nothing;
 perform 1 from public.tenant_stock where tenant_id=t and location_id=l and tenant_product_id=p for update;
 update public.tenant_stock set
  on_hand=on_hand+case when op in ('receive','adjust') then q when op='fulfill' then -q else 0 end,
  reserved=reserved+case when op='reserve' then q when op in ('release','allocate') then -q else 0 end,
  allocated=allocated+case when op='allocate' then q when op='fulfill' then -q else 0 end,
  damaged=damaged+case when op='damage' then q when op='restore' then -q else 0 end,
  version=version+1,updated_at=now()
 where tenant_id=t and location_id=l and tenant_product_id=p returning to_jsonb(tenant_stock.*) into result;
 insert into public.tenant_stock_ledger(tenant_id,location_id,tenant_product_id,actor_id,operation,quantity,reason,idempotency_key,request_payload,balance_after)
 values(t,l,p,private.app_user_id(),op,q,reason,key,fingerprint,result);
 return result;
end $$;
revoke all on function private.mutate_tenant_stock(uuid,uuid,uuid,text,integer,text,uuid) from public;
grant execute on function private.mutate_tenant_stock(uuid,uuid,uuid,text,integer,text,uuid) to authenticated;
create function public.mutate_tenant_stock(t uuid,l uuid,p uuid,op text,q integer,reason text,key uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.mutate_tenant_stock(t,l,p,op,q,reason,key) $$;
revoke all on function public.mutate_tenant_stock(uuid,uuid,uuid,text,integer,text,uuid) from public,anon;
grant execute on function public.mutate_tenant_stock(uuid,uuid,uuid,text,integer,text,uuid) to authenticated;
