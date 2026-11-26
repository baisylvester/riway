-- Customer-approved replenishment schedules use ordinary one-time checkout.
-- A recurring payment mandate and a provider binding require separate approval.
create table private.replenishment_rules (
 id uuid primary key default gen_random_uuid(),
 market text not null references public.markets(code),
 product_id uuid not null references public.products(id),
 interval_days integer not null check(interval_days between 1 and 365),
 terms_version text not null check(length(btrim(terms_version)) between 3 and 120),
 terms_text text not null check(length(btrim(terms_text)) between 20 and 8000),
 approval_reference text not null check(length(btrim(approval_reference)) between 5 and 160),
 approved_by uuid not null references public.app_users(id),
 withdrawn_at timestamptz,
 unique(market,product_id,terms_version)
);
create unique index replenishment_current_rule on private.replenishment_rules(market,product_id) where withdrawn_at is null;

create table private.replenishment_schedules (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.app_users(id),
 market text not null references public.markets(code),
 product_id uuid not null references public.products(id),
 rule_id uuid not null references private.replenishment_rules(id),
 source_order_id uuid not null references public.orders(id),
 sponsor_id uuid not null references public.distributor_profiles(user_id),
 quantity integer not null check(quantity between 1 and 24),
 state text not null default 'active' check(state in ('active','paused','cancelled')),
 revision integer not null default 1,
 next_due_at timestamptz not null,
 consented_at timestamptz not null default clock_timestamp(),
 cycle integer not null default 1
);
create unique index replenishment_open_schedule on private.replenishment_schedules(user_id,market,product_id) where state<>'cancelled';
create index replenishment_schedule_owner on private.replenishment_schedules(user_id,consented_at desc);

create table private.replenishment_orders (
 order_id uuid primary key references public.orders(id),
 schedule_id uuid not null references private.replenishment_schedules(id),
 cycle integer not null,
 created_at timestamptz not null default clock_timestamp()
);
create index replenishment_order_cycle on private.replenishment_orders(schedule_id,cycle,created_at desc,order_id);

alter table private.replenishment_rules enable row level security;
alter table private.replenishment_schedules enable row level security;
alter table private.replenishment_orders enable row level security;
revoke all on private.replenishment_rules,private.replenishment_schedules,private.replenishment_orders from public,anon,authenticated,service_role;

create function private.save_replenishment_rule(
 p_market text,p_product uuid,p_days integer,p_version text,p_terms text,p_reference text
) returns uuid language plpgsql security definer set search_path='' as $$
declare rule uuid;
begin
 if not private.has_role(p_market,array['admin','compliance']) or p_market is null then
  raise exception 'Replenishment approval denied' using errcode='42501';
 end if;
 if not exists(select 1 from public.products p join public.product_offers o on o.product_id=p.id
  where p.id=p_product and p.category<>'Packages' and p.status='published' and o.market=p_market
  and o.regulatory_approved and o.approval_reference is not null) then
  raise exception 'Choose an approved single product for this market' using errcode='22023';
 end if;
 insert into private.replenishment_rules(market,product_id,interval_days,terms_version,terms_text,approval_reference,approved_by)
 values(p_market,p_product,p_days,btrim(p_version),btrim(p_terms),btrim(p_reference),private.app_user_id())
 returning id into rule;
 insert into public.audit_logs(actor_id,action,entity,entity_id)
 values(private.app_user_id(),'REPLENISHMENT_RULE_APPROVED','replenishment_rules',rule::text);
 return rule;
end $$;

create function private.withdraw_replenishment_rule(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare rule private.replenishment_rules;
begin
 select * into rule from private.replenishment_rules where id=p_id for update;
 if not found or not private.has_role(rule.market,array['admin','compliance']) then
  raise exception 'Replenishment withdrawal denied' using errcode='42501';
 end if;
 if rule.withdrawn_at is not null then return; end if;
 update private.replenishment_rules set withdrawn_at=clock_timestamp() where id=p_id;
 insert into public.audit_logs(actor_id,action,entity,entity_id)
 values(private.app_user_id(),'REPLENISHMENT_RULE_WITHDRAWN','replenishment_rules',p_id::text);
end $$;

create function private.staff_replenishment_rules(p_market text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if p_market is null or not private.has_role(p_market,array['admin','compliance']) then
  raise exception 'Replenishment access denied' using errcode='42501';
 end if;
 return jsonb_build_object(
  'products',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name),'[]'::jsonb)
   from (select p.id,p.name from public.products p join public.product_offers o on o.product_id=p.id
    where p.status='published' and p.category<>'Packages' and o.market=p_market
    and o.regulatory_approved and o.approval_reference is not null order by p.name,p.id limit 500) p),
  'rules',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'product',p.name,'intervalDays',r.interval_days,
   'version',r.terms_version,'reference',r.approval_reference) order by p.name),'[]'::jsonb)
   from private.replenishment_rules r join public.products p on p.id=r.product_id
   where r.market=p_market and r.withdrawn_at is null));
end $$;

create function private.replenishment_options(p_order uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 return (select jsonb_build_object('orderId',o.id,'ruleId',r.id,'version',r.terms_version,'terms',r.terms_text,
  'product',i.product_name,'intervalDays',r.interval_days,'quantity',i.quantity,'market',o.market)
 from public.orders o join public.order_items i on i.order_id=o.id
 join public.products p on p.id=i.product_id and p.status='published' and p.category<>'Packages'
 join public.product_offers offer on offer.product_id=i.product_id and offer.market=o.market
  and offer.regulatory_approved and offer.approval_reference is not null
 join private.replenishment_rules r on r.product_id=i.product_id and r.market=o.market and r.withdrawn_at is null
 join public.sponsor_attributions a on a.user_id=o.user_id and a.distributor_id=o.sponsor_id
 where o.id=p_order and o.user_id=private.app_user_id() and o.payment_status='paid' and i.quantity<=offer.max_quantity
  and o.status in ('paid','fulfilling','shipped','delivered') and o.refunded_minor=0
  and (o.checkout_fulfilment is null or o.checkout_fulfilment->>'method'='delivery')
  and not exists(select 1 from public.order_items other where other.order_id=o.id and other.id<>i.id)
  and not exists(select 1 from private.replenishment_schedules s where s.user_id=o.user_id
   and s.market=o.market and s.product_id=i.product_id and s.state<>'cancelled'));
end $$;

create function private.start_replenishment(p_order uuid,p_rule uuid,p_version text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.app_user_id(); o public.orders; rule private.replenishment_rules; options jsonb; result uuid;
begin
 if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select * into o from public.orders where id=p_order and user_id=actor for update;
 if not found then raise exception 'Order access denied' using errcode='42501'; end if;
 select * into rule from private.replenishment_rules where id=p_rule for share;
 if not found or rule.withdrawn_at is not null or rule.terms_version is distinct from p_version then
  raise exception 'Replenishment terms changed' using errcode='40001';
 end if;
 select id into result from private.replenishment_schedules where user_id=actor and source_order_id=p_order
  and rule_id=p_rule and state<>'cancelled';
 if found then return result; end if;
 options:=private.replenishment_options(p_order);
 if options->>'ruleId' is distinct from p_rule::text then
  raise exception 'This order is not eligible for a schedule' using errcode='22023';
 end if;
 insert into private.replenishment_schedules(user_id,market,product_id,rule_id,source_order_id,sponsor_id,quantity,next_due_at)
 values(actor,o.market,rule.product_id,rule.id,o.id,o.sponsor_id,(options->>'quantity')::integer,
  clock_timestamp()+make_interval(days=>rule.interval_days)) returning id into result;
 insert into public.audit_logs(actor_id,action,entity,entity_id)
 values(actor,'REPLENISHMENT_CONSENT','replenishment_schedules',result::text);
 return result;
end $$;

create function private.replenishment_current_order(p_schedule uuid,p_cycle integer)
returns public.orders language sql stable set search_path='' as $$
 select o.* from private.replenishment_orders t join public.orders o on o.id=t.order_id
 where t.schedule_id=p_schedule and t.cycle=p_cycle
 order by (o.status='cancelled' and o.payment_status='paid') desc,t.created_at desc,t.order_id desc limit 1
$$;

create function private.my_replenishment_schedules()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(x.item order by x.created_at desc),'[]'::jsonb) from (
  select s.consented_at as created_at,jsonb_build_object('id',s.id,'market',s.market,'product',p.name,
   'state',s.state,'revision',s.revision,'quantity',s.quantity,'intervalDays',r.interval_days,
   'nextDueAt',s.next_due_at,'due',s.next_due_at<=now(),'withdrawn',r.withdrawn_at is not null,
   'orderId',o.id,'orderStatus',o.status,'paymentStatus',o.payment_status) as item
  from private.replenishment_schedules s join private.replenishment_rules r on r.id=s.rule_id
  join public.products p on p.id=s.product_id
  left join lateral private.replenishment_current_order(s.id,s.cycle) o on true
  where s.user_id=private.app_user_id()
  order by (s.state='cancelled'),s.consented_at desc limit 100
 ) x
$$;

create function private.change_replenishment(p_id uuid,p_revision integer,p_action text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.app_user_id(); s private.replenishment_schedules; r private.replenishment_rules; o public.orders;
begin
 select * into s from private.replenishment_schedules where id=p_id and user_id=actor for update;
 if not found then raise exception 'Schedule access denied' using errcode='42501'; end if;
 if s.revision is distinct from p_revision then raise exception 'Schedule changed' using errcode='40001'; end if;
 select * into r from private.replenishment_rules where id=s.rule_id for share;
 if s.state='cancelled' or p_action is null or p_action not in ('pause','resume','skip','cancel')
  or (p_action='resume' and (s.state<>'paused' or r.withdrawn_at is not null))
  or (p_action in ('skip','pause') and s.state<>'active') then
  raise exception 'Schedule action is unavailable' using errcode='22023';
 end if;
 if p_action='skip' then
  o:=private.replenishment_current_order(s.id,s.cycle);
  if o.id is not null and (o.status<>'cancelled' or o.payment_status='paid') then
   raise exception 'Resolve the open renewal order before skipping' using errcode='22023';
  end if;
 end if;
 update private.replenishment_schedules set
  state=case p_action when 'pause' then 'paused' when 'resume' then 'active' when 'cancel' then 'cancelled' else state end,
  next_due_at=case when p_action='skip' then greatest(next_due_at,clock_timestamp())+make_interval(days=>r.interval_days) else next_due_at end,
  cycle=cycle+case when p_action='skip' then 1 else 0 end,revision=revision+1
 where id=p_id;
 insert into public.audit_logs(actor_id,action,entity,entity_id)
 values(actor,'REPLENISHMENT_'||upper(p_action),'replenishment_schedules',p_id::text);
end $$;

create function private.build_replenishment_quote(p_id uuid,p_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.replenishment_schedules; r private.replenishment_rules; previous public.orders; source public.orders;
 items jsonb; q jsonb; terms text; f constant jsonb:='{"method":"delivery"}';
begin
 select * into s from private.replenishment_schedules where id=p_id and user_id=private.app_user_id() for share;
 if not found then raise exception 'Schedule access denied' using errcode='42501'; end if;
 if s.revision is distinct from p_revision then raise exception 'Schedule changed' using errcode='40001'; end if;
 select * into r from private.replenishment_rules where id=s.rule_id for share;
 if s.state<>'active' or s.next_due_at>clock_timestamp() or r.withdrawn_at is not null then
  raise exception 'Renewal is unavailable' using errcode='22023';
 end if;
 previous:=private.replenishment_current_order(s.id,s.cycle);
 if previous.id is not null and (previous.status<>'cancelled' or previous.payment_status='paid') then
  raise exception 'Resolve the open renewal order first' using errcode='22023';
 end if;
 if not exists(select 1 from public.sponsor_attributions a where a.user_id=s.user_id and a.distributor_id=s.sponsor_id) then
  raise exception 'The recorded sponsor must be reconciled before renewal' using errcode='22023';
 end if;
 select * into source from public.orders where id=s.source_order_id;
 if source.payment_status<>'paid' or source.refunded_minor>0 then
  raise exception 'The original order must remain paid and unrefunded' using errcode='22023';
 end if;
 select checkout_terms_version into terms from public.markets where code=s.market;
 items:=jsonb_build_array(jsonb_build_object('productId',s.product_id,'quantity',s.quantity));
 q:=private.quote_fulfilment_checkout(s.market,items,null,f);
 if q->'membership' is not null and q->'membership'<>'null'::jsonb then
  raise exception 'Use standard checkout for a membership package' using errcode='22023';
 end if;
 return jsonb_build_object('quote',q,'terms',terms,'address',source.address);
end $$;

create function private.create_replenishment_order(p_id uuid,p_revision integer,p_hash text,p_terms text)
returns uuid language plpgsql security definer set search_path='' as $$
declare s private.replenishment_schedules; q jsonb; renewal_id uuid;
begin
 select * into s from private.replenishment_schedules where id=p_id and user_id=private.app_user_id() for update;
 if not found then raise exception 'Schedule access denied' using errcode='42501'; end if;
 q:=private.build_replenishment_quote(p_id,p_revision);
 if p_hash is distinct from q->'quote'->>'quoteHash' or p_terms is distinct from q->>'terms' then
  raise exception 'Renewal price or terms changed' using errcode='40001';
 end if;
 renewal_id:=private.create_fulfilment_order(s.market,jsonb_build_array(jsonb_build_object('productId',s.product_id,'quantity',s.quantity)),
  q->'address',gen_random_uuid(),p_terms,null,p_hash,null,'{"method":"delivery"}');
 if (select sponsor_id from public.orders where orders.id=renewal_id) is distinct from s.sponsor_id then
  raise exception 'The order sponsor changed' using errcode='40001';
 end if;
 insert into private.replenishment_orders(order_id,schedule_id,cycle) values(renewal_id,s.id,s.cycle);
 update private.replenishment_schedules set revision=revision+1 where replenishment_schedules.id=s.id;
 return renewal_id;
end $$;

create function private.advance_replenishment_after_payment()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 update private.replenishment_schedules s
 set cycle=s.cycle+1,revision=s.revision+1,next_due_at=clock_timestamp()+make_interval(days=>r.interval_days)
 from private.replenishment_orders t,private.replenishment_rules r
 where t.order_id=NEW.id and s.id=t.schedule_id and s.cycle=t.cycle and r.id=s.rule_id;
 return NEW;
end $$;
revoke all on function private.advance_replenishment_after_payment() from public,anon,authenticated,service_role;
create trigger replenishment_verified_payment after update of status,payment_status on public.orders for each row
 when (NEW.payment_status='paid' and NEW.status in ('paid','fulfilling','shipped','delivered')
  and (OLD.payment_status<>'paid' or OLD.status not in ('paid','fulfilling','shipped','delivered')))
 execute function private.advance_replenishment_after_payment();

-- Invoker wrappers keep the definer code outside the exposed schema.
create function public.save_replenishment_rule(p_market text,p_product uuid,p_days integer,p_version text,p_terms text,p_reference text)
returns uuid language sql security invoker set search_path='' as $$select private.save_replenishment_rule(p_market,p_product,p_days,p_version,p_terms,p_reference)$$;
create function public.withdraw_replenishment_rule(p_id uuid)
returns void language sql security invoker set search_path='' as $$select private.withdraw_replenishment_rule(p_id)$$;
create function public.staff_replenishment_rules(p_market text)
returns jsonb language sql stable security invoker set search_path='' as $$select private.staff_replenishment_rules(p_market)$$;
create function public.replenishment_options(p_order uuid)
returns jsonb language sql stable security invoker set search_path='' as $$select private.replenishment_options(p_order)$$;
create function public.start_replenishment(p_order uuid,p_rule uuid,p_version text)
returns uuid language sql security invoker set search_path='' as $$select private.start_replenishment(p_order,p_rule,p_version)$$;
create function public.my_replenishment_schedules()
returns jsonb language sql stable security invoker set search_path='' as $$select private.my_replenishment_schedules()$$;
create function public.change_replenishment(p_id uuid,p_revision integer,p_action text)
returns void language sql security invoker set search_path='' as $$select private.change_replenishment(p_id,p_revision,p_action)$$;
create function public.quote_replenishment(p_id uuid,p_revision integer)
returns jsonb language sql security invoker set search_path='' as $$select private.build_replenishment_quote(p_id,p_revision)$$;
create function public.create_replenishment_order(p_id uuid,p_revision integer,p_hash text,p_terms text)
returns uuid language sql security invoker set search_path='' as $$select private.create_replenishment_order(p_id,p_revision,p_hash,p_terms)$$;

revoke all on function private.replenishment_current_order(uuid,integer) from public,anon,authenticated,service_role;
revoke all on function private.save_replenishment_rule(text,uuid,integer,text,text,text),public.save_replenishment_rule(text,uuid,integer,text,text,text),
 private.withdraw_replenishment_rule(uuid),public.withdraw_replenishment_rule(uuid),
 private.staff_replenishment_rules(text),public.staff_replenishment_rules(text),
 private.replenishment_options(uuid),public.replenishment_options(uuid),private.start_replenishment(uuid,uuid,text),public.start_replenishment(uuid,uuid,text),
 private.my_replenishment_schedules(),public.my_replenishment_schedules(),private.change_replenishment(uuid,integer,text),public.change_replenishment(uuid,integer,text),
 private.build_replenishment_quote(uuid,integer),public.quote_replenishment(uuid,integer),
 private.create_replenishment_order(uuid,integer,text,text),public.create_replenishment_order(uuid,integer,text,text) from public,anon,authenticated,service_role;
grant execute on function private.save_replenishment_rule(text,uuid,integer,text,text,text),public.save_replenishment_rule(text,uuid,integer,text,text,text),
 private.withdraw_replenishment_rule(uuid),public.withdraw_replenishment_rule(uuid),
 private.staff_replenishment_rules(text),public.staff_replenishment_rules(text),
 private.replenishment_options(uuid),public.replenishment_options(uuid),private.start_replenishment(uuid,uuid,text),public.start_replenishment(uuid,uuid,text),
 private.my_replenishment_schedules(),public.my_replenishment_schedules(),private.change_replenishment(uuid,integer,text),public.change_replenishment(uuid,integer,text),
 private.build_replenishment_quote(uuid,integer),public.quote_replenishment(uuid,integer),
 private.create_replenishment_order(uuid,integer,text,text),public.create_replenishment_order(uuid,integer,text,text) to authenticated;
