create or replace function private.checkout(m text,items jsonb,delivery jsonb,key uuid,terms text) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); oid uuid; existing public.orders; v public.markets; i record; offer public.product_offers; price integer; total bigint:=0; hash text; sponsor uuid; is_member boolean:=false;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if jsonb_typeof(items)<>'array' or jsonb_array_length(items) not between 1 and 30 or terms<>'2026-11-draft' or delivery->>'country'<>m then raise exception 'Invalid checkout'; end if;
 hash:=encode(sha256(convert_to(m||items::text||delivery::text||terms,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(uid::text||key::text,0));
 select * into existing from public.orders where user_id=uid and idempotency_key=key;
 if found then if existing.request_hash<>hash then raise exception 'Idempotency key reused with different data'; end if; return existing.id; end if;
 select * into v from public.markets where code=m for share;
 if not found or not v.online_sales_approved or v.policy_reference is null then raise exception 'Online sales not approved'; end if;
 if not v.payments_ready then raise exception 'Payment integration unavailable'; end if;
 if (select count(*) from jsonb_to_recordset(items) as x("productId" uuid,quantity integer))<>(select count(distinct x."productId") from jsonb_to_recordset(items) as x("productId" uuid,quantity integer)) then raise exception 'Duplicate products'; end if;
 select status='active' into is_member from public.memberships where user_id=uid for share;
 for i in select * from jsonb_to_recordset(items) as x("productId" uuid,quantity integer) order by "productId" loop
 select o.* into offer from public.product_offers o join public.products p on p.id=o.product_id where o.product_id=i."productId" and o.market=m and p.status='published' for share of o,p;
 if not found or not offer.regulatory_approved or offer.approval_reference is null or offer.currency<>v.currency or i.quantity is null or i.quantity not between 1 and offer.max_quantity then raise exception 'Product unavailable in selected market'; end if;
 price:=offer.retail_minor;
 if is_member then price:=coalesce(offer.member_minor,price); end if;
 if price is null then raise exception 'Approved pricing unavailable'; end if;
 update public.inventory set reserved=reserved+i.quantity where product_id=i."productId" and market=m and on_hand-reserved>=i.quantity;
 if not found then raise exception 'Insufficient stock'; end if;
 total:=total+price::bigint*i.quantity;
 end loop;
 select distributor_id into sponsor from public.sponsor_attributions where user_id=uid;
 -- No unsigned referral values or invented sponsor/commission rules.
 insert into public.orders(user_id,market,currency,total_minor,address,sponsor_id,idempotency_key,request_hash,terms_version)
 values(uid,m,v.currency,total,delivery,sponsor,key,hash,terms) returning id into oid;
 for i in select * from jsonb_to_recordset(items) as x("productId" uuid,quantity integer) loop
 select * into offer from public.product_offers where product_id=i."productId" and market=m;
 price:=offer.retail_minor;
 if is_member then price:=coalesce(offer.member_minor,price); end if;
 insert into public.order_items(order_id,product_id,product_name,quantity,unit_minor) select oid,id,name,i.quantity,price from public.products where id=i."productId";
 insert into public.inventory_reservations(order_id,product_id,market,quantity) values(oid,i."productId",m,i.quantity);
 end loop;
 return oid;
end $$;

