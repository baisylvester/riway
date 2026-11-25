-- Approved bonus goods are separate from paid commercial lines. No campaign,
-- price, claim or return rule is seeded. Existing payment/stock authority stays.
create table private.bonus_campaigns (
 id uuid primary key default gen_random_uuid(),market text not null references public.markets(code),
 name text not null check(length(btrim(name)) between 3 and 120),
 qualifying_product_id uuid not null references public.products(id),
 minimum_quantity integer not null check(minimum_quantity between 1 and 24),
 bonus_product_id uuid not null references public.products(id),
 bonus_quantity integer not null check(bonus_quantity between 1 and 24),
 maximum_per_order integer not null check(maximum_per_order between 1 and 24),
 maximum_units integer not null check(maximum_units between 1 and 10000000),
 starts_at timestamptz not null,ends_at timestamptz not null check(ends_at>starts_at),
 allow_voucher boolean not null,
 return_terms text not null check(length(btrim(return_terms)) between 20 and 2000),
 approval_reference text not null check(length(btrim(approval_reference)) between 5 and 200),
 approved_by uuid not null references public.app_users(id),approved_at timestamptz not null default clock_timestamp(),
 withdrawn_at timestamptz,withdrawal_reference text,
 check((withdrawn_at is null)=(withdrawal_reference is null))
);
create unique index bonus_campaign_qualifier_idx on private.bonus_campaigns(market,qualifying_product_id) where withdrawn_at is null;
create index bonus_campaign_product_idx on private.bonus_campaigns(bonus_product_id);
create index bonus_campaign_approver_idx on private.bonus_campaigns(approved_by);
alter table private.bonus_campaigns enable row level security;
revoke all on private.bonus_campaigns from public,anon,authenticated,service_role;
create policy bonus_campaign_internal on private.bonus_campaigns for all using(false) with check(false);
create table private.bonus_redemptions (
 order_id uuid not null references public.orders(id),campaign_id uuid not null references private.bonus_campaigns(id),
 quantity integer not null check(quantity between 1 and 24),
 state text not null default 'reserved' check(state in('reserved','consumed','released')),
 primary key(order_id,campaign_id)
);
create index bonus_redemptions_capacity_idx on private.bonus_redemptions(campaign_id,state);
alter table private.bonus_redemptions enable row level security;
revoke all on private.bonus_redemptions from public,anon,authenticated,service_role;
create policy bonus_redemptions_internal on private.bonus_redemptions for all using(false) with check(false);
alter table public.orders add column bonus_items jsonb not null default '[]'::jsonb check(jsonb_typeof(bonus_items)='array' and jsonb_array_length(bonus_items)<=30);

create function private.guard_bonus_campaign() returns trigger language plpgsql set search_path='' as $$ begin
 if (to_jsonb(NEW)-array['withdrawn_at','withdrawal_reference']) is distinct from (to_jsonb(OLD)-array['withdrawn_at','withdrawal_reference'])
 or OLD.withdrawn_at is not null or NEW.withdrawn_at is null then raise exception 'Approved bonus campaigns are immutable';end if;
 return NEW;
end $$;
create trigger bonus_campaign_immutable before update on private.bonus_campaigns for each row execute function private.guard_bonus_campaign();
create function private.approve_bonus_campaign(p_market text,p_definition jsonb,p_reference text)returns uuid language plpgsql security definer set search_path='' as $$
declare c private.bonus_campaigns;begin
 if not private.has_role(p_market,array['admin','compliance'])then raise exception 'Bonus approval denied'using errcode='42501';end if;
 if p_definition is null or jsonb_typeof(p_definition)<>'object' or p_definition->>'capacityAfterRefund' is distinct from 'retain'
 or jsonb_typeof(p_definition->'allowVoucher') is distinct from 'boolean' then raise exception 'Approve campaign, voucher combination and retained paid capacity after refunds'using errcode='22023';end if;
 if not exists(select 1 from public.products p join public.product_offers f on f.product_id=p.id and f.market=p_market
  where p.id=(p_definition->>'qualifyingProductId')::uuid and p.status='published'and f.regulatory_approved and f.approval_reference is not null)
 or not exists(select 1 from public.products p join public.product_offers f on f.product_id=p.id and f.market=p_market
  where p.id=(p_definition->>'bonusProductId')::uuid and p.status='published'and p.category<>'Packages'and f.regulatory_approved and f.approval_reference is not null)
 then raise exception 'Approved market products required'using errcode='22023';end if;
 insert into private.bonus_campaigns(market,name,qualifying_product_id,minimum_quantity,bonus_product_id,bonus_quantity,maximum_per_order,maximum_units,starts_at,ends_at,allow_voucher,return_terms,approval_reference,approved_by)
 values(p_market,btrim(p_definition->>'name'),(p_definition->>'qualifyingProductId')::uuid,(p_definition->>'minimumQuantity')::integer,
 (p_definition->>'bonusProductId')::uuid,(p_definition->>'bonusQuantity')::integer,(p_definition->>'maximumPerOrder')::integer,(p_definition->>'maximumUnits')::integer,
 (p_definition->>'startsAt')::timestamptz,(p_definition->>'endsAt')::timestamptz,(p_definition->>'allowVoucher')::boolean,btrim(p_definition->>'returnTerms'),btrim(p_reference),private.app_user_id())returning * into c;
 insert into public.audit_logs(actor_id,action,entity,entity_id)values(private.app_user_id(),'BONUS_CAMPAIGN_APPROVED','bonus_campaigns',c.id::text);return c.id;
end $$;
create function private.withdraw_bonus_campaign(p_id uuid,p_reference text)returns void language plpgsql security definer set search_path='' as $$
declare c private.bonus_campaigns;begin
 select * into c from private.bonus_campaigns where id=p_id for update;
 if not found or not private.has_role(c.market,array['admin','compliance'])then raise exception 'Bonus withdrawal denied'using errcode='42501';end if;
 if p_reference is null or length(btrim(p_reference))not between 5 and 200 then raise exception 'Withdrawal reference required'using errcode='22023';end if;
 if c.withdrawn_at is null then
  update private.bonus_campaigns set withdrawn_at=clock_timestamp(),withdrawal_reference=btrim(p_reference)where id=c.id;
  insert into public.audit_logs(actor_id,action,entity,entity_id)values(private.app_user_id(),'BONUS_CAMPAIGN_WITHDRAWN','bonus_campaigns',c.id::text);
 end if;
end $$;
create function private.staff_bonus_campaigns(p_market text,p_page integer default 0)returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not private.has_role(p_market,array['admin','compliance'])then raise exception 'Bonus access denied'using errcode='42501';end if;
 if p_page is null or p_page not between 0 and 10000 then raise exception 'Invalid page'using errcode='22023';end if;
 return coalesce((select jsonb_agg(to_jsonb(c))from(select b.*,
 (select coalesce(sum(quantity),0)from private.bonus_redemptions where campaign_id=b.id and state in('reserved','consumed'))as allocated_units
 from private.bonus_campaigns b where market=p_market order by approved_at desc,id limit 25 offset p_page*25)c),'[]'::jsonb);
end $$;

-- Extend the shared planner, so every old and current order entry point obtains
-- exactly the same authoritative gifts and globally sorted physical quantities.
alter function private.plan_commerce_checkout(text,jsonb,text,boolean)rename to plan_commerce_checkout_before_bonus;
create function private.plan_commerce_checkout(p_market text,p_items jsonb,p_code text,p_order boolean default false)returns jsonb language plpgsql security definer set search_path='' as $$
declare plan jsonb;c private.bonus_campaigns;candidate private.bonus_campaigns;item jsonb;stock jsonb:='{}';inventory jsonb;bonuses jsonb:='[]';q jsonb;
 units integer;awarded integer;allocated bigint;physical record;f record;available integer;label text;begin
 plan:=private.plan_commerce_checkout_before_bonus(p_market,p_items,p_code,p_order);
 for item in select value from jsonb_array_elements(plan->'inventory')loop stock:=jsonb_set(stock,array[item->>'productId'],item->'quantity',true);end loop;
 for candidate in select b.* from private.bonus_campaigns b where b.market=p_market and b.withdrawn_at is null
 and exists(select 1 from jsonb_array_elements(plan->'quote'->'items')i where (i->>'productId')::uuid=b.qualifying_product_id)
 order by b.id loop
  -- No shared-to-exclusive upgrade during checkout. Quote takes a shared lock;
  -- order creation takes the campaign lock before reading capacity.
  if p_order then select * into c from private.bonus_campaigns where id=candidate.id for update;
  else select * into c from private.bonus_campaigns where id=candidate.id for share;end if;
  if c.withdrawn_at is not null or clock_timestamp()<c.starts_at or clock_timestamp()>=c.ends_at then continue;end if;
  select (i->>'quantity')::integer into units from jsonb_array_elements(plan->'quote'->'items')i where (i->>'productId')::uuid=c.qualifying_product_id;
  awarded:=least((units/c.minimum_quantity)*c.bonus_quantity,c.maximum_per_order);
  if awarded=0 then continue;end if;
  if nullif(btrim(p_code),'')is not null and not c.allow_voucher then raise exception 'This bonus campaign cannot be combined with a voucher'using errcode='22023';end if;
  select coalesce(sum(quantity),0)into allocated from private.bonus_redemptions where campaign_id=c.id and state in('reserved','consumed');
  if allocated+awarded>c.maximum_units then continue;end if;
  select name into label from public.products where id=c.bonus_product_id;
  stock:=jsonb_set(stock,array[c.bonus_product_id::text],to_jsonb(coalesce((stock->>c.bonus_product_id::text)::integer,0)+awarded),true);
  bonuses:=bonuses||jsonb_build_array(jsonb_build_object('campaignId',c.id,'campaignName',c.name,'productId',c.bonus_product_id,'name',label,
   'quantity',awarded,'qualifyingProductId',c.qualifying_product_id,'returnTerms',c.return_terms));
 end loop;
 if bonuses='[]'::jsonb then return plan;end if;
 for physical in select key::uuid as product_id,value::integer as quantity from jsonb_each_text(stock)order by key::uuid loop
  select p.name,fm.* into f from public.products p join public.product_offers fm on fm.product_id=p.id and fm.market=p_market
   where p.id=physical.product_id and p.status='published'and p.category<>'Packages'for share of p,fm;
  if not found or not f.regulatory_approved or f.approval_reference is null or f.currency<>plan->'quote'->>'currency' or physical.quantity>f.max_quantity then raise exception 'Bonus or combined product quantity is not permitted'using errcode='22023';end if;
  select on_hand-reserved into available from public.inventory where product_id=physical.product_id and market=p_market;
  if not found or available<physical.quantity then raise exception 'Insufficient stock including bonus goods'using errcode='23514';end if;
 end loop;
 select jsonb_agg(jsonb_build_object('productId',key::uuid,'quantity',value::integer)order by key::uuid)into inventory from jsonb_each_text(stock);
 q:=plan->'quote';
 q:=q||jsonb_build_object('bonusItems',bonuses,'quoteHash',encode(sha256(convert_to(jsonb_build_object('previousHash',q->>'quoteHash','bonusItems',bonuses,'inventory',inventory)::text,'UTF8')),'hex'));
 return jsonb_build_object('quote',q,'inventory',inventory);
end $$;

-- Amend only the two insert fragments of the existing, already-tested order
-- transaction. Refuse migration if that baseline has changed unexpectedly.
do $$declare definition text;begin
 definition:=pg_get_functiondef('private.create_commerce_order_without_membership(text,jsonb,jsonb,uuid,text,text,text)'::regprocedure);
 if strpos(definition,'commerce_quote_hash,address,sponsor_id')=0 or strpos(definition,'quote->>''quoteHash'',delivery,sponsor')=0 then raise exception 'Unexpected order baseline; review bonus integration';end if;
 definition:=replace(definition,'commerce_quote_hash,address,sponsor_id','commerce_quote_hash,bonus_items,address,sponsor_id');
 definition:=replace(definition,'quote->>''quoteHash'',delivery,sponsor','quote->>''quoteHash'',coalesce(quote->''bonusItems'',''[]''::jsonb),delivery,sponsor');
 if strpos(definition,'quote:=planned->''quote'';')=0 then raise exception 'Unexpected quote baseline';end if;
 definition:=replace(definition,'quote:=planned->''quote'';','quote:=planned->''quote''; if quote_hash is null and coalesce(quote->''bonusItems'',''[]''::jsonb)<>''[]''::jsonb then raise exception ''Review the bonus quote before checkout'' using errcode=''40001'';end if;');
 execute definition;
end $$;
create function private.record_bonus_order()returns trigger language plpgsql security definer set search_path='' as $$declare b jsonb;begin
 if TG_OP='INSERT'then
  for b in select value from jsonb_array_elements(NEW.bonus_items)loop
   insert into private.bonus_redemptions(order_id,campaign_id,quantity)values(NEW.id,(b->>'campaignId')::uuid,(b->>'quantity')::integer);
  end loop;
 elsif NEW.bonus_items is distinct from OLD.bonus_items then raise exception 'Order bonus snapshot is immutable';
 elsif NEW.payment_status='paid'and NEW.status in('paid','fulfilling','shipped','delivered')then update private.bonus_redemptions set state='consumed'where order_id=NEW.id and state='reserved';
 elsif NEW.status='cancelled'or NEW.payment_status='failed'then update private.bonus_redemptions set state='released'where order_id=NEW.id and state='reserved';end if;
 -- Paid/refunded allocations are deliberately retained, never silently reused.
 return NEW;
end $$;
create trigger bonus_order_record after insert or update of bonus_items,status,payment_status on public.orders for each row execute function private.record_bonus_order();

-- Freeze bonus goods with confirmations and compensation order facts. They
-- never become payable lines or invented commission/qualification volume.
do $$declare definition text;begin
 definition:=pg_get_functiondef('private.enqueue_order_confirmation()'::regprocedure);
 if strpos(definition,'''orderId'',NEW.id,''market'',NEW.market')=0 then raise exception 'Unexpected confirmation baseline';end if;
 execute replace(definition,'''orderId'',NEW.id,''market'',NEW.market','''bonusItems'',NEW.bonus_items,''orderId'',NEW.id,''market'',NEW.market');
end $$;
alter function private.compensation_payload(uuid,text)rename to compensation_payload_before_bonus;
create function private.compensation_payload(p_order uuid,p_event text)returns jsonb language sql stable security definer set search_path='' as $$
 select private.compensation_payload_before_bonus(p_order,p_event)||jsonb_build_object('bonusItems',o.bonus_items)from public.orders o where id=p_order
$$;
create function public.approve_bonus_campaign(p_market text,p_definition jsonb,p_reference text)returns uuid language sql security invoker set search_path='' as $$select private.approve_bonus_campaign(p_market,p_definition,p_reference)$$;
create function public.withdraw_bonus_campaign(p_id uuid,p_reference text)returns void language sql security invoker set search_path='' as $$select private.withdraw_bonus_campaign(p_id,p_reference)$$;
create function public.staff_bonus_campaigns(p_market text,p_page integer default 0)returns jsonb language sql stable security invoker set search_path='' as $$select private.staff_bonus_campaigns(p_market,p_page)$$;
revoke all on function private.guard_bonus_campaign(),private.approve_bonus_campaign(text,jsonb,text),public.approve_bonus_campaign(text,jsonb,text),
 private.withdraw_bonus_campaign(uuid,text),public.withdraw_bonus_campaign(uuid,text),private.staff_bonus_campaigns(text,integer),public.staff_bonus_campaigns(text,integer),
 private.plan_commerce_checkout_before_bonus(text,jsonb,text,boolean),private.plan_commerce_checkout(text,jsonb,text,boolean),private.record_bonus_order(),
 private.compensation_payload_before_bonus(uuid,text),private.compensation_payload(uuid,text)from public,anon,authenticated,service_role;
grant execute on function private.approve_bonus_campaign(text,jsonb,text),public.approve_bonus_campaign(text,jsonb,text),
 private.withdraw_bonus_campaign(uuid,text),public.withdraw_bonus_campaign(uuid,text),private.staff_bonus_campaigns(text,integer),public.staff_bonus_campaigns(text,integer)to authenticated;

-- Subject exports keep the full frozen goods snapshot without staff/provider data.
alter function private.export_my_data()rename to export_my_data_before_bonus;
create function private.export_my_data()returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 result:=private.export_my_data_before_bonus();
 return jsonb_set(result,'{orders}',coalesce((select jsonb_agg(item||jsonb_build_object('bonusItems',o.bonus_items))
 from jsonb_array_elements(result->'orders')item join public.orders o on o.id=(item->>'id')::uuid and o.user_id=private.app_user_id()),'[]'::jsonb));
end $$;
revoke all on function private.export_my_data(),private.export_my_data_before_bonus()from public,anon,authenticated,service_role;
grant execute on function private.export_my_data()to authenticated;
