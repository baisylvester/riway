-- Xendit Payment Sessions as a second payment gateway beside Stripe.
--
-- Concepts kept apart on purpose:
--  * gateway: Stripe or Xendit (one gateway per order; never both).
--  * payment channel: a Xendit channel code such as GCASH or BPI_ONLINE_BANKING
--    that the customer chooses. Choosing a bank channel never gives RIWAY access
--    to the customer's bank account; the customer authorizes on Xendit/the bank.
--  * merchant routing: each market's live payments are processed by its own
--    xenPlatform sub-account (sent as the documented for-user-id header); test
--    mode may also use the master account. Routing is resolved here from trusted market data, never from the
--    browser.
--  * settlement/payout bank accounts are configured in the Xendit dashboard and
--    are not stored or used by RIWAY.
--
-- Payment state is service-only. A browser can neither prepare a payment nor
-- mark one paid. Stock is deducted once by the first confirmed payment; any
-- further or late payment is flagged for review instead of fulfilled.

create table private.xendit_market_accounts (
 market text not null references public.markets(code),
 livemode boolean not null,
 account_type text not null check(account_type in ('MASTER','OWNED','MANAGED')),
 sub_account_id text check(sub_account_id ~ '^[A-Za-z0-9_-]{8,64}$'),
 account_status text check(account_status in ('REGISTERED','AWAITING_DOCS','PENDING_VERIFICATION','AWAITING_RESUBMISSION',
  'LIVE','DECLINED','DORMANT','SUSPENDED','CLOSED','INVITED')),
 enabled_channels text[] not null default '{}'
  check(cardinality(enabled_channels)<=60 and array_to_string(enabled_channels,',') ~ '^([A-Z0-9_]{2,40}(,|$))*$'),
 payments_enabled boolean not null default false,
 updated_by uuid references public.app_users(id),
 updated_at timestamptz not null default now(),
 primary key(market,livemode),
 check((account_type='MASTER')=(sub_account_id is null)),
 check(account_type='MASTER' or account_status is not null),
 -- A sub-account can process payments only once Xendit reports it LIVE.
 check(not payments_enabled or account_type='MASTER' or account_status='LIVE'),
 -- RIWAY decision (2026-11-23): each market's live payments go to its own
 -- xenPlatform sub-account, never to the master account. Test mode may use the
 -- master account for sandbox checks.
 check(not livemode or account_type<>'MASTER')
);

create table private.xendit_payments (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id),
 attempt_no integer not null check(attempt_no between 1 and 5),
 market text not null references public.markets(code),
 livemode boolean not null,
 sub_account_id text check(sub_account_id ~ '^[A-Za-z0-9_-]{8,64}$'),
 channel_code text not null check(channel_code ~ '^[A-Z0-9_]{2,40}$'),
 country text not null check(country in ('PH','SG','MY')),
 amount_minor bigint not null check(amount_minor>0),
 currency text not null check(currency in ('PHP','SGD','MYR')),
 items jsonb not null,
 return_origin text not null,
 session_id text unique check(session_id ~ '^ps-[A-Za-z0-9_-]{6,64}$'),
 checkout_url text,
 provider_payment_id text,
 phase text not null default 'preparing' check(phase in ('preparing','open','paid','expired','canceled','review')),
 expires_at timestamptz not null default now()+interval '30 minutes',
 attention text,
 next_check_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(order_id,attempt_no)
);
-- At most one payable attempt per order: repeated clicks and concurrent
-- requests reuse it instead of creating a second session.
create unique index xendit_one_active_attempt on private.xendit_payments(order_id) where phase in ('preparing','open');
create index xendit_pending_idx on private.xendit_payments(next_check_at) where phase in ('preparing','open');
create index xendit_payments_market_idx on private.xendit_payments(market,updated_at desc);

create table private.xendit_events (
 event_key text primary key check(length(event_key) between 3 and 255),
 payment_id uuid not null references private.xendit_payments(id),
 outcome text not null,
 created_at timestamptz not null default now()
);
create index xendit_events_payment_idx on private.xendit_events(payment_id);

alter table private.xendit_market_accounts enable row level security;
alter table private.xendit_payments enable row level security;
alter table private.xendit_events enable row level security;
revoke all on private.xendit_market_accounts,private.xendit_payments,private.xendit_events from public,anon,authenticated,service_role;
create policy xendit_accounts_internal_only on private.xendit_market_accounts for all to anon,authenticated using(false) with check(false);
create policy xendit_payments_internal_only on private.xendit_payments for all to anon,authenticated using(false) with check(false);
create policy xendit_events_internal_only on private.xendit_events for all to anon,authenticated using(false) with check(false);

-- Prepare (or reuse) the order's Xendit attempt. Returns the active, paid or
-- latest attempt; the caller decides whether to resume, switch or stop.
create function public.prepare_xendit_payment(p_order uuid,p_user uuid,p_live boolean,p_origin text,p_channel text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.orders; a private.xendit_market_accounts; c private.xendit_payments; prior integer; lines jsonb; begin
 select * into o from public.orders where id=p_order for update;
 if not found or o.user_id is distinct from p_user or p_user is null or p_live is null or p_origin is null
  or p_origin !~ '^https://[a-zA-Z0-9.-]+(:[0-9]+)?$' or p_channel is null or p_channel !~ '^[A-Z0-9_]{2,40}$' then
  raise exception 'Order unavailable';
 end if;
 if exists(select 1 from private.stripe_checkouts where order_id=o.id) then
  raise exception 'Another payment gateway is in use for this order';
 end if;
 select * into c from private.xendit_payments where order_id=o.id and phase in ('preparing','open','paid','review')
  order by case phase when 'paid' then 0 when 'review' then 1 else 2 end,attempt_no desc limit 1 for update;
 if found then
  if c.livemode is distinct from p_live then raise exception 'Payment mode mismatch'; end if;
 else
  if o.status<>'awaiting_payment' or o.payment_status<>'pending' then raise exception 'Order is closed'; end if;
  select count(*) into prior from private.xendit_payments where order_id=o.id;
  if prior>=5 then raise exception 'Too many payment attempts'; end if;
  select * into a from private.xendit_market_accounts where market=o.market and livemode=p_live and payments_enabled;
  if not found then raise exception 'Xendit is not enabled for this market'; end if;
  if not (p_channel=any(a.enabled_channels)) then raise exception 'Payment channel unavailable'; end if;
  if p_live and o.terms_version ~* 'draft' then raise exception 'Final terms required for live payment'; end if;
  if not exists(select 1 from public.markets m where m.code=o.market and m.online_sales_approved and m.payments_ready
   and m.policy_reference is not null and m.checkout_terms_version=o.terms_version) then raise exception 'Market not ready'; end if;
  if prior=0 then
   -- Same product/offer/stock gates as the Stripe path.
   if exists(select 1 from public.order_items i join public.products p on p.id=i.product_id left join public.product_offers f on f.product_id=i.product_id and f.market=o.market
    where i.order_id=o.id and (p.status<>'published' or not coalesce(f.regulatory_approved,false) or f.approval_reference is null or f.currency is distinct from o.currency)) then raise exception 'Product unavailable'; end if;
   if exists(select 1 from private.order_inventory_items i join public.products p on p.id=i.product_id left join public.product_offers f on f.product_id=i.product_id and f.market=i.market
    where i.order_id=o.id and (i.market<>o.market or p.status<>'published' or (p.category='Packages' and not i.legacy_sku) or not coalesce(f.regulatory_approved,false) or f.approval_reference is null or f.currency is distinct from o.currency)) then raise exception 'Package component unavailable'; end if;
   if exists(select 1 from public.inventory_reservations where order_id=o.id and expires_at<=now()) then raise exception 'Reservation expired or stock reconciliation required'; end if;
  end if;
  -- Later attempts follow a provider-confirmed cancellation; the stock hold was
  -- kept for this order and must still match it exactly.
  if not private.commerce_manifest_matches(o.id) then raise exception 'Reservation expired or stock reconciliation required'; end if;
  select jsonb_agg(jsonb_build_object('referenceId',i.product_id,'name',left(i.product_name,110)||' × '||i.quantity::text,
   'category',left(p.category,60),'amount',i.net_minor) order by i.product_id)
   into lines from public.order_items i join public.products p on p.id=i.product_id where i.order_id=o.id;
  if lines is null or jsonb_array_length(lines)>30 or (select sum(net_minor) from public.order_items where order_id=o.id)<>o.total_minor
   or (select sum(discount_minor) from public.order_items where order_id=o.id)<>o.discount_minor
   or (select sum(quantity::bigint*unit_minor) from public.order_items where order_id=o.id)<>o.subtotal_minor then raise exception 'Order total mismatch'; end if;
  insert into private.xendit_payments(order_id,attempt_no,market,livemode,sub_account_id,channel_code,country,amount_minor,currency,items,return_origin)
   values(o.id,prior+1,o.market,p_live,a.sub_account_id,p_channel,o.market,o.total_minor,upper(o.currency),lines,p_origin) returning * into c;
  update public.inventory_reservations set expires_at=c.expires_at+interval '5 minutes' where order_id=o.id;
 end if;
 return jsonb_build_object('id',c.id,'orderId',c.order_id,'attemptNo',c.attempt_no,'livemode',c.livemode,'subAccountId',c.sub_account_id,
  'channel',c.channel_code,'country',c.country,'amount',c.amount_minor,'currency',c.currency,'items',c.items,'origin',c.return_origin,
  'expiresAt',to_char(c.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'sessionId',c.session_id,'url',c.checkout_url,'phase',c.phase);
end $$;

create function public.bind_xendit_payment(p_attempt uuid,p_session text,p_url text) returns text
language plpgsql security definer set search_path='' as $$
declare c private.xendit_payments; begin
 if p_session is null or p_session !~ '^ps-[A-Za-z0-9_-]{6,64}$'
  or p_url is null or p_url !~ '^https://(checkout|checkout-staging)[.]xendit[.]co/|^https://(dev[.])?xen[.]to/' then
  raise exception 'Invalid Xendit session';
 end if;
 perform 1 from public.orders where id=(select order_id from private.xendit_payments where id=p_attempt) for update;
 select * into c from private.xendit_payments where id=p_attempt for update;
 if not found or (c.session_id is not null and c.session_id<>p_session) then raise exception 'Session mismatch'; end if;
 update private.xendit_payments set session_id=p_session,checkout_url=p_url,
  phase=case when phase='preparing' then 'open' else phase end,updated_at=now() where id=c.id;
 return case when c.phase='preparing' then 'open' else c.phase end;
end $$;

-- Called only after Xendit confirmed the session is CANCELED (customer chose a
-- different channel). The stock hold stays with the order for the next attempt.
create function public.supersede_xendit_payment(p_attempt uuid,p_session text) returns text
language plpgsql security definer set search_path='' as $$
declare c private.xendit_payments; begin
 perform 1 from public.orders where id=(select order_id from private.xendit_payments where id=p_attempt) for update;
 select * into c from private.xendit_payments where id=p_attempt for update;
 if not found or c.session_id is distinct from p_session then raise exception 'Session mismatch'; end if;
 if c.phase='open' then
  update private.xendit_payments set phase='canceled',attention=null,updated_at=now() where id=c.id;
  return 'canceled';
 end if;
 return c.phase;
end $$;

-- Xendit definitively refused to create the session (4xx): nothing payable
-- exists, so the attempt closes and the customer may choose another channel.
-- A session from an earlier lost request was never shown to anyone.
create function public.reject_xendit_payment(p_attempt uuid,p_code text) returns text
language plpgsql security definer set search_path='' as $$
declare c private.xendit_payments; begin
 if p_code is null or p_code !~ '^[A-Z0-9_]{1,64}$' then raise exception 'Invalid rejection'; end if;
 perform 1 from public.orders where id=(select order_id from private.xendit_payments where id=p_attempt) for update;
 select * into c from private.xendit_payments where id=p_attempt for update;
 if not found then raise exception 'Payment unavailable'; end if;
 if c.phase='preparing' and c.session_id is null then
  update private.xendit_payments set phase='canceled',attention='Xendit refused to create the session ('||p_code||')',updated_at=now() where id=c.id;
  return 'canceled';
 end if;
 return c.phase;
end $$;

-- Apply canonical session state retrieved from Xendit with the attempt's own
-- account context. Duplicate and out-of-order deliveries are harmless: terminal
-- phases never regress and stock moves at most once.
create function public.apply_xendit_payment_event(p_event text,p_attempt uuid,p_order uuid,p_session text,p_live boolean,
 p_amount bigint,p_currency text,p_status text,p_payment text) returns text
language plpgsql security definer set search_path='' as $$
declare c private.xendit_payments; o public.orders; r record; changed integer; v_outcome text; v_attention text; begin
 if p_event is null or length(p_event) not between 3 and 255 or p_session is null or p_session !~ '^ps-[A-Za-z0-9_-]{6,64}$'
  or p_status is null or p_status not in ('ACTIVE','COMPLETED','EXPIRED','CANCELED') or p_live is null
  or (p_payment is not null and p_payment !~ '^[A-Za-z0-9_-]{3,64}$') then raise exception 'Invalid payment event'; end if;
 select * into o from public.orders where id=p_order for update;
 select * into c from private.xendit_payments where id=p_attempt and order_id=p_order for update;
 if o.id is null or c.id is null or c.livemode is distinct from p_live or c.amount_minor is distinct from p_amount
  or c.currency is distinct from p_currency then
  raise exception 'Payment does not match order';
 end if;
 -- A different session with this attempt's reference can only come from an
 -- uncertain creation retry whose link was never shown to anyone.
 if c.session_id is not null and c.session_id<>p_session then
  if p_status='COMPLETED' then
   update private.xendit_payments set phase='review',attention='Payment completed on an unbound Xendit session '||p_session||'; refund or reconcile before fulfillment',updated_at=now() where id=c.id;
   return 'review';
  end if;
  return 'ignored';
 end if;
 insert into private.xendit_events(event_key,payment_id,outcome) values(p_event,c.id,'processing') on conflict do nothing;
 get diagnostics changed=row_count;
 if changed=0 then
  if not exists(select 1 from private.xendit_events where event_key=p_event and payment_id=c.id) then raise exception 'Event reference mismatch'; end if;
  return 'duplicate';
 end if;
 v_outcome:=c.phase; v_attention:=c.attention;
 if p_status='COMPLETED' then
  if p_payment is null then raise exception 'Incomplete payment'; end if;
  if c.phase not in ('paid','review') then
   if o.payment_status='paid' then
    -- Another attempt already paid this order: excess payment.
    v_outcome:='review'; v_attention:='Additional payment received for an already paid order; refund or reconcile';
   elsif o.status<>'awaiting_payment' or not exists(select 1 from public.inventory_reservations where order_id=o.id) then
    v_outcome:='review'; v_attention:='Payment received after order closure; reconcile before fulfillment';
    update public.orders set payment_status='paid' where id=o.id;
   else
    if not private.commerce_manifest_matches(o.id) then raise exception 'Stock reconciliation required'; end if;
    for r in select * from public.inventory_reservations where order_id=o.id order by product_id for update loop
     update public.inventory set on_hand=on_hand-r.quantity,reserved=reserved-r.quantity
      where product_id=r.product_id and market=r.market and reserved>=r.quantity and on_hand>=r.quantity;
     if not found then raise exception 'Stock reconciliation required'; end if;
     insert into public.inventory_movements(product_id,market,delta,reason) values(r.product_id,r.market,-r.quantity,'Xendit paid order '||o.id::text);
    end loop;
    delete from public.inventory_reservations where order_id=o.id;
    update public.orders set status='paid',payment_status='paid' where id=o.id;
    v_outcome:='paid'; v_attention:=null;
   end if;
  end if;
 elsif p_status='EXPIRED' then
  if c.phase in ('preparing','open') then
   v_outcome:='expired';
   if o.payment_status<>'paid' and o.status='awaiting_payment'
    and not exists(select 1 from private.xendit_payments x where x.order_id=o.id and x.id<>c.id and x.phase in ('preparing','open','paid','review')) then
    for r in select * from public.inventory_reservations where order_id=o.id order by product_id for update loop
     update public.inventory set reserved=reserved-r.quantity where product_id=r.product_id and market=r.market;
    end loop;
    delete from public.inventory_reservations where order_id=o.id;
    update public.orders set status='cancelled',payment_status='failed' where id=o.id;
   end if;
  end if;
 elsif p_status='CANCELED' then
  -- Stock is released by the abandoned-order sweep once no payable attempt remains.
  if c.phase in ('preparing','open') then v_outcome:='canceled'; end if;
 elsif c.phase='preparing' then v_outcome:='open';
 end if;
 update private.xendit_payments set phase=v_outcome,session_id=p_session,provider_payment_id=coalesce(p_payment,provider_payment_id),
  attention=v_attention,updated_at=now() where id=c.id;
 update private.xendit_events set outcome=v_outcome where event_key=p_event;
 return v_outcome;
end $$;

-- Server-side lookup of the account context for a webhook's reference.
create function public.xendit_payment_context(p_attempt uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'orderId',order_id,'livemode',livemode,'subAccountId',sub_account_id,'sessionId',session_id,'phase',phase)
 from private.xendit_payments where id=p_attempt;
$$;

create function public.pending_xendit_payments(p_live boolean) returns table(attempt_id uuid,order_id uuid,user_id uuid,session_id text,
 sub_account_id text,channel_code text,order_paid boolean)
language plpgsql security definer set search_path='' as $$
begin
 return query with claimed as (
  select s.id from private.xendit_payments s where s.livemode=p_live and s.phase in ('preparing','open')
   and s.next_check_at<=now() order by s.next_check_at,s.id for update skip locked limit 5
 ), updated as (
  update private.xendit_payments s set next_check_at=now()+interval '2 minutes' from claimed c where s.id=c.id returning s.*
 ) select s.id,s.order_id,o.user_id,s.session_id,s.sub_account_id,s.channel_code,o.payment_status='paid'
   from updated s join public.orders o on o.id=s.order_id;
end $$;

create function public.flag_xendit_reconciliation(p_attempt uuid) returns void
language sql security definer set search_path='' as $$
 update private.xendit_payments set attention='Provider reconciliation is pending; do not release stock without confirming the Xendit session',updated_at=now()
 where id=p_attempt and phase in ('preparing','open');
$$;

-- Orders whose every Xendit attempt is provider-confirmed closed (canceled or
-- expired) and that have no payable attempt are released after a grace period.
create function public.release_abandoned_xendit_orders() returns integer
language plpgsql security definer set search_path='' as $$
declare o record; r record; n integer:=0; begin
 -- Creation never confirmed and its fixed expiry has passed: any session from
 -- a lost request carried the same expiry and its link was never shown, so
 -- nothing can still be paid. Close it so the sweep below can release stock.
 update private.xendit_payments set phase='expired',attention='Xendit never confirmed this session before its expiry',
  updated_at=now()-interval '15 minutes'
 where phase='preparing' and session_id is null and expires_at<now()-interval '5 minutes';
 for o in select x.* from public.orders x where x.status='awaiting_payment' and x.payment_status='pending'
  and exists(select 1 from private.xendit_payments p where p.order_id=x.id)
  and not exists(select 1 from private.xendit_payments p where p.order_id=x.id and (p.phase in ('preparing','open','paid','review') or p.updated_at>now()-interval '15 minutes'))
  and not exists(select 1 from private.stripe_checkouts s where s.order_id=x.id)
  order by x.id limit 50 for update skip locked loop
  if exists(select 1 from private.xendit_payments p where p.order_id=o.id and (p.phase in ('preparing','open','paid','review') or p.updated_at>now()-interval '15 minutes'))
   or not exists(select 1 from public.orders where id=o.id and status='awaiting_payment' and payment_status='pending') then continue; end if;
  for r in select * from public.inventory_reservations where order_id=o.id order by product_id for update loop
   update public.inventory set reserved=reserved-r.quantity where product_id=r.product_id and market=r.market;
  end loop;
  delete from public.inventory_reservations where order_id=o.id;
  update public.orders set status='cancelled',payment_status='failed' where id=o.id;
  n:=n+1;
 end loop;
 return n;
end $$;

-- Enabled channel codes for checkout display. Not secret; the server re-checks
-- the channel, amount and routing when it creates the payment.
create function private.xendit_checkout_channels(p_market text,p_live boolean) returns text[]
language sql stable security definer set search_path='' as $$
 select coalesce((select enabled_channels from private.xendit_market_accounts where market=p_market and livemode=p_live and payments_enabled),'{}'::text[]);
$$;
create function public.xendit_checkout_channels(p_market text,p_live boolean) returns text[]
language sql stable security invoker set search_path='' as $$ select private.xendit_checkout_channels(p_market,p_live); $$;

-- Customer/staff read of the latest attempt for one order.
create function private.xendit_payment_status(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare o public.orders; begin
 select * into o from public.orders where id=p_order;
 if not found or private.app_user_id() is null or (o.user_id<>private.app_user_id()
  and not private.has_role(o.market,array['admin','operations'])) then return null; end if;
 return (select jsonb_build_object('phase',phase,'livemode',livemode,'channel',channel_code,'attemptNo',attempt_no,
   'expiresAt',expires_at,'attention',attention,'updatedAt',updated_at)
  from private.xendit_payments where order_id=o.id order by case phase when 'paid' then 0 when 'review' then 1 else 2 end,attempt_no desc limit 1);
end $$;
create function public.xendit_payment_status(p_order uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.xendit_payment_status(p_order); $$;

create function private.staff_xendit_payments() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (
  select s.order_id,s.attempt_no,s.market,s.channel_code,s.phase,s.livemode,s.amount_minor,s.currency,
   case when s.sub_account_id is null then 'master' else 'sub-account' end as routing,s.attention,s.updated_at
  from private.xendit_payments s where private.has_role(s.market,array['admin','operations']) order by s.updated_at desc limit 100
 ) r;
$$;
create function public.staff_xendit_payments() returns jsonb
language sql stable security invoker set search_path='' as $$ select private.staff_xendit_payments(); $$;

create function private.staff_xendit_market_accounts() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(r) order by r.market,r.livemode),'[]'::jsonb) from (
  select market,livemode,account_type,sub_account_id,account_status,enabled_channels,payments_enabled,updated_at
  from private.xendit_market_accounts where private.has_role(market,array['admin','operations'])
 ) r;
$$;
create function public.staff_xendit_market_accounts() returns jsonb
language sql stable security invoker set search_path='' as $$ select private.staff_xendit_market_accounts(); $$;

-- Market administrators (MFA) set routing after checking the Xendit dashboard.
-- Changing routing never moves existing attempts: each attempt snapshots its account.
create function private.set_xendit_market_account(p_market text,p_live boolean,p_type text,p_sub_account text,
 p_status text,p_channels text[],p_enabled boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.app_user_id(); begin
 if actor is null or p_market is null or not private.has_role(p_market,array['admin']) then
  raise exception 'Payment routing access denied' using errcode='42501';
 end if;
 insert into private.xendit_market_accounts(market,livemode,account_type,sub_account_id,account_status,enabled_channels,payments_enabled,updated_by,updated_at)
 values(p_market,p_live,p_type,nullif(btrim(p_sub_account),''),nullif(p_status,''),coalesce(p_channels,'{}'),coalesce(p_enabled,false),actor,now())
 on conflict(market,livemode) do update set account_type=excluded.account_type,sub_account_id=excluded.sub_account_id,
  account_status=excluded.account_status,enabled_channels=excluded.enabled_channels,payments_enabled=excluded.payments_enabled,
  updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 insert into public.audit_logs(actor_id,action,entity,entity_id)
 values(actor,'XENDIT_ROUTING_'||case when p_live then 'LIVE' else 'TEST' end||':'||p_market,'xendit_market_accounts',p_market);
 return (select to_jsonb(a) from private.xendit_market_accounts a where market=p_market and livemode=p_live);
end $$;
create function public.set_xendit_market_account(p_market text,p_live boolean,p_type text,p_sub_account text,
 p_status text,p_channels text[],p_enabled boolean) returns jsonb
language sql security invoker set search_path='' as $$ select private.set_xendit_market_account(p_market,p_live,p_type,p_sub_account,p_status,p_channels,p_enabled); $$;

revoke all on function public.prepare_xendit_payment(uuid,uuid,boolean,text,text),public.bind_xendit_payment(uuid,text,text),public.reject_xendit_payment(uuid,text),
 public.supersede_xendit_payment(uuid,text),public.apply_xendit_payment_event(text,uuid,uuid,text,boolean,bigint,text,text,text),
 public.xendit_payment_context(uuid),public.pending_xendit_payments(boolean),public.flag_xendit_reconciliation(uuid),
 public.release_abandoned_xendit_orders(),
 private.xendit_checkout_channels(text,boolean),public.xendit_checkout_channels(text,boolean),
 private.xendit_payment_status(uuid),public.xendit_payment_status(uuid),private.staff_xendit_payments(),public.staff_xendit_payments(),
 private.staff_xendit_market_accounts(),public.staff_xendit_market_accounts(),
 private.set_xendit_market_account(text,boolean,text,text,text,text[],boolean),public.set_xendit_market_account(text,boolean,text,text,text,text[],boolean)
 from public,anon,authenticated,service_role;
grant execute on function public.prepare_xendit_payment(uuid,uuid,boolean,text,text),public.bind_xendit_payment(uuid,text,text),public.reject_xendit_payment(uuid,text),
 public.supersede_xendit_payment(uuid,text),public.apply_xendit_payment_event(text,uuid,uuid,text,boolean,bigint,text,text,text),
 public.xendit_payment_context(uuid),public.pending_xendit_payments(boolean),public.flag_xendit_reconciliation(uuid),
 public.release_abandoned_xendit_orders() to service_role;
grant execute on function private.xendit_checkout_channels(text,boolean),public.xendit_checkout_channels(text,boolean) to anon,authenticated,service_role;
grant execute on function private.xendit_payment_status(uuid),public.xendit_payment_status(uuid),private.staff_xendit_payments(),public.staff_xendit_payments(),
 private.staff_xendit_market_accounts(),public.staff_xendit_market_accounts(),
 private.set_xendit_market_account(text,boolean,text,text,text,text[],boolean),public.set_xendit_market_account(text,boolean,text,text,text,text[],boolean) to authenticated;

-- Existing guards: an order with any Xendit attempt needs provider
-- reconciliation, exactly like a Stripe-backed order.
create or replace function public.release_expired_reservations() returns integer
language plpgsql security invoker set search_path='' as $$
declare o record; r record; n integer:=0; begin
 for o in select * from public.orders x where x.status='awaiting_payment' and x.payment_status='pending'
  and exists(select 1 from public.inventory_reservations v where v.order_id=x.id and v.expires_at<now())
  and not exists(select 1 from private.stripe_checkouts s where s.order_id=x.id)
  and not exists(select 1 from private.xendit_payments s where s.order_id=x.id)
  order by x.id limit 50 for update skip locked loop
  if exists(select 1 from private.stripe_checkouts where order_id=o.id)
   or exists(select 1 from private.xendit_payments where order_id=o.id)
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

grant select on private.xendit_payments to service_role;

do $$ declare definition text; guard text; begin
 -- Stripe must not start on an order that already has a Xendit attempt.
 definition:=replace(pg_get_functiondef('public.prepare_stripe_checkout(uuid,uuid,boolean,text)'::regprocedure),chr(13),'');
 guard:='if o.status<>''awaiting_payment'' or o.payment_status<>''pending'' then raise exception ''Order is closed''; end if;';
 if position(guard in definition)=0 then raise exception 'Unexpected Stripe prepare definition; review migration'; end if;
 execute replace(definition,guard,'if exists(select 1 from private.xendit_payments where order_id=o.id) then raise exception ''Another payment gateway is in use for this order''; end if; '||guard);

 definition:=replace(pg_get_functiondef('private.cancel_order(uuid,text)'::regprocedure),chr(13),'');
 guard:='if exists(select 1 from private.stripe_checkouts where order_id=o.id) then';
 if position(guard in definition)=0 then raise exception 'Unexpected cancellation definition; review migration'; end if;
 execute replace(definition,guard,'if exists(select 1 from private.stripe_checkouts where order_id=o.id) or exists(select 1 from private.xendit_payments where order_id=o.id) then');

 definition:=replace(pg_get_functiondef('private.order_cancellation_json(uuid)'::regprocedure),chr(13),'');
 guard:='and not exists(select 1 from private.stripe_checkouts s where s.order_id=o.id)';
 if position(guard in definition)=0 then raise exception 'Unexpected cancellation state definition; review migration'; end if;
 execute replace(definition,guard,guard||' and not exists(select 1 from private.xendit_payments s where s.order_id=o.id)');
end $$;
