-- RIWAY platform: additive initial schema; no pre-existing application tables.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, anon;

create table public.markets (
 code text primary key check (code in ('PH','SG','MY')), name text not null, currency text not null,
 online_sales_approved boolean not null default false, policy_reference text,
 payments_ready boolean not null default false,
 check (not online_sales_approved or length(policy_reference) > 5)
);
create table public.staff_roles (
 user_id uuid references auth.users(id) on delete cascade, market text references public.markets(code),
 role text not null check (role in ('admin','operations','editor','compliance')), primary key(user_id,market,role)
);
create index staff_roles_market_idx on public.staff_roles(market);
create function private.has_role(m text, allowed text[] default array['admin','operations','editor','compliance'])
returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and (select auth.jwt()->>'aal') = 'aal2'
 and exists(select 1 from public.staff_roles where user_id = (select auth.uid()) and (m is null or market = m) and role = any(allowed));
$$;
revoke all on function private.has_role(text,text[]) from public;
grant execute on function private.has_role(text,text[]) to authenticated, anon;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default '' check(length(full_name)<=100), phone text check(length(phone)<=25),
 marketing_consent boolean not null default false, created_at timestamptz not null default now()
);
create table public.addresses (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 full_name text not null, phone text not null, line1 text not null, city text not null, postal_code text not null,
 country text not null references public.markets(code), created_at timestamptz not null default now()
);
create index addresses_user_idx on public.addresses(user_id);
create table public.products (
 id uuid primary key default gen_random_uuid(), slug text not null unique check(slug ~ '^[a-z0-9-]+$'),
 name text not null check(length(name) between 1 and 120), category text not null check(category in ('Nutrition','Skincare','Packages')),
 subtitle text not null default '', description text not null default '', image_url text,
 status text not null default 'draft' check(status in ('draft','review','published','archived')),
 created_at timestamptz not null default now(),
 check (image_url is null or image_url ~ '^/images/[a-zA-Z0-9._-]+$' or image_url ~ '^https://static[.]wixstatic[.]com/')
);
create table public.product_offers (
 product_id uuid references public.products(id) on delete cascade, market text references public.markets(code),
 currency text not null check(currency in ('PHP','SGD','MYR')), retail_minor integer check(retail_minor>0),
 member_minor integer check(member_minor>0), regulatory_approved boolean not null default false, approval_reference text,
 max_quantity integer not null default 6 check(max_quantity between 1 and 24), primary key(product_id,market),
 check(not regulatory_approved or length(approval_reference)>5)
);
create index product_offers_market_idx on public.product_offers(market);
create table public.inventory (
 product_id uuid references public.products(id) on delete cascade, market text references public.markets(code),
 on_hand integer not null default 0 check(on_hand>=0), reserved integer not null default 0 check(reserved>=0 and reserved<=on_hand),
 low_stock_threshold integer not null default 5 check(low_stock_threshold>=0), primary key(product_id,market)
);
create index inventory_market_idx on public.inventory(market);
create table public.inventory_movements (
 id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id), market text not null references public.markets(code),
 delta integer not null, reason text not null check(length(reason) between 5 and 500), actor_id uuid references auth.users(id), created_at timestamptz not null default now()
);
create index inventory_movements_product_idx on public.inventory_movements(product_id);
create index inventory_movements_market_idx on public.inventory_movements(market);
create index inventory_movements_actor_idx on public.inventory_movements(actor_id);
create table public.carts (
 user_id uuid primary key references auth.users(id) on delete cascade, items jsonb not null default '[]'::jsonb check(jsonb_typeof(items)='array' and jsonb_array_length(items)<=30), updated_at timestamptz not null default now()
);
create table public.distributor_profiles (
 user_id uuid primary key references auth.users(id), external_member_id text not null unique, code text not null unique check(code ~ '^[A-Za-z0-9-]{3,40}$'),
 display_name text not null, active boolean not null default false, verified_at timestamptz, market text not null references public.markets(code)
);
create index distributor_market_idx on public.distributor_profiles(market);
create table public.sponsor_attributions (
 user_id uuid primary key references auth.users(id), distributor_id uuid not null references public.distributor_profiles(user_id), verified_at timestamptz not null default now()
);
create index sponsor_distributor_idx on public.sponsor_attributions(distributor_id);
create table public.memberships (
 user_id uuid primary key references auth.users(id), external_member_id text not null unique, tier text not null,
 status text not null check(status in ('pending','active','suspended')), synced_at timestamptz not null default now()
);
create table public.orders (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), market text not null references public.markets(code),
 currency text not null, total_minor bigint not null check(total_minor>0), status text not null default 'awaiting_payment'
 check(status in ('awaiting_payment','paid','fulfilling','shipped','delivered','cancelled','refunded')),
 payment_status text not null default 'pending' check(payment_status in ('pending','paid','failed','refunded')),
 address jsonb not null, sponsor_id uuid references public.distributor_profiles(user_id), idempotency_key uuid not null,
 request_hash text not null, terms_version text not null, created_at timestamptz not null default now(), unique(user_id,idempotency_key)
);
create index orders_user_created_idx on public.orders(user_id,created_at desc);
create index orders_market_created_idx on public.orders(market,created_at desc);
create index orders_sponsor_idx on public.orders(sponsor_id);
create table public.order_items (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id), product_id uuid not null references public.products(id),
 product_name text not null, quantity integer not null check(quantity between 1 and 24), unit_minor integer not null check(unit_minor>0)
);
create index order_items_order_idx on public.order_items(order_id);
create index order_items_product_idx on public.order_items(product_id);
create table public.inventory_reservations (
 order_id uuid references public.orders(id), product_id uuid references public.products(id), market text references public.markets(code),
 quantity integer not null check(quantity>0), expires_at timestamptz not null default now()+interval '20 minutes', primary key(order_id,product_id)
);
create index reservations_product_idx on public.inventory_reservations(product_id);
create index reservations_market_idx on public.inventory_reservations(market);
create index reservations_expiry_idx on public.inventory_reservations(expires_at);
create table public.content_entries (
 id uuid primary key default gen_random_uuid(), slug text not null unique check(slug ~ '^[a-z0-9-]+$'),
 kind text not null check(kind in ('page','story','event','article')), title text not null check(length(title) between 1 and 160),
 excerpt text not null default '', body text not null default '', market text references public.markets(code),
 locale text not null default 'en', image_url text, starts_at timestamptz, location text,
 status text not null default 'draft' check(status in ('draft','review','published','archived')),
 approved_by uuid references auth.users(id), approved_at timestamptz, created_at timestamptz not null default now()
);
create index content_market_idx on public.content_entries(market);
create index content_approver_idx on public.content_entries(approved_by);
create index content_published_idx on public.content_entries(kind,created_at desc) where status='published';
create table public.event_registrations (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.content_entries(id), user_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(), unique(event_id,user_id)
);
create index registrations_user_idx on public.event_registrations(user_id);
create table public.support_tickets (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), market text not null references public.markets(code),
 subject text not null check(length(subject) between 5 and 160), message text not null check(length(message) between 20 and 4000),
 status text not null default 'open' check(status in ('open','resolved')), created_at timestamptz not null default now()
);
create index support_user_idx on public.support_tickets(user_id);
create index support_market_idx on public.support_tickets(market);
create table public.audit_logs (
 id bigint generated always as identity primary key, actor_id uuid, action text not null, entity text not null, entity_id text,
 created_at timestamptz not null default now()
);
create table public.integration_events (
 id uuid primary key default gen_random_uuid(), order_id uuid references public.orders(id), provider text not null,
 status text not null default 'pending' check(status in ('pending','processing','succeeded','failed')), attempts integer not null default 0,
 provider_event_id text unique, created_at timestamptz not null default now()
);
create index integration_order_idx on public.integration_events(order_id);

-- RLS is always enabled before any data is exposed.
do $$ declare t text; begin
 foreach t in array array['markets','staff_roles','profiles','addresses','products','product_offers','inventory','inventory_movements','carts','distributor_profiles','sponsor_attributions','memberships','orders','order_items','inventory_reservations','content_entries','event_registrations','support_tickets','audit_logs','integration_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 end loop;
end $$;
grant select on public.markets,public.products,public.product_offers,public.content_entries to anon,authenticated;
grant select on public.staff_roles,public.distributor_profiles,public.sponsor_attributions,public.memberships,public.orders,public.order_items,public.inventory,public.inventory_movements,public.audit_logs,public.integration_events to authenticated;
grant select,insert,update on public.profiles,public.carts to authenticated;
grant select,insert,update,delete on public.addresses to authenticated;
grant select,insert on public.event_registrations,public.support_tickets to authenticated;
grant insert,update on public.products,public.product_offers,public.content_entries to authenticated;
create policy markets_read on public.markets for select to anon,authenticated using(true);
create policy roles_own on public.staff_roles for select to authenticated using(user_id=(select auth.uid()));
create policy profiles_own on public.profiles for all to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy addresses_own on public.addresses for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy carts_own on public.carts for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy products_read on public.products for select to anon,authenticated using(status='published' or private.has_role(null));
create policy products_write on public.products for all to authenticated using(private.has_role(null,array['admin','editor','compliance'])) with check(private.has_role(null,array['admin','editor','compliance']));
create policy offers_read on public.product_offers for select to anon,authenticated using(exists(select 1 from public.products where id=product_id and status='published') or private.has_role(market));
create policy offers_write on public.product_offers for all to authenticated using(private.has_role(market,array['admin','compliance'])) with check(private.has_role(market,array['admin','compliance']));
create policy inventory_read on public.inventory for select to authenticated using(private.has_role(market));
create policy movements_read on public.inventory_movements for select to authenticated using(private.has_role(market));
create policy distributor_own on public.distributor_profiles for select to authenticated using(user_id=(select auth.uid()) or private.has_role(market));
create policy sponsor_own on public.sponsor_attributions for select to authenticated using(user_id=(select auth.uid()));
create policy memberships_own on public.memberships for select to authenticated using(user_id=(select auth.uid()));
create policy orders_read on public.orders for select to authenticated using(user_id=(select auth.uid()) or private.has_role(market));
create policy items_read on public.order_items for select to authenticated using(exists(select 1 from public.orders where id=order_id));
create policy content_read on public.content_entries for select to anon,authenticated using(status='published' or private.has_role(market));
create policy content_write on public.content_entries for all to authenticated using(private.has_role(market,array['admin','editor','compliance'])) with check(private.has_role(market,array['admin','editor','compliance']));
create policy registrations_read on public.event_registrations for select to authenticated using(user_id=(select auth.uid()));
create policy registrations_insert on public.event_registrations for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.content_entries where id=event_id and kind='event' and status='published' and starts_at>now()));
create policy support_read on public.support_tickets for select to authenticated using(user_id=(select auth.uid()) or private.has_role(market));
create policy support_insert on public.support_tickets for insert to authenticated with check(user_id=(select auth.uid()) and status='open');
create policy audit_read on public.audit_logs for select to authenticated using(private.has_role(null,array['admin']));
create policy integrations_read on public.integration_events for select to authenticated using(private.has_role(null,array['admin']));

create function private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_logs(actor_id,action,entity,entity_id) values(auth.uid(),TG_OP,TG_TABLE_NAME,to_jsonb(NEW)->>'id');
 return NEW;
end $$;
revoke all on function private.audit_change() from public;
create function private.check_publication() returns trigger language plpgsql set search_path='' as $$
begin
 if NEW.status='published' and auth.uid() is not null and not private.has_role(null,array['admin','compliance']) then
 raise exception 'Compliance approval required before publication'; end if;
 if TG_TABLE_NAME='content_entries' and auth.uid() is not null then NEW.approved_by=case when NEW.status='published' then auth.uid() else null end; NEW.approved_at=case when NEW.status='published' then now() else null end; end if;
 return NEW;
end $$;
revoke all on function private.check_publication() from public;
create trigger products_publication before insert or update on public.products for each row execute function private.check_publication();
create trigger content_publication before insert or update on public.content_entries for each row execute function private.check_publication();
do $$ declare t text; begin foreach t in array array['products','product_offers','inventory','content_entries','staff_roles','markets','orders'] loop
 execute format('create trigger %I after insert or update on public.%I for each row execute function private.audit_change()',t||'_audit',t);
end loop; end $$;

-- Narrow privileged functions: verified user, validated parameters, fixed search path.
create function private.adjust_inventory(p uuid,m text,d integer,r text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.has_role(m,array['admin','operations']) then raise exception 'Access denied'; end if;
 if length(r)<5 or length(r)>500 or d=0 then raise exception 'A nonzero adjustment and reason are required'; end if;
 update public.inventory set on_hand=on_hand+d where product_id=p and market=m and on_hand+d>=reserved;
 if not found then raise exception 'Stock cannot be reduced below reserved quantity'; end if;
 insert into public.inventory_movements(product_id,market,delta,reason,actor_id) values(p,m,d,r,auth.uid());
end $$;
revoke all on function private.adjust_inventory(uuid,text,integer,text) from public;
grant execute on function private.adjust_inventory(uuid,text,integer,text) to authenticated;
create function public.adjust_inventory(p uuid,m text,d integer,r text) returns void language sql security invoker set search_path='' as $$ select private.adjust_inventory(p,m,d,r) $$;
revoke all on function public.adjust_inventory(uuid,text,integer,text) from public;
grant execute on function public.adjust_inventory(uuid,text,integer,text) to authenticated;

create function private.checkout(m text,items jsonb,delivery jsonb,key uuid,terms text) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); oid uuid; existing public.orders; v public.markets; i record; offer public.product_offers; price integer; total bigint:=0; hash text; sponsor uuid;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if jsonb_typeof(items)<>'array' or jsonb_array_length(items) not between 1 and 30 or terms<>'2026-11-draft' or delivery->>'country'<>m then raise exception 'Invalid checkout'; end if;
 hash:=md5(m||items::text||delivery::text||terms);
 perform pg_advisory_xact_lock(hashtextextended(uid::text||key::text,0));
 select * into existing from public.orders where user_id=uid and idempotency_key=key;
 if found then if existing.request_hash<>hash then raise exception 'Idempotency key reused with different data'; end if; return existing.id; end if;
 select * into v from public.markets where code=m for share;
 if not found or not v.online_sales_approved or v.policy_reference is null then raise exception 'Online sales not approved'; end if;
 if not v.payments_ready then raise exception 'Payment integration unavailable'; end if;
 if (select count(*) from jsonb_to_recordset(items) as x("productId" uuid,quantity integer))<>(select count(distinct x."productId") from jsonb_to_recordset(items) as x("productId" uuid,quantity integer)) then raise exception 'Duplicate products'; end if;
 for i in select * from jsonb_to_recordset(items) as x("productId" uuid,quantity integer) order by "productId" loop
 select o.* into offer from public.product_offers o join public.products p on p.id=o.product_id where o.product_id=i."productId" and o.market=m and p.status='published' for share of o,p;
 if not found or not offer.regulatory_approved or offer.approval_reference is null or offer.currency<>v.currency or i.quantity is null or i.quantity not between 1 and offer.max_quantity then raise exception 'Product unavailable in selected market'; end if;
 price:=offer.retail_minor;
 if exists(select 1 from public.memberships where user_id=uid and status='active') then price:=coalesce(offer.member_minor,price); end if;
 if price is null then raise exception 'Approved pricing unavailable'; end if;
 update public.inventory set reserved=reserved+i.quantity where product_id=i."productId" and market=m and on_hand-reserved>=i.quantity;
 if not found then raise exception 'Insufficient stock'; end if;
 total:=total+price::bigint*i.quantity;
 end loop;
 select distributor_id into sponsor from public.sponsor_attributions where user_id=uid;
 -- No unsigned referral values or invented sponsor/commission rules.
 insert into public.orders(user_id,market,currency,total_minor,address,sponsor_id,idempotency_key,request_hash,terms_version)
 values(uid,m,v.currency,total,delivery,sponsor,key,hash,terms) returning id into oid;
 for i in select * from jsonb_to_recordset(items) as x("productId" uuid,quantity integer) loop
 select * into offer from public.product_offers where product_id=i."productId" and market=m;
 price:=offer.retail_minor;
 if exists(select 1 from public.memberships where user_id=uid and status='active') then price:=coalesce(offer.member_minor,price); end if;
 insert into public.order_items(order_id,product_id,product_name,quantity,unit_minor) select oid,id,name,i.quantity,price from public.products where id=i."productId";
 insert into public.inventory_reservations(order_id,product_id,market,quantity) values(oid,i."productId",m,i.quantity);
 end loop;
 return oid;
end $$;
revoke all on function private.checkout(text,jsonb,jsonb,uuid,text) from public;
grant execute on function private.checkout(text,jsonb,jsonb,uuid,text) to authenticated;
create function public.create_order(m text,items jsonb,delivery jsonb,key uuid,terms text) returns uuid language sql security invoker set search_path='' as $$ select private.checkout(m,items,delivery,key,terms) $$;
revoke all on function public.create_order(text,jsonb,jsonb,uuid,text) from public;
grant execute on function public.create_order(text,jsonb,jsonb,uuid,text) to authenticated;

insert into public.markets(code,name,currency) values('PH','Philippines','PHP'),('SG','Singapore','SGD'),('MY','Malaysia','MYR');
insert into public.products(slug,name,category,subtitle,description,status) values
 ('purtier-placenta','PURTIER PLACENTA','Nutrition','The signature collection','Explore RIWAY’s signature product. Approved market-specific labels, ingredients and usage information will be published following compliance review. No approved therapeutic claims. Read the label and consult a healthcare professional.','published'),
 ('conscientious','CONSCIENTIOUS','Skincare','Considered care, every day','Discover the CONSCIENTIOUS collection. Market-specific product information and approved labels will be made available after editorial and compliance review.','published');
insert into public.product_offers(product_id,market,currency) select p.id,m.code,m.currency from public.products p cross join public.markets m;
insert into public.inventory(product_id,market) select p.id,m.code from public.products p cross join public.markets m;
