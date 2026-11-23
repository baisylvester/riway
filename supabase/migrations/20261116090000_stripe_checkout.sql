-- Stripe Checkout settlement. Browser roles cannot execute these functions.
-- The server calls them with the service role only after verifying the Stripe
-- webhook signature. Payment, stock consumption and release happen in one
-- transaction per event, and every event id is recorded for replay protection.

alter table public.orders
  add column stripe_checkout_session_id text unique,
  add column paid_at timestamptz;

create table public.stripe_events (
  id text primary key check (id ~ '^evt_[A-Za-z0-9_]+$'),
  event_type text not null check (length(event_type) between 1 and 120),
  session_id text,
  outcome text not null check (outcome in ('paid','failed','expired','ignored','duplicate')),
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from anon, authenticated;

-- Links a hosted Checkout Session to a pending order and keeps its stock held
-- until the session can no longer be paid.
create function public.stripe_attach_session(oid uuid, sid text, expires timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
 if sid !~ '^cs_[A-Za-z0-9_]+$' then raise exception 'Invalid checkout session'; end if;
 if expires is null or expires <= now() then raise exception 'Checkout session already expired'; end if;
 update public.orders set stripe_checkout_session_id = sid
  where id = oid and status = 'awaiting_payment' and payment_status = 'pending' and stripe_checkout_session_id is null;
 if not found then return false; end if;
 update public.inventory_reservations set expires_at = greatest(expires_at, expires + interval '5 minutes')
  where order_id = oid;
 return true;
end $$;

-- Applies one verified Stripe event. Returns a short outcome for logging.
create function public.stripe_settle_event(event_id text, event_type text, sid text, outcome text, amount_minor bigint, currency text)
returns text language plpgsql security definer set search_path = '' as $$
declare o public.orders; r record;
begin
 if outcome not in ('paid','failed','expired','ignored') then raise exception 'Invalid payment outcome'; end if;
 insert into public.stripe_events(id, event_type, session_id, outcome)
  values (event_id, event_type, sid, outcome) on conflict do nothing;
 if not found then return 'duplicate'; end if;
 if outcome = 'ignored' then return 'ignored'; end if;

 select * into o from public.orders where stripe_checkout_session_id = sid for update;
 if not found then return 'unknown_session'; end if;

 if outcome = 'paid' then
  if o.payment_status = 'paid' then return 'already_paid'; end if;
  if o.status <> 'awaiting_payment' or o.payment_status <> 'pending' then return 'needs_review'; end if;
  if o.total_minor <> amount_minor or lower(o.currency) <> lower(currency) then return 'amount_mismatch'; end if;
  for r in select * from public.inventory_reservations where order_id = o.id for update loop
   update public.inventory set on_hand = on_hand - r.quantity, reserved = reserved - r.quantity
    where product_id = r.product_id and market = r.market;
   insert into public.inventory_movements(product_id, market, delta, reason, actor_id)
    values (r.product_id, r.market, -r.quantity, 'Stripe payment for order ' || o.id::text, null);
  end loop;
  delete from public.inventory_reservations where order_id = o.id;
  update public.orders set payment_status = 'paid', status = 'paid', paid_at = now() where id = o.id;
  return 'paid';
 end if;

 -- failed or expired: release the hold only while the order is still unpaid.
 if o.payment_status <> 'pending' or o.status <> 'awaiting_payment' then return 'not_releasable'; end if;
 for r in select * from public.inventory_reservations where order_id = o.id for update loop
  update public.inventory set reserved = reserved - r.quantity
   where product_id = r.product_id and market = r.market;
 end loop;
 delete from public.inventory_reservations where order_id = o.id;
 update public.orders set status = 'cancelled', payment_status = 'failed' where id = o.id;
 return 'released';
end $$;

revoke all on function public.stripe_attach_session(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.stripe_attach_session(uuid, text, timestamptz) to service_role;
revoke all on function public.stripe_settle_event(text, text, text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.stripe_settle_event(text, text, text, text, bigint, text) to service_role;
