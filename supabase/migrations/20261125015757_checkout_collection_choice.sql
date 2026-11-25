-- Authoritative checkout collection choice. This supports only explicitly
-- approved centres with no additional collection fee; paid delivery quotations
-- and tax remain separate requirements. No centre data is invented/seeded.
create table public.service_centres (
 id uuid primary key default gen_random_uuid(),market text not null references public.markets(code),
 name text not null check(length(btrim(name))between 3 and 120),
 line1 text not null check(length(btrim(line1))between 5 and 200),city text not null check(length(btrim(city))between 2 and 100),
 postal_code text not null check(length(btrim(postal_code))between 3 and 15),
 instructions text not null check(length(btrim(instructions))between 10 and 2000),
 active boolean not null default false,revision integer not null default 1,
 no_collection_fee_approved boolean not null check(no_collection_fee_approved),
 approval_reference text not null check(length(btrim(approval_reference))between 3 and 120),
 approved_by uuid not null references public.app_users(id),updated_at timestamptz not null default clock_timestamp()
);
create index service_centres_market_idx on public.service_centres(market);
create index service_centres_approver_idx on public.service_centres(approved_by);
alter table public.service_centres enable row level security;
revoke all on public.service_centres from public,anon,authenticated,service_role;
grant select(id,market,name,line1,city,postal_code,instructions,active,revision,updated_at)on public.service_centres to anon,authenticated;
create policy service_centres_read on public.service_centres for select to anon,authenticated using(active or private.has_role(market,array['admin','compliance']));
alter table public.orders add column checkout_fulfilment jsonb,add column checkout_fulfilment_request_hash text,add column checkout_fulfilment_quote_hash text;
create function private.save_service_centre(p_id uuid,p_revision integer,p_market text,p_details jsonb,p_active boolean,p_reference text)returns uuid
language plpgsql security definer set search_path='' as $$
declare s public.service_centres;actor uuid:=private.app_user_id();begin
 if not private.has_role(p_market,array['admin','compliance'])then raise exception 'Centre approval denied' using errcode='42501';end if;
 if p_revision is null or p_details is null or jsonb_typeof(p_details)<>'object'or p_active is null or p_details->'noFeeApproved' is distinct from 'true'::jsonb then raise exception 'Approve collection rules and no additional collection fee'using errcode='22023';end if;
 if p_id is not null then
  select * into s from public.service_centres where id=p_id for update;
  if not found or s.market<>p_market then raise exception 'Centre access denied'using errcode='42501';end if;
  if s.revision<>p_revision then raise exception 'Centre changed; reload'using errcode='40001';end if;
 else
  if p_revision<>0 then raise exception 'Invalid revision'using errcode='22023';end if;
 end if;
 if p_id is null then
  insert into public.service_centres(market,name,line1,city,postal_code,instructions,active,no_collection_fee_approved,approval_reference,approved_by)
  values(p_market,btrim(p_details->>'name'),btrim(p_details->>'line1'),btrim(p_details->>'city'),btrim(p_details->>'postalCode'),btrim(p_details->>'instructions'),p_active,true,btrim(p_reference),actor)returning * into s;
 else
  update public.service_centres set name=btrim(p_details->>'name'),line1=btrim(p_details->>'line1'),city=btrim(p_details->>'city'),postal_code=btrim(p_details->>'postalCode'),instructions=btrim(p_details->>'instructions'),
   active=p_active,approval_reference=btrim(p_reference),approved_by=actor,revision=revision+1,updated_at=clock_timestamp()where id=p_id returning * into s;
 end if;
 insert into public.audit_logs(actor_id,action,entity,entity_id)values(actor,'SERVICE_CENTRE_APPROVED','service_centres',s.id::text);return s.id;
end $$;
create function private.resolve_checkout_fulfilment(m text,selection jsonb)returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.service_centres;begin
 if selection is null or jsonb_typeof(selection)<>'object'then raise exception 'Choose fulfilment'using errcode='22023';end if;
 if selection='{"method":"delivery"}'::jsonb then return selection;end if;
 if selection->>'method'<>'collection'or not(selection?'centreId')or selection-array['method','centreId']<>'{}'::jsonb then raise exception 'Invalid fulfilment'using errcode='22023';end if;
 select * into s from public.service_centres where id=(selection->>'centreId')::uuid and market=m and active for share;
 if not found then raise exception 'Collection centre unavailable'using errcode='22023';end if;
 return jsonb_build_object('method','collection','centreId',s.id,'name',s.name,'line1',s.line1,'city',s.city,'postalCode',s.postal_code,'instructions',s.instructions,'revision',s.revision,'additionalFeeMinor',0);
end $$;
create function private.fulfilment_quote(q jsonb,f jsonb)returns jsonb language sql immutable set search_path='' as $$
 select q||jsonb_build_object('fulfilment',f,'quoteHash',encode(sha256(convert_to(jsonb_build_object('commerceHash',q->>'quoteHash','fulfilment',f)::text,'UTF8')),'hex'))
$$;
create function private.quote_fulfilment_checkout(m text,items jsonb,promotion_code text,selection jsonb)returns jsonb language plpgsql security definer set search_path='' as $$
declare f jsonb;begin
 if private.app_user_id()is null then raise exception 'Sign in required'using errcode='42501';end if;
 f:=private.resolve_checkout_fulfilment(m,selection);
 return private.fulfilment_quote(private.quote_commerce_checkout(m,items,promotion_code),f);
end $$;
create function private.create_fulfilment_order(m text,items jsonb,delivery jsonb,key uuid,terms text,promotion_code text,quote_hash text,membership_consent jsonb,selection jsonb)returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.app_user_id();o public.orders;f jsonb;q jsonb;digest text;address jsonb:=delivery;begin
 if actor is null then raise exception 'Sign in required'using errcode='42501';end if;
 if key is null then raise exception 'Retry key required'using errcode='22023';end if;
 digest:=encode(sha256(convert_to(jsonb_build_object('market',m,'items',(select jsonb_agg(item order by item->>'productId')from jsonb_array_elements(items)item),'delivery',delivery,'terms',terms,'promotion',nullif(upper(btrim(promotion_code)),''),'consent',membership_consent,'selection',selection)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(actor::text||key::text,0));
 select * into o from public.orders where user_id=actor and idempotency_key=key;
 if found then
  if o.checkout_fulfilment_request_hash is distinct from digest then raise exception 'Order retry must retain its original selection'using errcode='22023';end if;
  return o.id; -- Original frozen order survives centre/rule withdrawal.
 end if;
 f:=private.resolve_checkout_fulfilment(m,selection);
 -- Acquire the voucher creation lock before quoting, preserving the existing
 -- no-share-to-exclusive-upgrade rule under concurrent order creation.
 q:=private.plan_commerce_checkout(m,items,promotion_code,true)->'quote';
 if quote_hash is null or quote_hash is distinct from private.fulfilment_quote(q,f)->>'quoteHash'then raise exception 'Fulfilment or prices changed; review again'using errcode='40001';end if;
 if f->>'method'='collection'then
  address:=delivery||jsonb_build_object('line1',f->>'line1','city',f->>'city','postal_code',f->>'postalCode','country',m);
 end if;
 o.id:=private.create_membership_commerce_order(m,items,address,key,terms,promotion_code,q->>'quoteHash',membership_consent);
 update public.orders set checkout_fulfilment=f,checkout_fulfilment_request_hash=digest,checkout_fulfilment_quote_hash=quote_hash where id=o.id;
 return o.id;
end $$;
create function private.guard_checkout_fulfilment()returns trigger language plpgsql set search_path='' as $$begin
 if OLD.checkout_fulfilment is not null and(NEW.checkout_fulfilment is distinct from OLD.checkout_fulfilment or NEW.checkout_fulfilment_request_hash is distinct from OLD.checkout_fulfilment_request_hash or NEW.checkout_fulfilment_quote_hash is distinct from OLD.checkout_fulfilment_quote_hash)then raise exception 'Checkout fulfilment snapshot is immutable';end if;return NEW;
end $$;
create trigger checkout_fulfilment_immutable before update of checkout_fulfilment,checkout_fulfilment_request_hash,checkout_fulfilment_quote_hash on public.orders for each row execute function private.guard_checkout_fulfilment();
create function public.save_service_centre(p_id uuid,p_revision integer,p_market text,p_details jsonb,p_active boolean,p_reference text)returns uuid language sql security invoker set search_path='' as $$select private.save_service_centre(p_id,p_revision,p_market,p_details,p_active,p_reference)$$;
create function public.quote_fulfilment_checkout(m text,items jsonb,promotion_code text,selection jsonb)returns jsonb language sql security invoker set search_path='' as $$select private.quote_fulfilment_checkout(m,items,promotion_code,selection)$$;
create function public.create_fulfilment_order(m text,items jsonb,delivery jsonb,key uuid,terms text,promotion_code text,quote_hash text,membership_consent jsonb,selection jsonb)returns uuid language sql security invoker set search_path='' as $$select private.create_fulfilment_order(m,items,delivery,key,terms,promotion_code,quote_hash,membership_consent,selection)$$;
revoke all on function private.save_service_centre(uuid,integer,text,jsonb,boolean,text),public.save_service_centre(uuid,integer,text,jsonb,boolean,text),
 private.resolve_checkout_fulfilment(text,jsonb),private.fulfilment_quote(jsonb,jsonb),private.quote_fulfilment_checkout(text,jsonb,text,jsonb),public.quote_fulfilment_checkout(text,jsonb,text,jsonb),
 private.create_fulfilment_order(text,jsonb,jsonb,uuid,text,text,text,jsonb,jsonb),public.create_fulfilment_order(text,jsonb,jsonb,uuid,text,text,text,jsonb,jsonb),private.guard_checkout_fulfilment()from public,anon,authenticated,service_role;
grant execute on function private.save_service_centre(uuid,integer,text,jsonb,boolean,text),public.save_service_centre(uuid,integer,text,jsonb,boolean,text),
 private.quote_fulfilment_checkout(text,jsonb,text,jsonb),public.quote_fulfilment_checkout(text,jsonb,text,jsonb),
 private.create_fulfilment_order(text,jsonb,jsonb,uuid,text,text,text,jsonb,jsonb),public.create_fulfilment_order(text,jsonb,jsonb,uuid,text,text,text,jsonb,jsonb)to authenticated;

-- Staff cannot accidentally dispatch a collection order as a courier parcel
-- (or change a delivery order to collection without the customer's choice).
alter function private.advance_order_fulfilment(uuid,text,text,text,text,text,text)rename to advance_order_fulfilment_before_collection;
create function private.advance_order_fulfilment(p_order uuid,p_status text,p_method text default null,p_carrier text default null,p_tracking_number text default null,p_tracking_url text default null,p_note text default null)returns jsonb
language plpgsql security definer set search_path='' as $$declare o public.orders;begin
 select * into o from public.orders where id=p_order for update;
 if not found or not private.has_role(o.market,array['admin','operations'])then raise exception 'Order fulfilment access denied'using errcode='42501';end if;
 if p_status='shipped'and o.checkout_fulfilment is not null and p_method is distinct from(case when o.checkout_fulfilment->>'method'='collection'then 'collection'else 'courier'end)then raise exception 'Fulfilment must match the customer checkout selection'using errcode='22023';end if;
 return private.advance_order_fulfilment_before_collection(p_order,p_status,p_method,p_carrier,p_tracking_number,p_tracking_url,p_note);
end $$;
revoke all on function private.advance_order_fulfilment(uuid,text,text,text,text,text,text),private.advance_order_fulfilment_before_collection(uuid,text,text,text,text,text,text)from public,anon,authenticated,service_role;
grant execute on function private.advance_order_fulfilment(uuid,text,text,text,text,text,text)to authenticated;
