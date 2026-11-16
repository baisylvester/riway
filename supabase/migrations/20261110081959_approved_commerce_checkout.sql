-- Approved configuration is immutable and separate from editable preparation.
-- Contract v1: exactly one explicit voucher, once per order, eligible-product
-- subtotal/minimum, floor percentage with optional cap, fixed capped at eligible
-- subtotal, proportional largest-remainder allocation ordered by product UUID.
create table private.commerce_offers (
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('package','promotion')),
 market text not null references public.markets(code),
 name text not null check(length(name) between 2 and 120),
 draft_id uuid not null references private.commerce_drafts(id),
 draft_revision integer not null check(draft_revision>=1),
 product_id uuid references public.products(id),
 approval_reference text not null check(length(approval_reference) between 5 and 200),
 approved_by uuid not null references public.app_users(id),
 approved_at timestamptz not null default now(),
 withdrawn_at timestamptz,
 withdrawal_reference text check(length(withdrawal_reference) between 5 and 200),
 contract_version integer not null default 1 check(contract_version=1),
 definition jsonb not null,
 check((kind='package' and product_id is not null) or (kind='promotion' and product_id is null)),
 check((withdrawn_at is null)=(withdrawal_reference is null))
);
create unique index commerce_offers_active_package_idx on private.commerce_offers(product_id,market) where kind='package' and withdrawn_at is null;
create unique index commerce_offers_active_voucher_idx on private.commerce_offers(market,(definition->>'voucherCode')) where kind='promotion' and withdrawn_at is null;
create unique index commerce_offers_active_draft_idx on private.commerce_offers(draft_id,draft_revision) where withdrawn_at is null;
create index commerce_offers_market_idx on private.commerce_offers(market,kind,approved_at desc,id);
create index commerce_offers_draft_idx on private.commerce_offers(draft_id);
create index commerce_offers_product_idx on private.commerce_offers(product_id);
create index commerce_offers_approver_idx on private.commerce_offers(approved_by);
alter table private.commerce_offers enable row level security;
revoke all on private.commerce_offers from public,anon,authenticated,service_role;
create policy commerce_offers_internal_only on private.commerce_offers for all to anon,authenticated using(false) with check(false);

create function private.protect_commerce_offer_update() returns trigger
language plpgsql security invoker set search_path='' as $$ begin
 if (to_jsonb(NEW)-array['withdrawn_at','withdrawal_reference'])<>(to_jsonb(OLD)-array['withdrawn_at','withdrawal_reference'])
 or OLD.withdrawn_at is not null or NEW.withdrawn_at is null then
  raise exception 'Approved commerce snapshots are immutable';
 end if;
 return NEW;
end $$;
create trigger commerce_offers_immutable before update on private.commerce_offers for each row execute function private.protect_commerce_offer_update();

alter table public.orders add column discount_minor bigint not null default 0 check(discount_minor>=0);
alter table public.orders add column subtotal_minor bigint generated always as(total_minor+discount_minor) stored;
alter table public.orders add column promotion_offer_id uuid references private.commerce_offers(id);
alter table public.orders add column commerce_quote_hash text check(commerce_quote_hash is null or commerce_quote_hash ~ '^[a-f0-9]{64}$');
create index orders_promotion_offer_idx on public.orders(promotion_offer_id);
alter table public.order_items add column discount_minor bigint not null default 0 check(discount_minor>=0 and discount_minor<=quantity::bigint*unit_minor);
alter table public.order_items add column net_minor bigint generated always as(quantity::bigint*unit_minor-discount_minor) stored;
alter table public.order_items add column package_offer_id uuid references private.commerce_offers(id);
create index order_items_package_offer_idx on public.order_items(package_offer_id);

create table private.order_inventory_items (
 order_id uuid not null references public.orders(id) on delete cascade,
 product_id uuid not null references public.products(id),
 market text not null references public.markets(code),
 quantity integer not null check(quantity>0),
 legacy_sku boolean not null default false,
 primary key(order_id,product_id)
);
create index order_inventory_items_product_idx on private.order_inventory_items(product_id);
create index order_inventory_items_market_idx on private.order_inventory_items(market);
alter table private.order_inventory_items enable row level security;
revoke all on private.order_inventory_items from public,anon,authenticated,service_role;
create policy order_inventory_items_internal_only on private.order_inventory_items for all to anon,authenticated using(false) with check(false);
-- Legacy commercial lines were physical lines; preserve that meaning forever.
insert into private.order_inventory_items(order_id,product_id,market,quantity,legacy_sku)
 select i.order_id,i.product_id,o.market,sum(i.quantity)::integer,true from public.order_items i join public.orders o on o.id=i.order_id group by i.order_id,i.product_id,o.market;

create table private.commerce_redemptions (
 order_id uuid primary key references public.orders(id) on delete cascade,
 offer_id uuid not null references private.commerce_offers(id),
 state text not null default 'reserved' check(state in ('reserved','consumed','released')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index commerce_redemptions_offer_state_idx on private.commerce_redemptions(offer_id,state);
alter table private.commerce_redemptions enable row level security;
revoke all on private.commerce_redemptions from public,anon,authenticated,service_role;
create policy commerce_redemptions_internal_only on private.commerce_redemptions for all to anon,authenticated using(false) with check(false);

create function private.commerce_offer_json(r private.commerce_offers) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',r.id,'kind',r.kind,'market',r.market,'currency',case r.market when 'PH' then 'PHP' when 'SG' then 'SGD' when 'MY' then 'MYR' end,
 'name',r.name,'draftId',r.draft_id,'draftRevision',r.draft_revision,'productId',r.product_id,'approvalReference',r.approval_reference,
 'approvedBy',r.approved_by,'approvedAt',r.approved_at,'withdrawnAt',r.withdrawn_at,'contractVersion',r.contract_version,'definition',r.definition);
$$;

create function private.approve_commerce_draft(p_draft uuid,p_revision integer,p_product uuid,p_reference text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d private.commerce_drafts; saved private.commerce_offers; currency text; reference text:=btrim(p_reference,E' \t\n\r'); begin
 select * into d from private.commerce_drafts where id=p_draft for update;
 if not found or not private.has_role(d.market,array['admin','compliance']) then raise exception 'Commerce approval access denied' using errcode='42501'; end if;
 if p_revision is distinct from d.revision then raise exception 'Commerce draft changed. Reload before approval.' using errcode='40001'; end if;
 if d.status<>'review' or reference is null or length(reference) not between 5 and 200 then raise exception 'A review-state draft and approval reference are required'; end if;
 perform private.validate_commerce_draft(d.kind,d.definition);
 select m.currency into currency from public.markets m where code=d.market for share;
 if d.kind='package' then
  if p_product is null or not exists(select 1 from public.products where id=p_product and status='published' and category='Packages')
   or d.definition->'retailMinor'='null'::jsonb then raise exception 'Published package SKU and proposed retail price are required'; end if;
 else
  if p_product is not null or d.definition->'voucherCode'='null'::jsonb then raise exception 'Promotions require an explicit voucher code'; end if;
 end if;
 insert into private.commerce_offers(kind,market,name,draft_id,draft_revision,product_id,approval_reference,approved_by,definition)
 values(d.kind,d.market,d.name,d.id,d.revision,p_product,reference,private.app_user_id(),d.definition) returning * into saved;
 if d.kind='package' then
  insert into public.product_offers(product_id,market,currency,retail_minor,member_minor)
   values(p_product,d.market,currency,(d.definition->>'retailMinor')::integer,(d.definition->>'memberMinor')::integer)
  on conflict(product_id,market) do update set retail_minor=excluded.retail_minor,member_minor=excluded.member_minor;
 end if;
 insert into public.audit_logs(actor_id,action,entity,entity_id)
 values(private.app_user_id(),'OFFER_APPROVE:'||d.kind||':'||d.market,'commerce_offers',saved.id::text);
 return private.commerce_offer_json(saved);
end $$;

create function private.withdraw_commerce_offer(p_offer uuid,p_reference text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare saved private.commerce_offers; reference text:=btrim(p_reference,E' \t\n\r'); begin
 select * into saved from private.commerce_offers where id=p_offer for update;
 if not found or not private.has_role(saved.market,array['admin','compliance']) then raise exception 'Commerce approval access denied' using errcode='42501'; end if;
 if reference is null or length(reference) not between 5 and 200 then raise exception 'Withdrawal reference is required'; end if;
 if saved.withdrawn_at is null then
  update private.commerce_offers set withdrawn_at=clock_timestamp(),withdrawal_reference=reference where id=saved.id returning * into saved;
  insert into public.audit_logs(actor_id,action,entity,entity_id)
   values(private.app_user_id(),'OFFER_WITHDRAW:'||saved.kind||':'||saved.market,'commerce_offers',saved.id::text);
 end if;
 return private.commerce_offer_json(saved);
end $$;

create function private.staff_commerce_offers(k text,page integer default 1) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare allowed text[]; offers jsonb; more boolean; begin
 if k is null or k not in ('package','promotion') or page is null or page not between 1 and 1000 then raise exception 'Invalid commerce offer list request'; end if;
 select array_agg(code order by array_position(array['PH','SG','MY'],code)) into allowed from public.markets where private.has_role(code,array['admin','compliance']);
 if coalesce(cardinality(allowed),0)=0 then raise exception 'Commerce approval access denied' using errcode='42501'; end if;
 select coalesce(jsonb_agg(private.commerce_offer_json(rows.item) order by (rows.item).approved_at desc,(rows.item).id),'[]'::jsonb) into offers
 from (select c as item from private.commerce_offers c where c.kind=k and c.market=any(allowed) order by c.approved_at desc,c.id limit 50 offset ((page-1)*50)) rows;
 select exists(select 1 from private.commerce_offers c where c.kind=k and c.market=any(allowed) order by c.approved_at desc,c.id limit 1 offset (page*50)) into more;
 return jsonb_build_object('offers',offers,'markets',allowed,'hasMore',more,'page',page);
end $$;

create function public.approve_commerce_draft(p_draft uuid,p_revision integer,p_product uuid,p_reference text) returns jsonb
language sql security invoker set search_path='' as $$ select private.approve_commerce_draft(p_draft,p_revision,p_product,p_reference); $$;
create function public.withdraw_commerce_offer(p_offer uuid,p_reference text) returns jsonb
language sql security invoker set search_path='' as $$ select private.withdraw_commerce_offer(p_offer,p_reference); $$;
create function public.staff_commerce_offers(k text,page integer default 1) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.staff_commerce_offers(k,page); $$;

-- This planner is shared by quotation and creation. Creation takes the voucher
-- row exclusively from the outset; upgrading two shared locks would deadlock.
create function private.plan_commerce_checkout(p_market text,p_items jsonb,p_code text,p_order boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.app_user_id(); v public.markets; is_member boolean:=false;
 item jsonb; component jsonb; pid uuid; seen uuid[]:=array[]::uuid[]; line record; physical record;
 package private.commerce_offers; promotion private.commerce_offers; code text:=nullif(upper(btrim(p_code)), '');
 price integer; units integer; needed bigint; stock jsonb:='{}'::jsonb; inventory jsonb;
 lines jsonb:='[]'::jsonb; priced jsonb; subtotal bigint:=0; eligible bigint:=0; discount bigint:=0;
 available integer; promotion_json jsonb:=null; quote jsonb; digest text;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_market is null or p_market not in ('PH','SG','MY') or p_items is null or jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Invalid checkout'; end if;
 if jsonb_array_length(p_items) not between 1 and 30 or octet_length(p_items::text)>16384 then raise exception 'Invalid checkout'; end if;
 select * into v from public.markets selected_market where selected_market.code=p_market for share;
 if not found or not v.online_sales_approved or v.policy_reference is null then raise exception 'Online sales not approved'; end if;
 if not v.payments_ready then raise exception 'Payment integration unavailable'; end if;
 select status='active' into is_member from public.memberships where user_id=uid for share;
 is_member:=coalesce(is_member,false);
 for item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(item) is distinct from 'object' or not(item ?& array['productId','quantity'])
   or item-array['productId','quantity']<>'{}'::jsonb or jsonb_typeof(item->'productId') is distinct from 'string'
   or item->>'productId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or not private.commerce_draft_integer(item->'quantity',1,24) then raise exception 'Invalid checkout item'; end if;
  pid:=(item->>'productId')::uuid;
  if pid=any(seen) then raise exception 'Duplicate products'; end if;
  seen:=array_append(seen,pid);
 end loop;
 if code is not null then
  if code !~ '^[A-Z0-9-]{3,40}$' then raise exception 'Invalid voucher'; end if;
  if p_order then
   select * into promotion from private.commerce_offers c where c.kind='promotion' and c.market=p_market and c.definition->>'voucherCode'=code and c.withdrawn_at is null and c.contract_version=1 for update;
  else
   select * into promotion from private.commerce_offers c where c.kind='promotion' and c.market=p_market and c.definition->>'voucherCode'=code and c.withdrawn_at is null and c.contract_version=1 for share;
  end if;
  if promotion.id is null or clock_timestamp()<(promotion.definition->>'startsAt')::timestamptz or clock_timestamp()>=(promotion.definition->>'endsAt')::timestamptz
   or (promotion.definition->>'audience'='member' and not is_member) or (promotion.definition->>'audience'='retail' and is_member) then raise exception 'Voucher is unavailable'; end if;
  if promotion.definition->'usageLimit'<>'null'::jsonb and (select count(*) from private.commerce_redemptions where offer_id=promotion.id and state in ('reserved','consumed'))>=(promotion.definition->>'usageLimit')::integer then raise exception 'Voucher usage limit reached'; end if;
  promotion_json:=jsonb_build_object('id',promotion.id,'name',promotion.name,'code',code);
 end if;
 for item in select value from jsonb_array_elements(p_items) order by (value->>'productId')::uuid loop
  pid:=(item->>'productId')::uuid; units:=(item->>'quantity')::integer;
  select p.id,p.name,p.category,f.* into line from public.products p join public.product_offers f on f.product_id=p.id and f.market=p_market
   where p.id=pid and p.status='published' for share of p,f;
  if not found or not line.regulatory_approved or line.approval_reference is null or line.currency<>v.currency or units>line.max_quantity then raise exception 'Product unavailable in selected market'; end if;
  price:=case when is_member then coalesce(line.member_minor,line.retail_minor) else line.retail_minor end;
  if price is null then raise exception 'Approved pricing unavailable'; end if;
  package:=null;
  if line.category='Packages' then
   select * into package from private.commerce_offers c where c.kind='package' and c.market=p_market and c.product_id=pid and c.withdrawn_at is null and c.contract_version=1 for share;
   if package.id is null then raise exception 'Approved package composition unavailable'; end if;
   for component in select value from jsonb_array_elements(package.definition->'components') loop
    needed:=units::bigint*(component->>'quantity')::integer;
    stock:=jsonb_set(stock,array[((component->>'productId')::uuid)::text],to_jsonb(coalesce((stock->>((component->>'productId')::uuid)::text)::bigint,0)+needed),true);
   end loop;
  else
   stock:=jsonb_set(stock,array[pid::text],to_jsonb(coalesce((stock->>pid::text)::bigint,0)+units),true);
  end if;
  lines:=lines||jsonb_build_array(jsonb_build_object('productId',pid,'name',line.name,'quantity',units,'unitMinor',price,'grossMinor',price::bigint*units,'packageOfferId',package.id));
  subtotal:=subtotal+price::bigint*units;
 end loop;
 -- Validate physical products and aggregate caps even when they were selected
 -- through multiple packages or alongside a loose bottle. Inventory updates
 -- happen later in the same globally sorted physical-product order.
 for physical in select key::uuid as product_id,value::bigint as quantity from jsonb_each_text(stock) order by key::uuid loop
  select p.id,f.* into line from public.products p join public.product_offers f on f.product_id=p.id and f.market=p_market
   where p.id=physical.product_id and p.status='published' and p.category<>'Packages' for share of p,f;
  if not found or not line.regulatory_approved or line.approval_reference is null or line.currency<>v.currency or physical.quantity>line.max_quantity then raise exception 'Package component unavailable or quantity limit exceeded'; end if;
  select on_hand-reserved into available from public.inventory where product_id=physical.product_id and market=p_market;
  if not found or available<physical.quantity then raise exception 'Insufficient stock'; end if;
 end loop;
 select jsonb_agg(jsonb_build_object('productId',key::uuid,'quantity',value::integer) order by key::uuid) into inventory from jsonb_each_text(stock);
 if promotion.id is not null then
  select coalesce(sum((x->>'grossMinor')::bigint),0) into eligible from jsonb_array_elements(lines) x where exists(select 1 from jsonb_array_elements_text(promotion.definition->'productIds') target where target::uuid=(x->>'productId')::uuid);
  if eligible=0 or eligible<(promotion.definition->>'minimumSubtotalMinor')::bigint then raise exception 'Voucher minimum eligible subtotal not met'; end if;
  if promotion.definition->>'discountType'='fixed' then discount:=least(eligible,(promotion.definition->>'discountValue')::bigint);
  else
   discount:=floor(eligible::numeric*(promotion.definition->>'discountValue')::integer/10000)::bigint;
   if promotion.definition->'maximumDiscountMinor'<>'null'::jsonb then discount:=least(discount,(promotion.definition->>'maximumDiscountMinor')::bigint); end if;
  end if;
  if discount=0 then raise exception 'Voucher does not reduce this basket'; end if;
 end if;
 if subtotal-discount<=0 then raise exception 'Zero-total checkout is not supported'; end if;
 with raw as (
  select x,(x->>'productId')::uuid as pid,(x->>'grossMinor')::bigint as gross,
   promotion.id is not null and exists(select 1 from jsonb_array_elements_text(promotion.definition->'productIds') target where target::uuid=(x->>'productId')::uuid) as eligible_line from jsonb_array_elements(lines) x
 ), allocated as (
  select *,case when eligible_line then floor(discount::numeric*gross/eligible)::bigint else 0 end as base,
   case when eligible_line then mod(discount::numeric*gross,eligible) else 0 end as remainder from raw
 ), ranked as (
  select a.pid,row_number() over(order by a.remainder desc,a.pid) as rank from allocated a where a.eligible_line
 ), spread as (
  select a.*,a.base+case when a.eligible_line and r.rank<=discount-(select sum(base) from allocated) then 1 else 0 end as portion from allocated a left join ranked r using(pid)
 ) select jsonb_agg(s.x||jsonb_build_object('discountMinor',s.portion,'netMinor',s.gross-s.portion) order by s.pid) into priced from spread s;
 quote:=jsonb_build_object('market',p_market,'currency',v.currency,'items',priced,'subtotalMinor',subtotal,'discountMinor',discount,'totalMinor',subtotal-discount,'promotion',promotion_json);
 digest:=encode(sha256(convert_to(jsonb_build_object('quote',quote,'inventory',inventory,'member',is_member,'contractVersion',1)::text,'UTF8')),'hex');
 return jsonb_build_object('quote',quote||jsonb_build_object('quoteHash',digest),'inventory',inventory);
end $$;

create function private.quote_commerce_checkout(m text,items jsonb,promotion_code text default null) returns jsonb
language sql security definer set search_path='' as $$ select private.plan_commerce_checkout(m,items,promotion_code,false)->'quote'; $$;
create function public.quote_commerce_checkout(m text,items jsonb,promotion_code text default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.quote_commerce_checkout(m,items,promotion_code); $$;

create function private.create_commerce_order(m text,items jsonb,delivery jsonb,key uuid,terms text,promotion_code text default null,quote_hash text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.app_user_id(); oid uuid; existing public.orders; request_digest text; code text:=nullif(upper(btrim(promotion_code)),'');
 planned jsonb; quote jsonb; item jsonb; physical jsonb; sponsor uuid; promo uuid;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if m is null or m not in ('PH','SG','MY') or key is null or items is null or jsonb_typeof(items) is distinct from 'array'
  or delivery is null or jsonb_typeof(delivery) is distinct from 'object' or delivery->>'country' is distinct from m
  or terms is null or length(terms) not between 3 and 128 then raise exception 'Invalid checkout'; end if;
 if jsonb_array_length(items) not between 1 and 30 or octet_length(items::text)>16384 then raise exception 'Invalid checkout'; end if;
 if quote_hash is not null and quote_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid checkout quote'; end if;
 -- Preserve the exact legacy fingerprint for old clients and old persisted
 -- orders. Replays return before any current price/stock/promotion re-evaluation.
 if code is null and quote_hash is null then
  request_digest:=encode(sha256(convert_to(m||items::text||delivery::text||terms,'UTF8')),'hex');
 else
  request_digest:=encode(sha256(convert_to(jsonb_build_object('market',m,'items',items,'delivery',delivery,'terms',terms,'voucher',code,'quoteHash',quote_hash)::text,'UTF8')),'hex');
 end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text||key::text,0));
 select * into existing from public.orders where user_id=uid and idempotency_key=key;
 if found then
  if existing.request_hash<>request_digest then raise exception 'Idempotency key reused with different data'; end if;
  return existing.id;
 end if;
 planned:=private.plan_commerce_checkout(m,items,code,true); quote:=planned->'quote';
 if terms is distinct from (select selected_market.checkout_terms_version from public.markets selected_market where selected_market.code=m) then raise exception 'Current checkout terms required'; end if;
 if quote_hash is not null and quote_hash is distinct from quote->>'quoteHash' then raise exception 'Checkout quote changed. Review the current quote.' using errcode='40001'; end if;
 for physical in select value from jsonb_array_elements(planned->'inventory') order by (value->>'productId')::uuid loop
  update public.inventory set reserved=reserved+(physical->>'quantity')::integer
   where product_id=(physical->>'productId')::uuid and market=m and on_hand-reserved>=(physical->>'quantity')::integer;
  if not found then raise exception 'Insufficient stock'; end if;
 end loop;
 select distributor_id into sponsor from public.sponsor_attributions where user_id=uid;
 promo:=(quote->'promotion'->>'id')::uuid;
 insert into public.orders(user_id,market,currency,total_minor,discount_minor,promotion_offer_id,commerce_quote_hash,address,sponsor_id,idempotency_key,request_hash,terms_version)
 values(uid,m,quote->>'currency',(quote->>'totalMinor')::bigint,(quote->>'discountMinor')::bigint,promo,quote->>'quoteHash',delivery,sponsor,key,request_digest,terms) returning id into oid;
 for item in select value from jsonb_array_elements(quote->'items') loop
  insert into public.order_items(order_id,product_id,product_name,quantity,unit_minor,discount_minor,package_offer_id)
  values(oid,(item->>'productId')::uuid,item->>'name',(item->>'quantity')::integer,(item->>'unitMinor')::integer,(item->>'discountMinor')::bigint,(item->>'packageOfferId')::uuid);
 end loop;
 for physical in select value from jsonb_array_elements(planned->'inventory') loop
  insert into private.order_inventory_items(order_id,product_id,market,quantity) values(oid,(physical->>'productId')::uuid,m,(physical->>'quantity')::integer);
  insert into public.inventory_reservations(order_id,product_id,market,quantity) values(oid,(physical->>'productId')::uuid,m,(physical->>'quantity')::integer);
 end loop;
 if promo is not null then insert into private.commerce_redemptions(order_id,offer_id) values(oid,promo); end if;
 return oid;
end $$;

create function public.create_commerce_order(m text,items jsonb,delivery jsonb,key uuid,terms text,promotion_code text default null,quote_hash text default null) returns uuid
language sql security invoker set search_path='' as $$ select private.create_commerce_order(m,items,delivery,key,terms,promotion_code,quote_hash); $$;

-- The old endpoint cannot bypass package expansion, voucher-free quote pricing,
-- market gates or exact physical-stock reservation.
create or replace function private.checkout(m text,items jsonb,delivery jsonb,key uuid,terms text) returns uuid
language sql security definer set search_path='' as $$ select private.create_commerce_order(m,items,delivery,key,terms,null,null); $$;

create function private.update_commerce_redemption() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if NEW.status='paid' and NEW.payment_status='paid' then
  update private.commerce_redemptions set state='consumed',updated_at=clock_timestamp() where order_id=NEW.id and state='reserved';
 elsif NEW.status='cancelled' or NEW.payment_status='failed' then
  update private.commerce_redemptions set state='released',updated_at=clock_timestamp() where order_id=NEW.id and state='reserved';
 end if;
 -- A payment received after cancellation remains in manual review; released
 -- capacity is never consumed again after another order might have reserved it.
 return NEW;
end $$;
create trigger commerce_redemption_order_state after update of status,payment_status on public.orders for each row execute function private.update_commerce_redemption();

create function private.commerce_manifest_matches(p_order uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.order_inventory_items where order_id=p_order)
 and not exists(
  select 1 from (select * from private.order_inventory_items where order_id=p_order) expected
  full join (select * from public.inventory_reservations where order_id=p_order) actual using(product_id)
  where expected.product_id is null or actual.product_id is null or expected.market is distinct from actual.market or expected.quantity is distinct from actual.quantity
 );
$$;

create or replace function public.prepare_stripe_checkout(p_order uuid,p_user uuid,p_live boolean,p_origin text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.orders; c private.stripe_checkouts; lines jsonb; begin
 select * into o from public.orders where id=p_order for update;
 if not found or o.user_id is distinct from p_user or p_user is null or p_live is null or p_origin is null
  or p_origin !~ '^https://[a-zA-Z0-9.-]+(:[0-9]+)?$' then raise exception 'Order unavailable'; end if;
 select * into c from private.stripe_checkouts where order_id=o.id for update;
 if found then
  if c.livemode is distinct from p_live then raise exception 'Payment mode mismatch'; end if;
 else
  if o.status<>'awaiting_payment' or o.payment_status<>'pending' then raise exception 'Order is closed'; end if;
  if p_live and o.terms_version ~* 'draft' then raise exception 'Final terms required for live payment'; end if;
  if not exists(select 1 from public.markets m where m.code=o.market and m.online_sales_approved and m.payments_ready and m.policy_reference is not null and m.checkout_terms_version=o.terms_version) then raise exception 'Market not ready'; end if;
  if exists(select 1 from public.order_items i join public.products p on p.id=i.product_id left join public.product_offers f on f.product_id=i.product_id and f.market=o.market
   where i.order_id=o.id and (p.status<>'published' or not coalesce(f.regulatory_approved,false) or f.approval_reference is null or f.currency is distinct from o.currency)) then raise exception 'Product unavailable'; end if;
  if exists(select 1 from private.order_inventory_items i join public.products p on p.id=i.product_id left join public.product_offers f on f.product_id=i.product_id and f.market=i.market
   where i.order_id=o.id and (i.market<>o.market or p.status<>'published' or (p.category='Packages' and not i.legacy_sku) or not coalesce(f.regulatory_approved,false) or f.approval_reference is null or f.currency is distinct from o.currency)) then raise exception 'Package component unavailable'; end if;
  if not private.commerce_manifest_matches(o.id) or exists(select 1 from public.inventory_reservations where order_id=o.id and expires_at<=now()) then raise exception 'Reservation expired or stock reconciliation required'; end if;
  -- Commercial quantity is retained in the name/account record; one exact net
  -- billing amount avoids per-unit discount rounding and keeps at most30lines.
  select jsonb_agg(jsonb_build_object('name',left(product_name,110)||' × '||quantity::text,'quantity',1,'unitAmount',net_minor) order by product_id) into lines from public.order_items where order_id=o.id;
  if lines is null or (select sum(net_minor) from public.order_items where order_id=o.id)<>o.total_minor
   or (select sum(discount_minor) from public.order_items where order_id=o.id)<>o.discount_minor
   or (select sum(quantity::bigint*unit_minor) from public.order_items where order_id=o.id)<>o.subtotal_minor then raise exception 'Order total mismatch'; end if;
  insert into private.stripe_checkouts(order_id,livemode,amount_minor,currency,items,return_origin) values(o.id,p_live,o.total_minor,lower(o.currency),lines,p_origin) returning * into c;
  update public.inventory_reservations set expires_at=c.expires_at where order_id=o.id;
 end if;
 return jsonb_build_object('id',c.id,'orderId',c.order_id,'livemode',c.livemode,'amount',c.amount_minor,'currency',c.currency,'items',c.items,'origin',c.return_origin,'expiresAt',extract(epoch from c.expires_at)::bigint,'sessionId',c.session_id,'url',c.checkout_url,'phase',c.phase);
end $$;

-- Preserve all canonical event/mode/amount/idempotency/late-charge handling;
-- replace only its obsolete commercial-SKU-to-reservation equivalence check.
do $$ declare definition text; old_guard text; begin
 definition:=replace(pg_get_functiondef('public.apply_stripe_checkout_event(text,uuid,uuid,text,boolean,bigint,text,text,text,text,boolean)'::regprocedure),chr(13),'');
 old_guard:=replace($guard$if exists(select 1 from public.order_items i left join public.inventory_reservations v on v.order_id=i.order_id and v.product_id=i.product_id
      where i.order_id=o.id and v.quantity is distinct from i.quantity)$guard$,chr(13),'');
 if position(old_guard in definition)=0 then raise exception 'Unexpected Stripe stock guard; review migration'; end if;
 execute replace(definition,old_guard,'if not private.commerce_manifest_matches(o.id)');
end $$;

-- Bound each maintenance invocation. A committed order without a Stripe attempt
-- can expire normally, releasing both physical stock and reserved voucher use.
-- Any Stripe attempt, including an uncertain preparing attempt, still requires
-- provider reconciliation rather than a local-clock stock release.
create or replace function public.release_expired_reservations() returns integer
language plpgsql security invoker set search_path='' as $$
declare o record; r record; n integer:=0; begin
 for o in select * from public.orders x where x.status='awaiting_payment' and x.payment_status='pending'
  and exists(select 1 from public.inventory_reservations v where v.order_id=x.id and v.expires_at<now())
  and not exists(select 1 from private.stripe_checkouts s where s.order_id=x.id)
  order by x.id limit 50 for update skip locked loop
  -- The candidate query can have started before a concurrent preparation
  -- committed. Recheck with a fresh statement snapshot after holding the order
  -- lock; preparation may have inserted an attempt and extended its holds.
  if exists(select 1 from private.stripe_checkouts where order_id=o.id)
   or not exists(select 1 from public.inventory_reservations where order_id=o.id and expires_at<now())
   or not exists(select 1 from public.orders where id=o.id and status='awaiting_payment' and payment_status='pending') then continue; end if;
  for r in select * from public.inventory_reservations where order_id=o.id order by product_id for update loop
   update public.inventory set reserved=reserved-r.quantity where product_id=r.product_id and market=r.market;
   n:=n+1;
  end loop;
  delete from public.inventory_reservations where order_id=o.id;
  update public.orders set status='cancelled' where id=o.id;
 end loop;
 return n;
end $$;

create function private.catalogue_package_compositions(m text) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(payload order by product_id),'[]'::jsonb) from (
  select o.product_id,jsonb_build_object('productId',o.product_id,'offerId',o.id,'components',
   (select jsonb_agg(jsonb_build_object('productId',p.id,'name',p.name,'quantity',(c.value->>'quantity')::integer) order by p.id)
    from jsonb_array_elements(o.definition->'components') c join public.products p on p.id=(c.value->>'productId')::uuid)) as payload
  from private.commerce_offers o join public.products sku on sku.id=o.product_id
   join public.product_offers f on f.product_id=sku.id and f.market=m
  where o.kind='package' and o.market=m and o.withdrawn_at is null and o.contract_version=1 and sku.status='published' and sku.category='Packages'
  and not exists(select 1 from jsonb_array_elements(o.definition->'components') c
   left join public.products p on p.id=(c.value->>'productId')::uuid
   left join public.product_offers component_offer on component_offer.product_id=p.id and component_offer.market=m
   where p.id is null or p.status<>'published' or p.category='Packages' or component_offer.product_id is null)
  order by o.product_id limit 1000
 ) visible;
$$;
create function public.catalogue_package_compositions(m text) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.catalogue_package_compositions(m); $$;

revoke all on function private.protect_commerce_offer_update(),private.commerce_offer_json(private.commerce_offers),
 private.approve_commerce_draft(uuid,integer,uuid,text),private.withdraw_commerce_offer(uuid,text),private.staff_commerce_offers(text,integer),
 private.plan_commerce_checkout(text,jsonb,text,boolean),private.quote_commerce_checkout(text,jsonb,text),private.create_commerce_order(text,jsonb,jsonb,uuid,text,text,text),
 private.update_commerce_redemption(),private.commerce_manifest_matches(uuid),private.catalogue_package_compositions(text),
 public.approve_commerce_draft(uuid,integer,uuid,text),public.withdraw_commerce_offer(uuid,text),public.staff_commerce_offers(text,integer),
 public.quote_commerce_checkout(text,jsonb,text),public.create_commerce_order(text,jsonb,jsonb,uuid,text,text,text),public.catalogue_package_compositions(text)
 from public,anon,authenticated,service_role;
grant execute on function private.approve_commerce_draft(uuid,integer,uuid,text),private.withdraw_commerce_offer(uuid,text),private.staff_commerce_offers(text,integer),
 private.quote_commerce_checkout(text,jsonb,text),private.create_commerce_order(text,jsonb,jsonb,uuid,text,text,text),
 public.approve_commerce_draft(uuid,integer,uuid,text),public.withdraw_commerce_offer(uuid,text),public.staff_commerce_offers(text,integer),
 public.quote_commerce_checkout(text,jsonb,text),public.create_commerce_order(text,jsonb,jsonb,uuid,text,text,text) to authenticated;
grant execute on function private.catalogue_package_compositions(text),public.catalogue_package_compositions(text) to anon,authenticated;
