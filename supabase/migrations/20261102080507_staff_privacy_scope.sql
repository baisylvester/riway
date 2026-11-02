-- Editorial roles do not need customer orders, support details or member identifiers.
drop policy orders_read on public.orders;
create policy orders_read on public.orders for select to authenticated using(user_id=(select auth.uid()) or private.has_role(market,array['admin','operations']));
drop policy support_read on public.support_tickets;
create policy support_read on public.support_tickets for select to authenticated using(user_id=(select auth.uid()) or private.has_role(market,array['admin','operations']));
drop policy distributor_own on public.distributor_profiles;
create policy distributor_own on public.distributor_profiles for select to authenticated using(user_id=(select auth.uid()) or private.has_role(market,array['admin','operations']));
