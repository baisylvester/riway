-- Sales reporting v1 for market administrators and operations staff.
-- Counts only settled orders (paid and not cancelled, refunded or under late
-- payment review) in markets the caller is assigned to. Amounts stay in each
-- market's currency and are never summed across currencies. Dates are UTC
-- order-placement dates, inclusive.
create function private.staff_sales_report(p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare allowed text[]; result jsonb; begin
 select array_agg(code order by array_position(array['PH','SG','MY'],code)) into allowed
  from public.markets where private.has_role(code,array['admin','operations']);
 if coalesce(cardinality(allowed),0)=0 then raise exception 'Sales reporting access denied' using errcode='42501'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Choose a date range of up to 366 days'; end if;
 with settled as (
  select o.id,o.market,o.currency,o.sponsor_id,o.subtotal_minor,o.discount_minor,o.total_minor from public.orders o
  where o.market=any(allowed) and o.payment_status='paid' and o.status in ('paid','fulfilling','shipped','delivered')
   and o.created_at>=(p_from::timestamp at time zone 'UTC') and o.created_at<((p_to+1)::timestamp at time zone 'UTC')
 ), lines as (
  select i.product_id,i.product_name,i.package_offer_id,i.quantity,i.net_minor,s.market,s.currency
  from public.order_items i join settled s on s.id=i.order_id
 )
 select jsonb_build_object('from',p_from,'to',p_to,'markets',to_jsonb(allowed),
  'byMarket',coalesce((select jsonb_agg(jsonb_build_object('market',market,'currency',currency,'orders',orders,
    'subtotalMinor',subtotal,'discountMinor',discount,'totalMinor',total) order by array_position(allowed,market))
   from (select market,currency,count(*) orders,sum(subtotal_minor) subtotal,sum(discount_minor) discount,sum(total_minor) total
    from settled group by market,currency) m),'[]'::jsonb),
  'byProduct',coalesce((select jsonb_agg(jsonb_build_object('market',market,'currency',currency,'productId',product_id,
    'name',name,'units',units,'netMinor',net) order by array_position(allowed,market),net desc,product_id)
   from (select market,currency,product_id,max(product_name) as name,sum(quantity) units,sum(net_minor) net
    from lines group by market,currency,product_id order by sum(net_minor) desc limit 500) p),'[]'::jsonb),
  'byPackage',coalesce((select jsonb_agg(jsonb_build_object('market',market,'currency',currency,'packageOfferId',package_offer_id,
    'name',name,'units',units,'netMinor',net) order by array_position(allowed,market),net desc,package_offer_id)
   from (select l.market,l.currency,l.package_offer_id,max(c.name) as name,sum(l.quantity) units,sum(l.net_minor) net
    from lines l join private.commerce_offers c on c.id=l.package_offer_id
    group by l.market,l.currency,l.package_offer_id order by sum(l.net_minor) desc limit 500) k),'[]'::jsonb),
  'byDistributor',coalesce((select jsonb_agg(jsonb_build_object('market',market,'currency',currency,'distributorId',sponsor_id,
    'code',code,'name',name,'orders',orders,'totalMinor',total) order by array_position(allowed,market),total desc,sponsor_id)
   from (select s.market,s.currency,s.sponsor_id,max(d.code) as code,max(d.display_name) as name,count(*) orders,sum(s.total_minor) total
    from settled s left join public.distributor_profiles d on d.user_id=s.sponsor_id
    group by s.market,s.currency,s.sponsor_id order by sum(s.total_minor) desc limit 500) r),'[]'::jsonb))
 into result;
 return result;
end $$;
create function public.staff_sales_report(p_from date,p_to date) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.staff_sales_report(p_from,p_to); $$;

revoke all on function private.staff_sales_report(date,date),public.staff_sales_report(date,date) from public,anon,authenticated,service_role;
grant execute on function private.staff_sales_report(date,date),public.staff_sales_report(date,date) to authenticated;
