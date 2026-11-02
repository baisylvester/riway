-- Remove redundant permissive SELECT paths; writes stay explicitly scoped.
drop policy products_write on public.products;
create policy products_insert on public.products for insert to authenticated with check(private.has_role(null,array['admin','editor','compliance']));
create policy products_update on public.products for update to authenticated using(private.has_role(null,array['admin','editor','compliance'])) with check(private.has_role(null,array['admin','editor','compliance']));
drop policy offers_write on public.product_offers;
create policy offers_insert on public.product_offers for insert to authenticated with check(private.has_role(market,array['admin','compliance']));
create policy offers_update on public.product_offers for update to authenticated using(private.has_role(market,array['admin','compliance'])) with check(private.has_role(market,array['admin','compliance']));
drop policy content_write on public.content_entries;
create policy content_insert on public.content_entries for insert to authenticated with check(private.has_role(market,array['admin','editor','compliance']));
create policy content_update on public.content_entries for update to authenticated using(private.has_role(market,array['admin','editor','compliance'])) with check(private.has_role(market,array['admin','editor','compliance']));
create index addresses_country_idx on public.addresses(country);
-- Reservations are internal-only; explicit deny is intentional.
create policy reservations_deny on public.inventory_reservations for all to anon,authenticated using(false) with check(false);

-- Enforce market/currency consistency, including direct Data API writes.
alter table public.product_offers add constraint offer_currency_matches_market check((market='PH' and currency='PHP') or (market='SG' and currency='SGD') or (market='MY' and currency='MYR'));
alter table public.addresses add constraint address_lengths check(length(full_name) between 2 and 100 and length(phone) between 7 and 25 and length(line1) between 5 and 200 and length(city) between 2 and 100 and length(postal_code) between 3 and 15);

-- Cross-instance per-user limits apply even to direct authenticated Data API requests.
create table private.rate_limits(user_id uuid not null, scope text not null, window_start timestamptz not null, hits integer not null default 0, primary key(user_id,scope));
revoke all on private.rate_limits from public,anon,authenticated;
create function private.check_rate(scope text,max_hits integer,seconds integer) returns void language plpgsql security definer set search_path='' as $$
declare h integer; begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 insert into private.rate_limits(user_id,scope,window_start,hits) values(auth.uid(),scope,now(),1)
 on conflict(user_id,scope) do update set
 hits=case when private.rate_limits.window_start<now()-make_interval(secs=>seconds) then 1 else private.rate_limits.hits+1 end,
 window_start=case when private.rate_limits.window_start<now()-make_interval(secs=>seconds) then now() else private.rate_limits.window_start end returning hits into h;
 if h>max_hits then raise exception 'Too many requests. Please try later.'; end if;
end $$;
revoke all on function private.check_rate(text,integer,integer) from public;
create function private.limit_customer_write() returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.check_rate(TG_TABLE_NAME,case when TG_TABLE_NAME='support_tickets' then 5 else 30 end,60);return NEW;end $$;
revoke all on function private.limit_customer_write() from public;
create trigger support_rate before insert on public.support_tickets for each row execute function private.limit_customer_write();
create trigger address_rate before insert or update on public.addresses for each row execute function private.limit_customer_write();
create trigger cart_rate before insert or update on public.carts for each row execute function private.limit_customer_write();

-- Final order guard covers every caller of the transactional checkout RPC.
create function private.guard_order() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or NEW.user_id<>auth.uid() then raise exception 'Order owner mismatch'; end if;
 if NEW.sponsor_id is null or not exists(select 1 from public.distributor_profiles d join public.sponsor_attributions a on a.distributor_id=d.user_id where a.user_id=auth.uid() and d.user_id=NEW.sponsor_id and d.active and d.verified_at is not null and d.market=NEW.market) then raise exception 'Verified sponsor attribution required'; end if;
 if jsonb_typeof(NEW.address)<>'object' or NEW.address->>'country' is distinct from NEW.market
 or coalesce(length(NEW.address->>'full_name'),0) not between 2 and 100
 or coalesce(length(NEW.address->>'phone'),0) not between 7 and 25
 or coalesce(length(NEW.address->>'line1'),0) not between 5 and 200
 or coalesce(length(NEW.address->>'city'),0) not between 2 and 100
 or coalesce(length(NEW.address->>'postal_code'),0) not between 3 and 15 then raise exception 'Invalid delivery address'; end if;
 perform private.check_rate('checkout',10,60);
 return NEW;
end $$;
revoke all on function private.guard_order() from public;
create trigger order_guard before insert on public.orders for each row execute function private.guard_order();

create function private.lookup_distributor(c text) returns table(code text,display_name text,market text) language sql stable security definer set search_path='' as $$
 select d.code,d.display_name,d.market from public.distributor_profiles d where d.code=c and d.active and d.verified_at is not null;
$$;
revoke all on function private.lookup_distributor(text) from public;
grant execute on function private.lookup_distributor(text) to anon,authenticated;
create function public.lookup_distributor(c text) returns table(code text,display_name text,market text) language sql security invoker set search_path='' as $$ select * from private.lookup_distributor(c) $$;
revoke all on function public.lookup_distributor(text) from public;
grant execute on function public.lookup_distributor(text) to anon,authenticated;

-- First verified attribution is immutable to customers; conflicting links never replace it.
create function private.claim_referral(c text) returns text language plpgsql security definer set search_path='' as $$
declare did uuid; current_id uuid; begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 perform private.check_rate('referral',10,60);
 select user_id into did from public.distributor_profiles where code=c and active and verified_at is not null;
 if did is null or did=auth.uid() then raise exception 'Invalid referring distributor'; end if;
 insert into public.sponsor_attributions(user_id,distributor_id) values(auth.uid(),did) on conflict(user_id) do nothing;
 select distributor_id into current_id from public.sponsor_attributions where user_id=auth.uid();
 if current_id<>did then return 'Your existing verified sponsor remains linked.'; end if;
 return 'Your verified referring distributor has been linked.';
end $$;
revoke all on function private.claim_referral(text) from public;
grant execute on function private.claim_referral(text) to authenticated;
create function public.claim_referral(c text) returns text language sql security invoker set search_path='' as $$ select private.claim_referral(c) $$;
revoke all on function public.claim_referral(text) from public;
grant execute on function public.claim_referral(text) to authenticated;

grant update(status) on public.support_tickets to authenticated;
create policy support_update on public.support_tickets for update to authenticated using(private.has_role(market,array['admin','operations'])) with check(private.has_role(market,array['admin','operations']));
create trigger support_audit after update on public.support_tickets for each row execute function private.audit_change();

-- Expiry maintenance is not exposed to browser roles; schedule after deployment.
create function public.release_expired_reservations() returns integer language plpgsql security invoker set search_path='' as $$
declare r record; n integer:=0; begin
 for r in select v.* from public.inventory_reservations v join public.orders o on o.id=v.order_id where v.expires_at<now() and o.status='awaiting_payment' and o.payment_status='pending' order by v.product_id for update of v,o skip locked loop
 update public.inventory set reserved=reserved-r.quantity where product_id=r.product_id and market=r.market;
 update public.orders set status='cancelled' where id=r.order_id;
 delete from public.inventory_reservations where order_id=r.order_id and product_id=r.product_id;
 n:=n+1;
 end loop;return n;
end $$;
revoke all on function public.release_expired_reservations() from public,anon,authenticated;
grant execute on function public.release_expired_reservations() to service_role;
