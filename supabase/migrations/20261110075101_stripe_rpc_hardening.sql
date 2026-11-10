-- Keep privileged reads in the private schema. Public RPC wrappers preserve the
-- same owner/market/MFA checks without exposing SECURITY DEFINER entry points.
alter function public.stripe_checkout_status(uuid) set schema private;
alter function public.staff_stripe_payments() set schema private;
create function public.stripe_checkout_status(p_order uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select private.stripe_checkout_status(p_order);
$$;
create function public.staff_stripe_payments() returns jsonb
language sql stable security invoker set search_path='' as $$
 select private.staff_stripe_payments();
$$;
revoke all on function private.stripe_checkout_status(uuid),private.staff_stripe_payments(),
 public.stripe_checkout_status(uuid),public.staff_stripe_payments() from public,anon,authenticated,service_role;
grant execute on function private.stripe_checkout_status(uuid),private.staff_stripe_payments(),
 public.stripe_checkout_status(uuid),public.staff_stripe_payments() to authenticated;

-- Explicit internal-only policies document denial if grants ever change.
create policy stripe_checkouts_internal_only on private.stripe_checkouts for all to anon,authenticated using(false) with check(false);
create policy stripe_events_internal_only on private.stripe_events for all to anon,authenticated using(false) with check(false);
