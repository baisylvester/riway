-- Order cancellation v1. An order can be cancelled only while it is unpaid and
-- no payment attempt exists: the customer can cancel their own order, and market
-- administrators or operations staff can cancel one with a reason. Cancelling
-- releases the stock hold; existing order-state triggers release a reserved
-- voucher use and close a pending membership enrolment. Paid orders need a refund
-- and are handled by RIWAY support until refunds are approved; once a payment
-- attempt exists, the provider reconciliation path decides the outcome.
create table private.order_cancellations (
 order_id uuid primary key references public.orders(id),
 market text not null references public.markets(code),
 cancelled_by text not null check(cancelled_by in ('customer','staff')),
 reason text check(length(reason) between 5 and 500 and reason !~ '[\x01-\x09\x0b-\x1f\x7f]'),
 actor_id uuid not null references public.app_users(id),
 created_at timestamptz not null default clock_timestamp(),
 check(cancelled_by='customer' or reason is not null)
);
create index order_cancellations_market_idx on private.order_cancellations(market,created_at desc);
create index order_cancellations_actor_idx on private.order_cancellations(actor_id);
alter table private.order_cancellations enable row level security;
revoke all on private.order_cancellations from public,anon,authenticated,service_role;
create policy order_cancellations_internal_only on private.order_cancellations for all to anon,authenticated using(false) with check(false);

create function private.order_cancellation_json(p_order uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('orderId',o.id,'status',o.status,'paymentStatus',o.payment_status,
  'cancellable',o.status='awaiting_payment' and o.payment_status='pending'
   and not exists(select 1 from private.stripe_checkouts s where s.order_id=o.id),
  'cancellation',(select jsonb_build_object('cancelledBy',c.cancelled_by,'reason',c.reason,'createdAt',c.created_at)
   from private.order_cancellations c where c.order_id=o.id))
 from public.orders o where o.id=p_order;
$$;

create function private.cancel_order(p_order uuid,p_reason text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.orders; c private.order_cancellations; r record; actor uuid:=private.app_user_id(); who text;
 v_reason text:=nullif(btrim(replace(replace(coalesce(p_reason,''),chr(13)||chr(10),chr(10)),chr(13),chr(10))),''); begin
 select * into o from public.orders where id=p_order;
 if not found or actor is null then raise exception 'Order cancellation access denied' using errcode='42501'; end if;
 if o.user_id=actor then who:='customer';
 elsif private.has_role(o.market,array['admin','operations']) then who:='staff';
 else raise exception 'Order cancellation access denied' using errcode='42501'; end if;
 if who='staff' and v_reason is null then raise exception 'A cancellation reason is required'; end if;
 select * into o from public.orders where id=p_order for update;
 -- An exact replay returns the recorded cancellation; anything else is refused.
 select * into c from private.order_cancellations where order_id=o.id;
 if found then
  if c.cancelled_by<>who or c.reason is distinct from v_reason then raise exception 'This order was already cancelled'; end if;
  return private.order_cancellation_json(o.id);
 end if;
 if o.payment_status<>'pending' or o.status<>'awaiting_payment' then
  raise exception 'Only unpaid orders can be cancelled online' using errcode='40001';
 end if;
 if exists(select 1 from private.stripe_checkouts where order_id=o.id) then
  raise exception 'A payment has started for this order' using errcode='40001';
 end if;
 for r in select * from public.inventory_reservations where order_id=o.id order by product_id for update loop
  update public.inventory set reserved=reserved-r.quantity where product_id=r.product_id and market=r.market;
 end loop;
 delete from public.inventory_reservations where order_id=o.id;
 insert into private.order_cancellations(order_id,market,cancelled_by,reason,actor_id)
 values(o.id,o.market,who,v_reason,actor);
 update public.orders set status='cancelled' where id=o.id;
 insert into public.audit_logs(actor_id,action,entity,entity_id)
 values(actor,'ORDER_CANCEL_'||upper(who)||':'||o.market,'orders',o.id::text);
 return private.order_cancellation_json(o.id);
end $$;

-- The order's owner and the market's operations staff can read cancellation state.
create function private.order_cancellation(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare o public.orders; begin
 select * into o from public.orders where id=p_order;
 if not found or (o.user_id is distinct from private.app_user_id() and not private.has_role(o.market,array['admin','operations'])) then
  raise exception 'Order access denied' using errcode='42501';
 end if;
 return private.order_cancellation_json(o.id);
end $$;

create function public.cancel_order(p_order uuid,p_reason text default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.cancel_order(p_order,p_reason); $$;
create function public.order_cancellation(p_order uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.order_cancellation(p_order); $$;

revoke all on function private.order_cancellation_json(uuid),
 private.cancel_order(uuid,text),public.cancel_order(uuid,text),
 private.order_cancellation(uuid),public.order_cancellation(uuid)
 from public,anon,authenticated,service_role;
grant execute on function
 private.cancel_order(uuid,text),public.cancel_order(uuid,text),
 private.order_cancellation(uuid),public.order_cancellation(uuid)
 to authenticated;
