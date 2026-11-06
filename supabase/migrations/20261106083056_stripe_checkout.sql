-- Additive Stripe state. Existing sales/product gates remain closed.
alter table public.markets add column checkout_terms_version text not null default '2026-11-draft'
 check(length(checkout_terms_version) between 3 and 128);

-- Preserve the deployed identity bridge and all checkout guards; replace only
-- the obsolete literal terms version with the market's approved version.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('private.checkout(text,jsonb,jsonb,uuid,text)'::regprocedure);
 if position('terms<>''2026-11-draft''' in definition)=0 then
  raise exception 'Unexpected checkout definition; review before migrating';
 end if;
 execute replace(definition,'terms<>''2026-11-draft''',
  'terms is distinct from (select checkout_terms_version from public.markets where code=m)');
end $$;

create table private.stripe_checkouts (
 id uuid primary key default gen_random_uuid(), order_id uuid not null unique references public.orders(id),
 livemode boolean not null, amount_minor bigint not null check(amount_minor>0), currency text not null,
 items jsonb not null, return_origin text not null, session_id text unique, checkout_url text,
 phase text not null default 'preparing' check(phase in ('preparing','open','processing','paid','expired','failed','review')),
 expires_at timestamptz not null default now()+interval '40 minutes',
 payment_intent text unique, attention text, next_check_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index stripe_pending_idx on private.stripe_checkouts(updated_at) where phase in ('preparing','open','processing','review');
create table private.stripe_events (
 event_id text primary key, checkout_id uuid not null references private.stripe_checkouts(id),
 outcome text not null, created_at timestamptz not null default now()
);
create index stripe_events_checkout_idx on private.stripe_events(checkout_id);
alter table private.stripe_checkouts enable row level security;
alter table private.stripe_events enable row level security;
revoke all on private.stripe_checkouts,private.stripe_events from public,anon,authenticated,service_role;

create function public.prepare_stripe_checkout(p_order uuid,p_user uuid,p_live boolean,p_origin text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.orders; c private.stripe_checkouts; lines jsonb; begin
 select * into o from public.orders where id=p_order for update;
 if not found or o.user_id is distinct from p_user or p_user is null or p_live is null or p_origin is null
  or p_origin !~ '^https://[a-zA-Z0-9.-]+(:[0-9]+)?$' then
  raise exception 'Order unavailable';
 end if;
 select * into c from private.stripe_checkouts where order_id=o.id for update;
 if found then
  if c.livemode is distinct from p_live then raise exception 'Payment mode mismatch'; end if;
 else
  if o.status<>'awaiting_payment' or o.payment_status<>'pending' then raise exception 'Order is closed'; end if;
  if p_live and o.terms_version ~* 'draft' then raise exception 'Final terms required for live payment'; end if;
  if not exists(select 1 from public.markets m where m.code=o.market and m.online_sales_approved and m.payments_ready
   and m.policy_reference is not null and m.checkout_terms_version=o.terms_version) then raise exception 'Market not ready'; end if;
  if exists(select 1 from public.order_items i join public.products p on p.id=i.product_id
   left join public.product_offers f on f.product_id=i.product_id and f.market=o.market
   where i.order_id=o.id and (p.status<>'published' or not coalesce(f.regulatory_approved,false) or f.approval_reference is null)) then
   raise exception 'Product unavailable';
  end if;
  if not exists(select 1 from public.inventory_reservations where order_id=o.id)
   or exists(select 1 from public.inventory_reservations where order_id=o.id and expires_at<=now()) then raise exception 'Reservation expired'; end if;
  select jsonb_agg(jsonb_build_object('name',product_name,'quantity',quantity,'unitAmount',unit_minor) order by product_id)
   into lines from public.order_items where order_id=o.id;
  if lines is null or (select sum(quantity::bigint*unit_minor) from public.order_items where order_id=o.id)<>o.total_minor then
   raise exception 'Order total mismatch';
  end if;
  insert into private.stripe_checkouts(order_id,livemode,amount_minor,currency,items,return_origin)
   values(o.id,p_live,o.total_minor,lower(o.currency),lines,p_origin) returning * into c;
  update public.inventory_reservations set expires_at=c.expires_at where order_id=o.id;
 end if;
 return jsonb_build_object('id',c.id,'orderId',c.order_id,'livemode',c.livemode,'amount',c.amount_minor,
 'currency',c.currency,'items',c.items,'origin',c.return_origin,'expiresAt',extract(epoch from c.expires_at)::bigint,
 'sessionId',c.session_id,'url',c.checkout_url,'phase',c.phase);
end $$;

create function public.bind_stripe_checkout(p_attempt uuid,p_session text,p_url text) returns text
language plpgsql security definer set search_path='' as $$
declare c private.stripe_checkouts; begin
 if p_session !~ '^cs_[A-Za-z0-9_]+$' or p_url !~ '^https://checkout[.]stripe[.]com/' then raise exception 'Invalid Stripe session'; end if;
 -- Consistent order -> checkout lock order, shared by payment events/maintenance.
 perform 1 from public.orders where id=(select order_id from private.stripe_checkouts where id=p_attempt) for update;
 select * into c from private.stripe_checkouts where id=p_attempt for update;
 if not found or (c.session_id is not null and c.session_id<>p_session) then raise exception 'Session mismatch'; end if;
 update private.stripe_checkouts set session_id=p_session,checkout_url=p_url,
  phase=case when phase='preparing' then 'open' else phase end,updated_at=now() where id=c.id;
 return c.phase;
end $$;

create function public.apply_stripe_checkout_event(p_event text,p_attempt uuid,p_order uuid,p_session text,
 p_live boolean,p_amount bigint,p_currency text,p_status text,p_payment text,p_intent text,p_failed boolean default false)
returns text language plpgsql security definer set search_path='' as $$
declare c private.stripe_checkouts; o public.orders; r record; changed integer; v_outcome text; begin
 if p_event is null or length(p_event)>255 or p_session is null or p_session !~ '^cs_[A-Za-z0-9_]+$'
  or p_status is null or p_status not in ('open','complete','expired') or p_payment is null or p_payment not in ('paid','unpaid','no_payment_required')
  or p_live is null or p_failed is null then raise exception 'Invalid payment event'; end if;
 select * into o from public.orders where id=p_order for update;
 select * into c from private.stripe_checkouts where id=p_attempt and order_id=p_order for update;
 if o.id is null or c.id is null or c.livemode is distinct from p_live or c.amount_minor is distinct from p_amount
  or c.currency is distinct from p_currency or (c.session_id is not null and c.session_id<>p_session) then
  raise exception 'Payment does not match order';
 end if;
 insert into private.stripe_events(event_id,checkout_id,outcome) values(p_event,c.id,'processing') on conflict do nothing;
 get diagnostics changed=row_count;
 if changed=0 then
  if not exists(select 1 from private.stripe_events where event_id=p_event and checkout_id=c.id) then raise exception 'Event reference mismatch'; end if;
  return 'duplicate';
 end if;
 v_outcome:=c.phase;
 if p_payment='paid' then
  if p_status<>'complete' or p_intent is null or p_intent !~ '^pi_[A-Za-z0-9]+$' then raise exception 'Incomplete payment'; end if;
  if c.phase<>'paid' and o.payment_status<>'paid' then
   if o.status<>'awaiting_payment' or not exists(select 1 from public.inventory_reservations where order_id=o.id) then
    v_outcome:='review';
    update public.orders set payment_status='paid' where id=o.id;
    update private.stripe_checkouts set attention='Payment received after order closure; reconcile before fulfillment' where id=c.id;
   else
    if exists(select 1 from public.order_items i left join public.inventory_reservations v on v.order_id=i.order_id and v.product_id=i.product_id
      where i.order_id=o.id and v.quantity is distinct from i.quantity) then raise exception 'Stock reconciliation required'; end if;
    for r in select * from public.inventory_reservations where order_id=o.id order by product_id for update loop
     update public.inventory set on_hand=on_hand-r.quantity,reserved=reserved-r.quantity
      where product_id=r.product_id and market=r.market and reserved>=r.quantity and on_hand>=r.quantity;
     if not found then raise exception 'Stock reconciliation required'; end if;
     insert into public.inventory_movements(product_id,market,delta,reason) values(r.product_id,r.market,-r.quantity,'Stripe paid order '||o.id::text);
    end loop;
    delete from public.inventory_reservations where order_id=o.id;
    update public.orders set status='paid',payment_status='paid' where id=o.id;
    v_outcome:='paid';
   end if;
  end if;
 elsif c.phase not in ('paid','review','expired','failed') and o.payment_status<>'paid' then
  if p_status='expired' or p_failed then
   for r in select * from public.inventory_reservations where order_id=o.id order by product_id for update loop
    update public.inventory set reserved=reserved-r.quantity where product_id=r.product_id and market=r.market;
   end loop;
   delete from public.inventory_reservations where order_id=o.id;
   update public.orders set status='cancelled',payment_status='failed' where id=o.id and status='awaiting_payment';
   v_outcome:=case when p_status='expired' then 'expired' else 'failed' end;
  elsif p_status='complete' then v_outcome:='processing';
  elsif c.phase='preparing' then v_outcome:='open'; end if;
 end if;
 update private.stripe_checkouts set phase=v_outcome,session_id=p_session,payment_intent=coalesce(p_intent,payment_intent),
  attention=case when v_outcome='review' then attention else null end,updated_at=now() where id=c.id;
 update private.stripe_events set outcome=v_outcome where event_id=p_event;
 return v_outcome;
end $$;

create function public.stripe_checkout_status(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare o public.orders; begin
 select * into o from public.orders where id=p_order;
 if not found or private.app_user_id() is null or (o.user_id<>private.app_user_id()
  and not private.has_role(o.market,array['admin','operations'])) then return null; end if;
 return (select jsonb_build_object('phase',phase,'livemode',livemode,'attention',attention,'updatedAt',updated_at)
  from private.stripe_checkouts where order_id=o.id);
end $$;

-- Never release stock underneath a potentially payable Stripe session. Stripe
-- expiry/failure events or canonical API reconciliation release it atomically.
-- Unknown network outcomes stay reserved for reconciliation, rather than oversell.
create or replace function public.release_expired_reservations() returns integer
language plpgsql security invoker set search_path='' as $$
declare o record; r record; n integer:=0; begin
 for o in select * from public.orders x where status='awaiting_payment' and payment_status='pending'
  and exists(select 1 from public.inventory_reservations v where v.order_id=x.id and v.expires_at<now())
  and not exists(select 1 from private.stripe_checkouts s where s.order_id=x.id)
  order by id for update skip locked loop
  for r in select * from public.inventory_reservations where order_id=o.id order by product_id for update loop
   update public.inventory set reserved=reserved-r.quantity where product_id=r.product_id and market=r.market;
   n:=n+1;
  end loop;
  delete from public.inventory_reservations where order_id=o.id;
  update public.orders set status='cancelled' where id=o.id;
 end loop;
 return n;
end $$;
-- The invoker maintenance function needs SELECT only on private payment state.
grant select on private.stripe_checkouts to service_role;
grant usage on schema private to service_role;
grant select,update,delete on public.inventory_reservations to service_role;
grant select,update on public.inventory,public.orders to service_role;

revoke all on function public.prepare_stripe_checkout(uuid,uuid,boolean,text),public.bind_stripe_checkout(uuid,text,text),
 public.apply_stripe_checkout_event(text,uuid,uuid,text,boolean,bigint,text,text,text,text,boolean),
 public.stripe_checkout_status(uuid) from public,anon,authenticated,service_role;
grant execute on function public.prepare_stripe_checkout(uuid,uuid,boolean,text),public.bind_stripe_checkout(uuid,text,text),
 public.apply_stripe_checkout_event(text,uuid,uuid,text,boolean,bigint,text,text,text,text,boolean) to service_role;
grant execute on function public.stripe_checkout_status(uuid) to authenticated;

create function public.pending_stripe_checkouts(p_live boolean) returns table(attempt_id uuid,order_id uuid,user_id uuid,session_id text)
language plpgsql security definer set search_path='' as $$
begin
 return query with claimed as (
  select s.id from private.stripe_checkouts s where s.livemode=p_live and s.phase in ('preparing','open','processing')
   and s.next_check_at<=now() order by s.next_check_at,s.id for update skip locked limit 5
 ), updated as (
  update private.stripe_checkouts s set next_check_at=now()+interval '2 minutes' from claimed c where s.id=c.id returning s.*
 ) select s.id,s.order_id,o.user_id,s.session_id from updated s join public.orders o on o.id=s.order_id;
end $$;
create function public.flag_stripe_reconciliation(p_attempt uuid) returns void
language sql security definer set search_path='' as $$
 update private.stripe_checkouts set attention='Provider reconciliation is pending; do not release stock without confirming the Stripe session',updated_at=now() where id=p_attempt and phase not in ('paid','expired','failed');
$$;
create function public.staff_stripe_payments() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (
  select s.order_id,o.market,s.phase,s.livemode,s.amount_minor,s.currency,s.attention,s.updated_at
  from private.stripe_checkouts s join public.orders o on o.id=s.order_id
  where private.has_role(o.market,array['admin','operations']) order by s.updated_at desc limit 100
 ) r;
$$;
revoke all on function public.pending_stripe_checkouts(boolean),public.flag_stripe_reconciliation(uuid),public.staff_stripe_payments() from public,anon,authenticated,service_role;
grant execute on function public.pending_stripe_checkouts(boolean),public.flag_stripe_reconciliation(uuid) to service_role;
grant execute on function public.staff_stripe_payments() to authenticated;
