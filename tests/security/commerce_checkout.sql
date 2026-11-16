-- Synthetic acceptance only. All approvals, prices, stock and orders roll back.
begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
set local timezone='UTC';
select set_config('request.jwt.claims','{}',true);

do $$
declare
 a uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); e uuid:=gen_random_uuid();
 u uuid:=gen_random_uuid(); u2 uuid:=gen_random_uuid(); sponsor uuid:=gen_random_uuid();
 pa uuid:=gen_random_uuid(); pb uuid:=gen_random_uuid(); package_sku uuid:=gen_random_uuid();
 suffix text:=upper(substr(gen_random_uuid()::text,1,8));
begin
 insert into auth.users(id,email) values
 (a,'commerce-order-qa-'||a||'@example.invalid'),(c,'commerce-order-qa-'||c||'@example.invalid'),
 (e,'commerce-order-qa-'||e||'@example.invalid'),(u,'commerce-order-qa-'||u||'@example.invalid'),
 (u2,'commerce-order-qa-'||u2||'@example.invalid'),(sponsor,'commerce-order-qa-'||sponsor||'@example.invalid');
 insert into public.staff_roles(user_id,market,role) values(a,'PH','admin'),(c,'SG','compliance'),(e,'PH','editor');
 insert into public.distributor_profiles(user_id,external_member_id,code,display_name,active,verified_at,market)
 values(sponsor,sponsor::text,'QA-'||suffix,'Temporary commerce sponsor',true,now(),'PH');
 insert into public.sponsor_attributions(user_id,distributor_id) values(u,sponsor),(u2,sponsor);
 insert into public.products(id,slug,name,category,status) values
 (pa,'commerce-order-qa-'||pa,'Physical fixture A','Nutrition','published'),
 (pb,'commerce-order-qa-'||pb,'Physical fixture B','Skincare','published'),
 (package_sku,'commerce-order-qa-'||package_sku,'Package fixture','Packages','published');
 insert into public.product_offers(product_id,market,currency,retail_minor,regulatory_approved,approval_reference,max_quantity)
 values(pa,'PH','PHP',100,true,'ROLLBACK-QA-PRODUCT',24),
 (pb,'PH','PHP',101,true,'ROLLBACK-QA-PRODUCT',24),
 (package_sku,'PH','PHP',500,true,'ROLLBACK-QA-PRODUCT',6);
 insert into public.inventory(product_id,market,on_hand) values(pa,'PH',100),(pb,'PH',100);
 -- There is deliberately no inventory row for the commercial package SKU.
 update public.markets set online_sales_approved=true,payments_ready=true,policy_reference='ROLLBACK-QA-MARKET' where code='PH';
 perform set_config('commerce_order_qa.admin',a::text,true);
 perform set_config('commerce_order_qa.compliance',c::text,true);
 perform set_config('commerce_order_qa.editor',e::text,true);
 perform set_config('commerce_order_qa.customer',u::text,true);
 perform set_config('commerce_order_qa.customer2',u2::text,true);
 perform set_config('commerce_order_qa.a',pa::text,true);
 perform set_config('commerce_order_qa.b',pb::text,true);
 perform set_config('commerce_order_qa.package',package_sku::text,true);
 perform set_config('commerce_order_qa.fixed_code','QA-FIXED-'||suffix,true);
 perform set_config('commerce_order_qa.cap_code','QA-CAP-'||suffix,true);
 perform set_config('commerce_order_qa.percent_code','QA-PERCENT-'||suffix,true);
 perform set_config('commerce_order_qa.zero_code','QA-ZERO-'||suffix,true);
 perform set_config('commerce_order_qa.delivery','{"full_name":"Temporary QA customer","phone":"0000000000","line1":"Temporary QA address","city":"Manila","postal_code":"1000","country":"PH"}',true);
 perform set_config('commerce_order_qa.package_definition',jsonb_build_object('components',jsonb_build_array(jsonb_build_object('productId',pa,'quantity',2),jsonb_build_object('productId',pb,'quantity',1)),'retailMinor',250,'memberMinor',200)::text,true);
 perform set_config('commerce_order_qa.cart',jsonb_build_array(jsonb_build_object('productId',package_sku,'quantity',1),jsonb_build_object('productId',pa,'quantity',3))::text,true);
 perform set_config('commerce_order_qa.single',jsonb_build_array(jsonb_build_object('productId',pa,'quantity',1))::text,true);
 perform set_config('commerce_order_qa.terms',(select checkout_terms_version from public.markets where code='PH'),true);
 if has_function_privilege('anon','public.approve_commerce_draft(uuid,integer,uuid,text)','execute')
 or has_function_privilege('anon','public.withdraw_commerce_offer(uuid,text)','execute')
 or has_function_privilege('anon','public.staff_commerce_offers(text,integer)','execute')
 or has_function_privilege('anon','public.quote_commerce_checkout(text,jsonb,text)','execute')
 or has_function_privilege('anon','public.create_commerce_order(text,jsonb,jsonb,uuid,text,text,text)','execute') then raise exception 'FAIL: anonymous commerce execution grant'; end if;
 if has_table_privilege('authenticated','private.commerce_offers','select,insert,update,delete')
 or has_table_privilege('authenticated','private.order_inventory_items','select,insert,update,delete')
 or has_table_privilege('authenticated','private.commerce_redemptions','select,insert,update,delete') then raise exception 'FAIL: browser access to immutable commerce state'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('approve_commerce_draft','withdraw_commerce_offer','staff_commerce_offers','quote_commerce_checkout','create_commerce_order') and p.prosecdef) then raise exception 'FAIL: exposed commerce definer'; end if;
end $$;

set local role authenticated;
do $$
declare package_draft jsonb; unreviewed jsonb; promotion_draft jsonb; approved jsonb; definition jsonb; who text; n integer;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('commerce_order_qa.admin'),'role','authenticated','aal','aal2')::text,true);
 package_draft:=public.save_commerce_draft(null,'package','PH','Temporary package','review',current_setting('commerce_order_qa.package_definition')::jsonb,0);
 perform set_config('commerce_order_qa.package_draft',package_draft->>'id',true);
 unreviewed:=public.save_commerce_draft(null,'package','PH','Unreviewed package','draft',current_setting('commerce_order_qa.package_definition')::jsonb,0);
 begin
  perform public.approve_commerce_draft((unreviewed->>'id')::uuid,1,current_setting('commerce_order_qa.package')::uuid,'ROLLBACK-QA-ONLY');
  raise exception 'FAIL: draft status was approved';
 exception when raise_exception then if SQLERRM like 'FAIL:%' then raise; end if; end;
 package_draft:=public.save_commerce_draft((package_draft->>'id')::uuid,'package','PH','Temporary package','review',current_setting('commerce_order_qa.package_definition')::jsonb,1);
 begin
  perform public.approve_commerce_draft((package_draft->>'id')::uuid,1,current_setting('commerce_order_qa.package')::uuid,'ROLLBACK-QA-ONLY');
  raise exception 'FAIL: stale draft revision approved';
 exception when serialization_failure or raise_exception then if SQLERRM like 'FAIL:%' then raise; end if; end;
 foreach who in array array['customer','editor','compliance'] loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('commerce_order_qa.'||who),'role','authenticated','aal','aal2')::text,true);
  begin
   perform public.approve_commerce_draft((package_draft->>'id')::uuid,2,current_setting('commerce_order_qa.package')::uuid,'ROLLBACK-QA-ONLY');
   raise exception 'FAIL: unauthorized approval';
  exception when insufficient_privilege then null; end;
 end loop;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('commerce_order_qa.admin'),'role','authenticated','aal','aal1')::text,true);
 begin
  perform public.approve_commerce_draft((package_draft->>'id')::uuid,2,current_setting('commerce_order_qa.package')::uuid,'ROLLBACK-QA-ONLY');
  raise exception 'FAIL: unverified approval';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('commerce_order_qa.admin'),'role','authenticated','aal','aal2')::text,true);
 begin
  perform public.approve_commerce_draft((package_draft->>'id')::uuid,2,current_setting('commerce_order_qa.a')::uuid,'ROLLBACK-QA-ONLY');
  raise exception 'FAIL: package mapped to physical SKU';
 exception when raise_exception then if SQLERRM like 'FAIL:%' then raise; end if; end;
 begin
  perform public.approve_commerce_draft((package_draft->>'id')::uuid,2,current_setting('commerce_order_qa.package')::uuid,'bad');
  raise exception 'FAIL: insufficient approval reference';
 exception when raise_exception then if SQLERRM like 'FAIL:%' then raise; end if; end;
 approved:=public.approve_commerce_draft((package_draft->>'id')::uuid,2,current_setting('commerce_order_qa.package')::uuid,'ROLLBACK-QA-ONLY');
 perform set_config('commerce_order_qa.package_offer',approved->>'id',true);
 if approved->>'draftRevision' is distinct from '2' or approved->>'productId' is distinct from current_setting('commerce_order_qa.package') then raise exception 'FAIL: package approval snapshot'; end if;
 if (select retail_minor from public.product_offers where product_id=current_setting('commerce_order_qa.package')::uuid and market='PH')<>250
 or not (select regulatory_approved from public.product_offers where product_id=current_setting('commerce_order_qa.package')::uuid and market='PH')
 or (select approval_reference from public.product_offers where product_id=current_setting('commerce_order_qa.package')::uuid and market='PH')<>'ROLLBACK-QA-PRODUCT' then raise exception 'FAIL: price copy changed independent regulatory flags'; end if;
 begin
  perform public.approve_commerce_draft((package_draft->>'id')::uuid,2,current_setting('commerce_order_qa.package')::uuid,'ROLLBACK-QA-SECOND');
  raise exception 'FAIL: active package replacement without withdrawal';
 exception when unique_violation or raise_exception then if SQLERRM like 'FAIL:%' then raise; end if; end;
 -- Editing the source draft cannot silently change the approved snapshot.
 definition:=jsonb_build_object('components',jsonb_build_array(jsonb_build_object('productId',current_setting('commerce_order_qa.a'),'quantity',1)),'retailMinor',999,'memberMinor',null);
 perform public.save_commerce_draft((package_draft->>'id')::uuid,'package','PH','Changed source draft','review',definition,2);
 for n in 1..4 loop
  definition:=jsonb_build_object(
   'productIds',case when n=1 then jsonb_build_array(current_setting('commerce_order_qa.package'),current_setting('commerce_order_qa.a')) else jsonb_build_array(current_setting('commerce_order_qa.a')) end,
   'discountType',case when n in (3,4) then 'percent' else 'fixed' end,
   'discountValue',case n when 1 then 1 when 2 then 17 when 3 then 2500 else 10000 end,
   'minimumSubtotalMinor',0,'maximumDiscountMinor',case when n=3 then 10 else null end,
   'voucherCode',current_setting('commerce_order_qa.'||case n when 1 then 'fixed_code' when 2 then 'cap_code' when 3 then 'percent_code' else 'zero_code' end),
   'startsAt',to_char(now()-interval '1 hour','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
   'endsAt',to_char(now()+interval '1 day','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
   'audience','all','usageLimit',case when n in (1,2) then 1 else null end);
  promotion_draft:=public.save_commerce_draft(null,'promotion','PH','Temporary voucher '||n,'review',definition,0);
  approved:=public.approve_commerce_draft((promotion_draft->>'id')::uuid,1,null,'ROLLBACK-QA-ONLY');
  if n=1 then perform set_config('commerce_order_qa.fixed_offer',approved->>'id',true); end if;
 end loop;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('commerce_order_qa.compliance'),'role','authenticated','aal','aal2')::text,true);
 approved:=public.staff_commerce_offers('package',1);
 if approved->'markets'<>'["SG"]'::jsonb or exists(select 1 from jsonb_array_elements(approved->'offers') x where x->>'market'<>'SG') then raise exception 'FAIL: cross-market offer list'; end if;
end $$;

do $$ declare q jsonb; o uuid; key uuid:=gen_random_uuid(); begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('commerce_order_qa.customer'),'role','authenticated','aal','aal1')::text,true);
 q:=public.quote_commerce_checkout('PH',current_setting('commerce_order_qa.cart')::jsonb,current_setting('commerce_order_qa.fixed_code'));
 if (q->>'subtotalMinor')::bigint is distinct from 550::bigint or (q->>'discountMinor')::bigint is distinct from 1::bigint or (q->>'totalMinor')::bigint is distinct from 549::bigint or coalesce(q->>'quoteHash','') !~ '^[0-9a-f]{64}$' then raise exception 'FAIL: exact voucher total/hash'; end if;
 if not exists(select 1 from jsonb_array_elements(q->'items') i where i->>'productId'=current_setting('commerce_order_qa.a') and (i->>'quantity')::int=3 and (i->>'netMinor')::bigint=299 and (i->>'discountMinor')::bigint=1) then raise exception 'FAIL: indivisible discount allocation'; end if;
 if not exists(select 1 from jsonb_array_elements(q->'items') i where i->>'productId'=current_setting('commerce_order_qa.package') and (i->>'unitMinor')::bigint=250 and i->>'packageOfferId'=current_setting('commerce_order_qa.package_offer')) then raise exception 'FAIL: mutable draft changed package'; end if;
 perform set_config('commerce_order_qa.quote',q::text,true);
 perform set_config('commerce_order_qa.plain_quote',public.quote_commerce_checkout('PH',current_setting('commerce_order_qa.single')::jsonb,null)::text,true);
 perform set_config('commerce_order_qa.key',key::text,true);
 o:=public.create_commerce_order('PH',current_setting('commerce_order_qa.cart')::jsonb,current_setting('commerce_order_qa.delivery')::jsonb,key,current_setting('commerce_order_qa.terms'),current_setting('commerce_order_qa.fixed_code'),q->>'quoteHash');
 perform set_config('commerce_order_qa.order',o::text,true);
 if public.create_commerce_order('PH',current_setting('commerce_order_qa.cart')::jsonb,current_setting('commerce_order_qa.delivery')::jsonb,key,current_setting('commerce_order_qa.terms'),current_setting('commerce_order_qa.fixed_code'),q->>'quoteHash')<>o then raise exception 'FAIL: order replay'; end if;
 begin perform 1 from private.order_inventory_items; raise exception 'FAIL: customer read physical manifest'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.order_inventory_items where order_id=current_setting('commerce_order_qa.order')::uuid)<>2
 or (select quantity from private.order_inventory_items where order_id=current_setting('commerce_order_qa.order')::uuid and product_id=current_setting('commerce_order_qa.a')::uuid) is distinct from 5
 or (select quantity from private.order_inventory_items where order_id=current_setting('commerce_order_qa.order')::uuid and product_id=current_setting('commerce_order_qa.b')::uuid) is distinct from 1 then raise exception 'FAIL: aggregated package and loose stock manifest'; end if;
 if (select reserved from public.inventory where product_id=current_setting('commerce_order_qa.a')::uuid and market='PH')<>5
 or (select reserved from public.inventory where product_id=current_setting('commerce_order_qa.b')::uuid and market='PH')<>1
 or exists(select 1 from public.inventory_reservations where order_id=current_setting('commerce_order_qa.order')::uuid and product_id=current_setting('commerce_order_qa.package')::uuid) then raise exception 'FAIL: component reservations'; end if;
 if (select sum(net_minor) from public.order_items where order_id=current_setting('commerce_order_qa.order')::uuid)<>549
 or (select sum(discount_minor) from public.order_items where order_id=current_setting('commerce_order_qa.order')::uuid)<>1 then raise exception 'FAIL: commercial net snapshot'; end if;
 update public.product_offers set retail_minor=102 where product_id=current_setting('commerce_order_qa.a')::uuid and market='PH';
end $$;
set local role authenticated;
do $$ declare q jsonb:=current_setting('commerce_order_qa.quote')::jsonb; begin
 -- Replay must precede repricing; a fresh request must reject the stale quote.
 if public.create_commerce_order('PH',current_setting('commerce_order_qa.cart')::jsonb,current_setting('commerce_order_qa.delivery')::jsonb,current_setting('commerce_order_qa.key')::uuid,current_setting('commerce_order_qa.terms'),current_setting('commerce_order_qa.fixed_code'),q->>'quoteHash')::text<>current_setting('commerce_order_qa.order') then raise exception 'FAIL: repriced idempotent replay'; end if;
 begin
  perform public.create_commerce_order('PH',current_setting('commerce_order_qa.single')::jsonb,current_setting('commerce_order_qa.delivery')::jsonb,gen_random_uuid(),current_setting('commerce_order_qa.terms'),null,current_setting('commerce_order_qa.plain_quote')::jsonb->>'quoteHash');
  raise exception 'FAIL: stale quote accepted';
 exception when serialization_failure or raise_exception then if SQLERRM like 'FAIL:%' then raise; end if; end;
end $$;
reset role;
update public.product_offers set retail_minor=100 where product_id=current_setting('commerce_order_qa.a')::uuid and market='PH';
set local role service_role;
do $$ declare payment jsonb; oid uuid:=current_setting('commerce_order_qa.order')::uuid; attempt uuid; begin
 payment:=public.prepare_stripe_checkout(oid,current_setting('commerce_order_qa.customer')::uuid,false,'https://example.invalid');
 attempt:=(payment->>'id')::uuid;
 if (payment->>'amount')::bigint is distinct from 549::bigint or (select sum((x->>'quantity')::bigint*(x->>'unitAmount')::bigint) from jsonb_array_elements(payment->'items') x) is distinct from 549::bigint then raise exception 'FAIL: Stripe exact net amount'; end if;
 if public.apply_stripe_checkout_event('evt_commerce_paid_'||oid,attempt,oid,'cs_test_commerce_paid',false,549,'php','complete','paid','pi_commercepaid')<>'paid' then raise exception 'FAIL: package payment'; end if;
 if public.apply_stripe_checkout_event('evt_commerce_paid_'||oid,attempt,oid,'cs_test_commerce_paid',false,549,'php','complete','paid','pi_commercepaid')<>'duplicate' then raise exception 'FAIL: duplicate package payment'; end if;
end $$;
reset role;
do $$ begin
 if (select on_hand from public.inventory where product_id=current_setting('commerce_order_qa.a')::uuid and market='PH')<>95
 or (select on_hand from public.inventory where product_id=current_setting('commerce_order_qa.b')::uuid and market='PH')<>99
 or exists(select 1 from public.inventory_reservations where order_id=current_setting('commerce_order_qa.order')::uuid) then raise exception 'FAIL: component consumption exactly once'; end if;
end $$;

set local role authenticated;
do $$ declare q jsonb; legacy uuid; legacy_package uuid; cap_order uuid; begin
 q:=public.quote_commerce_checkout('PH',current_setting('commerce_order_qa.single')::jsonb,current_setting('commerce_order_qa.percent_code'));
 if (q->>'discountMinor')::bigint is distinct from 10::bigint or (q->>'totalMinor')::bigint is distinct from 90::bigint then raise exception 'FAIL: percentage cap'; end if;
 begin
  perform public.create_commerce_order('PH',current_setting('commerce_order_qa.single')::jsonb,current_setting('commerce_order_qa.delivery')::jsonb,gen_random_uuid(),current_setting('commerce_order_qa.terms'),current_setting('commerce_order_qa.zero_code'),null);
  raise exception 'FAIL: unsupported zero total accepted';
 exception when raise_exception then if SQLERRM like 'FAIL:%' then raise; end if; end;
 legacy:=public.create_order('PH',current_setting('commerce_order_qa.single')::jsonb,current_setting('commerce_order_qa.delivery')::jsonb,gen_random_uuid(),current_setting('commerce_order_qa.terms'));
 perform set_config('commerce_order_qa.legacy',legacy::text,true);
 legacy_package:=public.create_order('PH',jsonb_build_array(jsonb_build_object('productId',current_setting('commerce_order_qa.package'),'quantity',1)),current_setting('commerce_order_qa.delivery')::jsonb,gen_random_uuid(),current_setting('commerce_order_qa.terms'));
 perform set_config('commerce_order_qa.legacy_package',legacy_package::text,true);
 cap_order:=public.create_commerce_order('PH',current_setting('commerce_order_qa.single')::jsonb,current_setting('commerce_order_qa.delivery')::jsonb,gen_random_uuid(),current_setting('commerce_order_qa.terms'),current_setting('commerce_order_qa.cap_code'),null);
 perform set_config('commerce_order_qa.cap_order',cap_order::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('commerce_order_qa.customer2'),'role','authenticated','aal','aal1')::text,true);
 begin
  perform public.create_commerce_order('PH',current_setting('commerce_order_qa.single')::jsonb,current_setting('commerce_order_qa.delivery')::jsonb,gen_random_uuid(),current_setting('commerce_order_qa.terms'),current_setting('commerce_order_qa.cap_code'),null);
  raise exception 'FAIL: reserved voucher capacity reused';
 exception when raise_exception then if SQLERRM like 'FAIL:%' then raise; end if; end;
end $$;
reset role;
do $$ begin
 if (select quantity from private.order_inventory_items where order_id=current_setting('commerce_order_qa.legacy_package')::uuid and product_id=current_setting('commerce_order_qa.a')::uuid) is distinct from 2
 or (select quantity from private.order_inventory_items where order_id=current_setting('commerce_order_qa.legacy_package')::uuid and product_id=current_setting('commerce_order_qa.b')::uuid) is distinct from 1 then raise exception 'FAIL: old order RPC bypassed package composition'; end if;
end $$;
-- The order committed but no provider attempt was created. Maintenance must
-- release both the physical hold and voucher capacity after its local expiry.
update public.inventory_reservations set expires_at=now()-interval '1 minute' where order_id in (current_setting('commerce_order_qa.legacy')::uuid,current_setting('commerce_order_qa.legacy_package')::uuid,current_setting('commerce_order_qa.cap_order')::uuid);
set local role service_role;
select public.release_expired_reservations();
reset role;
do $$ begin
 if (select status from public.orders where id=current_setting('commerce_order_qa.legacy')::uuid)<>'cancelled'
 or (select status from public.orders where id=current_setting('commerce_order_qa.legacy_package')::uuid)<>'cancelled'
 or (select status from public.orders where id=current_setting('commerce_order_qa.cap_order')::uuid)<>'cancelled'
 or (select state from private.commerce_redemptions where order_id=current_setting('commerce_order_qa.cap_order')::uuid) is distinct from 'released'
 or exists(select 1 from public.inventory_reservations where order_id in (current_setting('commerce_order_qa.legacy')::uuid,current_setting('commerce_order_qa.legacy_package')::uuid,current_setting('commerce_order_qa.cap_order')::uuid)) then raise exception 'FAIL: expiry stock release'; end if;
end $$;
set local role authenticated;
do $$ declare o uuid; begin
 o:=public.create_commerce_order('PH',current_setting('commerce_order_qa.single')::jsonb,current_setting('commerce_order_qa.delivery')::jsonb,gen_random_uuid(),current_setting('commerce_order_qa.terms'),current_setting('commerce_order_qa.cap_code'),null);
 perform set_config('commerce_order_qa.open_cap_order',o::text,true);
end $$;
reset role;
set local role service_role;
do $$ declare payment jsonb; oid uuid:=current_setting('commerce_order_qa.open_cap_order')::uuid; begin
 payment:=public.prepare_stripe_checkout(oid,current_setting('commerce_order_qa.customer2')::uuid,false,'https://example.invalid');
 perform public.bind_stripe_checkout((payment->>'id')::uuid,'cs_test_commerce_expiry','https://checkout.stripe.com/c/pay/test_fixture');
 update public.inventory_reservations set expires_at=now()-interval '1 minute' where order_id=oid;
 perform public.release_expired_reservations();
 if not exists(select 1 from public.inventory_reservations where order_id=oid)
 or (select status from public.orders where id=oid)<>'awaiting_payment' then raise exception 'FAIL: local expiry released open Stripe attempt'; end if;
 if public.apply_stripe_checkout_event('evt_commerce_expiry_'||oid,(payment->>'id')::uuid,oid,'cs_test_commerce_expiry',false,83,'php','expired','unpaid',null)<>'expired' then raise exception 'FAIL: voucher order expiry'; end if;
end $$;
reset role;
set local role authenticated;
do $$ declare o uuid; begin
 o:=public.create_commerce_order('PH',current_setting('commerce_order_qa.single')::jsonb,current_setting('commerce_order_qa.delivery')::jsonb,gen_random_uuid(),current_setting('commerce_order_qa.terms'),current_setting('commerce_order_qa.cap_code'),null);
 perform set_config('commerce_order_qa.reused_order',o::text,true);
end $$;
reset role;
set local role service_role;
do $$ declare payment jsonb; oid uuid:=current_setting('commerce_order_qa.reused_order')::uuid; begin
 payment:=public.prepare_stripe_checkout(oid,current_setting('commerce_order_qa.customer2')::uuid,false,'https://example.invalid');
 if public.apply_stripe_checkout_event('evt_commerce_reused_'||oid,(payment->>'id')::uuid,oid,'cs_test_commerce_reused',false,83,'php','complete','paid','pi_commercereused')<>'paid' then raise exception 'FAIL: released capacity cannot be reused'; end if;
end $$;
reset role;
set local role authenticated;
do $$ begin
 begin
  perform public.create_commerce_order('PH',current_setting('commerce_order_qa.single')::jsonb,current_setting('commerce_order_qa.delivery')::jsonb,gen_random_uuid(),current_setting('commerce_order_qa.terms'),current_setting('commerce_order_qa.cap_code'),null);
  raise exception 'FAIL: consumed voucher capacity reused';
 exception when raise_exception then if SQLERRM like 'FAIL:%' then raise; end if; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('commerce_order_qa.admin'),'role','authenticated','aal','aal2')::text,true);
 perform public.withdraw_commerce_offer(current_setting('commerce_order_qa.package_offer')::uuid,'ROLLBACK-QA-WITHDRAW');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('commerce_order_qa.customer'),'role','authenticated','aal','aal1')::text,true);
 begin
  perform public.quote_commerce_checkout('PH',jsonb_build_array(jsonb_build_object('productId',current_setting('commerce_order_qa.package'),'quantity',1)),null);
  raise exception 'FAIL: withdrawn package remained sellable';
 exception when raise_exception then if SQLERRM like 'FAIL:%' then raise; end if; end;
end $$;
reset role;
do $$ begin
 if (select on_hand from public.inventory where product_id=current_setting('commerce_order_qa.a')::uuid and market='PH')<>94
 or (select on_hand from public.inventory where product_id=current_setting('commerce_order_qa.b')::uuid and market='PH')<>99
 or exists(select 1 from public.inventory_reservations where order_id in (current_setting('commerce_order_qa.order')::uuid,current_setting('commerce_order_qa.legacy')::uuid,current_setting('commerce_order_qa.legacy_package')::uuid,current_setting('commerce_order_qa.cap_order')::uuid,current_setting('commerce_order_qa.open_cap_order')::uuid,current_setting('commerce_order_qa.reused_order')::uuid)) then raise exception 'FAIL: final physical stock or reservation state'; end if;
 if (select sum(net_minor) from public.order_items where order_id=current_setting('commerce_order_qa.order')::uuid)<>549 then raise exception 'FAIL: withdrawal changed frozen order'; end if;
end $$;

-- The expired attempt's capacity has already been reused and consumed above.
-- A later canonical payment must remain review-only without consuming it again.
do $$ declare o uuid:=current_setting('commerce_order_qa.open_cap_order')::uuid; begin
 perform set_config('commerce_financial_qa.late_attempt',(select id::text from private.stripe_checkouts where order_id=o),true);
 perform set_config('commerce_financial_qa.late_session',(select session_id from private.stripe_checkouts where order_id=o),true);
 perform set_config('commerce_financial_qa.capacity_before',(select count(*)::text from private.commerce_redemptions where offer_id=(select offer_id from private.commerce_redemptions where order_id=o) and state in ('reserved','consumed')),true);
end $$;
set local role service_role;
do $$ declare o uuid:=current_setting('commerce_order_qa.open_cap_order')::uuid; begin
 if public.apply_stripe_checkout_event('evt_financial_late_'||o,current_setting('commerce_financial_qa.late_attempt')::uuid,o,current_setting('commerce_financial_qa.late_session'),false,83,'php','complete','paid','pi_financiallate') is distinct from 'review' then raise exception 'FAIL: late voucher payment did not enter review'; end if;
end $$;
reset role;
do $$ declare o uuid:=current_setting('commerce_order_qa.open_cap_order')::uuid; begin
 if (select state from private.commerce_redemptions where order_id=o) is distinct from 'released'
 or (select count(*)::text from private.commerce_redemptions where offer_id=(select offer_id from private.commerce_redemptions where order_id=o) and state in ('reserved','consumed')) is distinct from current_setting('commerce_financial_qa.capacity_before')
 or (select status from public.orders where id=o) is distinct from 'cancelled'
 or (select payment_status from public.orders where id=o) is distinct from 'paid'
 or (select on_hand from public.inventory where product_id=current_setting('commerce_order_qa.a')::uuid and market='PH') is distinct from 94
 or (select on_hand from public.inventory where product_id=current_setting('commerce_order_qa.b')::uuid and market='PH') is distinct from 99 then raise exception 'FAIL: late payment reconsumed capacity or fulfilled released stock'; end if;
end $$;

-- A free eligible selection can be billed alongside a positive charged one.
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('commerce_order_qa.customer'),'role','authenticated','aal','aal1')::text,true);
do $$ declare q jsonb; o uuid; basket jsonb:=jsonb_build_array(jsonb_build_object('productId',current_setting('commerce_order_qa.a'),'quantity',1),jsonb_build_object('productId',current_setting('commerce_order_qa.b'),'quantity',1)); begin
 q:=public.quote_commerce_checkout('PH',basket,current_setting('commerce_order_qa.zero_code'));
 if (q->>'totalMinor')::bigint is distinct from 101::bigint or (q->>'discountMinor')::bigint is distinct from 100::bigint
 or not exists(select 1 from jsonb_array_elements(q->'items') x where x->>'productId'=current_setting('commerce_order_qa.a') and (x->>'netMinor')::bigint=0)
 or not exists(select 1 from jsonb_array_elements(q->'items') x where x->>'productId'=current_setting('commerce_order_qa.b') and (x->>'netMinor')::bigint=101) then raise exception 'FAIL: partial free-selection quote'; end if;
 o:=public.create_commerce_order('PH',basket,current_setting('commerce_order_qa.delivery')::jsonb,gen_random_uuid(),current_setting('commerce_order_qa.terms'),current_setting('commerce_order_qa.zero_code'),q->>'quoteHash');
 perform set_config('commerce_financial_qa.zero_order',o::text,true);
end $$;
reset role;
set local role service_role;
do $$ declare s jsonb; o uuid:=current_setting('commerce_financial_qa.zero_order')::uuid; begin
 s:=public.prepare_stripe_checkout(o,current_setting('commerce_order_qa.customer')::uuid,false,'https://example.invalid');
 if not exists(select 1 from jsonb_array_elements(s->'items') x where (x->>'unitAmount')::bigint=0)
 or (select sum((x->>'quantity')::bigint*(x->>'unitAmount')::bigint) from jsonb_array_elements(s->'items') x) is distinct from 101::bigint then raise exception 'FAIL: partial free-selection Stripe snapshot'; end if;
 if public.apply_stripe_checkout_event('evt_financial_zero_'||o,(s->>'id')::uuid,o,'cs_test_financial_zero',false,101,'php','complete','paid','pi_financialzero') is distinct from 'paid' then raise exception 'FAIL: partial free-selection payment'; end if;
end $$;
reset role;
do $$ begin
 if (select on_hand from public.inventory where product_id=current_setting('commerce_order_qa.a')::uuid and market='PH') is distinct from 93
 or (select on_hand from public.inventory where product_id=current_setting('commerce_order_qa.b')::uuid and market='PH') is distinct from 98
 or exists(select 1 from public.inventory_reservations where order_id=current_setting('commerce_financial_qa.zero_order')::uuid) then raise exception 'FAIL: free and charged selections not consumed together'; end if;
end $$;

-- Withdrawal affects new quotations, not a previously reserved order or attempt.
set local role authenticated;
do $$ declare o uuid; request_key uuid:=gen_random_uuid(); begin
 o:=public.create_commerce_order('PH',current_setting('commerce_order_qa.single')::jsonb,current_setting('commerce_order_qa.delivery')::jsonb,request_key,current_setting('commerce_order_qa.terms'),current_setting('commerce_order_qa.percent_code'),null);
 perform set_config('commerce_financial_qa.withdraw_order',o::text,true);
 perform set_config('commerce_financial_qa.withdraw_key',request_key::text,true);
end $$;
reset role;
do $$ begin
 perform set_config('commerce_financial_qa.withdraw_offer',(select promotion_offer_id::text from public.orders where id=current_setting('commerce_financial_qa.withdraw_order')::uuid),true);
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('commerce_order_qa.admin'),'role','authenticated','aal','aal2')::text,true);
select public.withdraw_commerce_offer(current_setting('commerce_financial_qa.withdraw_offer')::uuid,'ROLLBACK-FINANCIAL-WITHDRAW');
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('commerce_order_qa.customer'),'role','authenticated','aal','aal1')::text,true);
do $$ begin
 begin
  perform public.quote_commerce_checkout('PH',current_setting('commerce_order_qa.single')::jsonb,current_setting('commerce_order_qa.percent_code'));
  raise exception 'FAIL: withdrawn promotion remained available for new quotes';
 exception when raise_exception then if SQLERRM<>'Voucher is unavailable' then raise; end if; end;
 if public.create_commerce_order('PH',current_setting('commerce_order_qa.single')::jsonb,current_setting('commerce_order_qa.delivery')::jsonb,current_setting('commerce_financial_qa.withdraw_key')::uuid,current_setting('commerce_order_qa.terms'),current_setting('commerce_order_qa.percent_code'),null)::text is distinct from current_setting('commerce_financial_qa.withdraw_order') then raise exception 'FAIL: withdrawn promotion broke reserved-order replay'; end if;
end $$;
reset role;
set local role service_role;
do $$ declare s jsonb; resumed jsonb; o uuid:=current_setting('commerce_financial_qa.withdraw_order')::uuid; begin
 s:=public.prepare_stripe_checkout(o,current_setting('commerce_order_qa.customer')::uuid,false,'https://example.invalid');
 resumed:=public.prepare_stripe_checkout(o,current_setting('commerce_order_qa.customer')::uuid,false,'https://other.invalid');
 if s->>'id' is distinct from resumed->>'id' or (s->>'amount')::bigint is distinct from 90::bigint
 or (resumed->>'amount')::bigint is distinct from 90::bigint or resumed->>'origin' is distinct from 'https://example.invalid' then raise exception 'FAIL: withdrawn promotion changed prepared/resumed snapshot'; end if;
 if public.apply_stripe_checkout_event('evt_financial_withdraw_'||o,(s->>'id')::uuid,o,'cs_test_financial_withdraw',false,90,'php','complete','paid','pi_financialwithdraw') is distinct from 'paid' then raise exception 'FAIL: withdrawn promotion blocked reserved settlement'; end if;
end $$;
reset role;
do $$ begin
 if (select state from private.commerce_redemptions where order_id=current_setting('commerce_financial_qa.withdraw_order')::uuid) is distinct from 'consumed'
 or (select on_hand from public.inventory where product_id=current_setting('commerce_order_qa.a')::uuid and market='PH') is distinct from 92
 or (select on_hand from public.inventory where product_id=current_setting('commerce_order_qa.b')::uuid and market='PH') is distinct from 98 then raise exception 'FAIL: withdrawn promotion settlement stock/capacity'; end if;
end $$;

-- Exact manifests reject both surplus and missing physical reservations. A
-- rejected payment event must roll back, allowing the same event after repair.
set local role authenticated;
do $$ declare o uuid; begin
 o:=public.create_commerce_order('PH',current_setting('commerce_order_qa.single')::jsonb,current_setting('commerce_order_qa.delivery')::jsonb,gen_random_uuid(),current_setting('commerce_order_qa.terms'),null,null);
 perform set_config('commerce_financial_qa.extra_order',o::text,true);
end $$;
reset role;
insert into public.inventory_reservations(order_id,product_id,market,quantity) values(current_setting('commerce_financial_qa.extra_order')::uuid,current_setting('commerce_order_qa.b')::uuid,'PH',1);
update public.inventory set reserved=reserved+1 where product_id=current_setting('commerce_order_qa.b')::uuid and market='PH';
set local role service_role;
do $$ begin
 begin
  perform public.prepare_stripe_checkout(current_setting('commerce_financial_qa.extra_order')::uuid,current_setting('commerce_order_qa.customer')::uuid,false,'https://example.invalid');
  raise exception 'FAIL: first preparation accepted an extra reservation';
 exception when raise_exception then if SQLERRM<>'Reservation expired or stock reconciliation required' then raise; end if; end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from private.stripe_checkouts where order_id=current_setting('commerce_financial_qa.extra_order')::uuid) then raise exception 'FAIL: rejected first preparation persisted an attempt'; end if;
end $$;
delete from public.inventory_reservations where order_id=current_setting('commerce_financial_qa.extra_order')::uuid and product_id=current_setting('commerce_order_qa.b')::uuid;
update public.inventory set reserved=reserved-1 where product_id=current_setting('commerce_order_qa.b')::uuid and market='PH';
set local role service_role;
do $$ declare s jsonb; begin
 s:=public.prepare_stripe_checkout(current_setting('commerce_financial_qa.extra_order')::uuid,current_setting('commerce_order_qa.customer')::uuid,false,'https://example.invalid');
 perform set_config('commerce_financial_qa.extra_attempt',s->>'id',true);
end $$;
reset role;
insert into public.inventory_reservations(order_id,product_id,market,quantity) values(current_setting('commerce_financial_qa.extra_order')::uuid,current_setting('commerce_order_qa.b')::uuid,'PH',1);
update public.inventory set reserved=reserved+1 where product_id=current_setting('commerce_order_qa.b')::uuid and market='PH';
set local role service_role;
do $$ declare o uuid:=current_setting('commerce_financial_qa.extra_order')::uuid; begin
 begin
  perform public.apply_stripe_checkout_event('evt_financial_extra_'||o,current_setting('commerce_financial_qa.extra_attempt')::uuid,o,'cs_test_financial_extra',false,100,'php','complete','paid','pi_financialextra');
  raise exception 'FAIL: paid transition accepted an extra reservation';
 exception when raise_exception then if SQLERRM<>'Stock reconciliation required' then raise; end if; end;
end $$;
reset role;
do $$ declare o uuid:=current_setting('commerce_financial_qa.extra_order')::uuid; begin
 if exists(select 1 from private.stripe_events where event_id='evt_financial_extra_'||o)
 or (select payment_status from public.orders where id=o) is distinct from 'pending'
 or (select on_hand from public.inventory where product_id=current_setting('commerce_order_qa.a')::uuid and market='PH') is distinct from 92
 or (select on_hand from public.inventory where product_id=current_setting('commerce_order_qa.b')::uuid and market='PH') is distinct from 98 then raise exception 'FAIL: rejected extra-reservation event changed financial state'; end if;
end $$;
delete from public.inventory_reservations where order_id=current_setting('commerce_financial_qa.extra_order')::uuid and product_id=current_setting('commerce_order_qa.b')::uuid;
update public.inventory set reserved=reserved-1 where product_id=current_setting('commerce_order_qa.b')::uuid and market='PH';
set local role service_role;
do $$ declare o uuid:=current_setting('commerce_financial_qa.extra_order')::uuid; begin
 if public.apply_stripe_checkout_event('evt_financial_extra_'||o,current_setting('commerce_financial_qa.extra_attempt')::uuid,o,'cs_test_financial_extra',false,100,'php','complete','paid','pi_financialextra') is distinct from 'paid' then raise exception 'FAIL: repaired extra-reservation event could not retry'; end if;
end $$;
reset role;
set local role authenticated;
do $$ declare o uuid; begin
 o:=public.create_commerce_order('PH',jsonb_build_array(jsonb_build_object('productId',current_setting('commerce_order_qa.a'),'quantity',1),jsonb_build_object('productId',current_setting('commerce_order_qa.b'),'quantity',1)),current_setting('commerce_order_qa.delivery')::jsonb,gen_random_uuid(),current_setting('commerce_order_qa.terms'),null,null);
 perform set_config('commerce_financial_qa.missing_order',o::text,true);
end $$;
reset role;
set local role service_role;
do $$ declare s jsonb; begin
 s:=public.prepare_stripe_checkout(current_setting('commerce_financial_qa.missing_order')::uuid,current_setting('commerce_order_qa.customer')::uuid,false,'https://example.invalid');
 perform set_config('commerce_financial_qa.missing_attempt',s->>'id',true);
end $$;
reset role;
delete from public.inventory_reservations where order_id=current_setting('commerce_financial_qa.missing_order')::uuid and product_id=current_setting('commerce_order_qa.b')::uuid;
update public.inventory set reserved=reserved-1 where product_id=current_setting('commerce_order_qa.b')::uuid and market='PH';
set local role service_role;
do $$ declare o uuid:=current_setting('commerce_financial_qa.missing_order')::uuid; begin
 begin
  perform public.apply_stripe_checkout_event('evt_financial_missing_'||o,current_setting('commerce_financial_qa.missing_attempt')::uuid,o,'cs_test_financial_missing',false,201,'php','complete','paid','pi_financialmissing');
  raise exception 'FAIL: paid transition accepted a missing reservation';
 exception when raise_exception then if SQLERRM<>'Stock reconciliation required' then raise; end if; end;
end $$;
reset role;
do $$ declare o uuid:=current_setting('commerce_financial_qa.missing_order')::uuid; begin
 if exists(select 1 from private.stripe_events where event_id='evt_financial_missing_'||o)
 or (select payment_status from public.orders where id=o) is distinct from 'pending'
 or (select on_hand from public.inventory where product_id=current_setting('commerce_order_qa.a')::uuid and market='PH') is distinct from 91
 or (select on_hand from public.inventory where product_id=current_setting('commerce_order_qa.b')::uuid and market='PH') is distinct from 98 then raise exception 'FAIL: rejected missing-reservation event changed financial state'; end if;
end $$;
insert into public.inventory_reservations(order_id,product_id,market,quantity,expires_at)
 select current_setting('commerce_financial_qa.missing_order')::uuid,current_setting('commerce_order_qa.b')::uuid,'PH',1,expires_at
 from public.inventory_reservations where order_id=current_setting('commerce_financial_qa.missing_order')::uuid and product_id=current_setting('commerce_order_qa.a')::uuid;
update public.inventory set reserved=reserved+1 where product_id=current_setting('commerce_order_qa.b')::uuid and market='PH';
set local role service_role;
do $$ declare o uuid:=current_setting('commerce_financial_qa.missing_order')::uuid; begin
 if public.apply_stripe_checkout_event('evt_financial_missing_'||o,current_setting('commerce_financial_qa.missing_attempt')::uuid,o,'cs_test_financial_missing',false,201,'php','complete','paid','pi_financialmissing') is distinct from 'paid' then raise exception 'FAIL: repaired missing-reservation event could not retry'; end if;
end $$;
reset role;
do $$ begin
 if (select on_hand from public.inventory where product_id=current_setting('commerce_order_qa.a')::uuid and market='PH') is distinct from 90
 or (select on_hand from public.inventory where product_id=current_setting('commerce_order_qa.b')::uuid and market='PH') is distinct from 97
 or exists(select 1 from public.inventory_reservations where order_id in (current_setting('commerce_financial_qa.extra_order')::uuid,current_setting('commerce_financial_qa.missing_order')::uuid)) then raise exception 'FAIL: repaired financial events consumed incorrect stock'; end if;
end $$;

-- Explicit UTC schedule boundaries reject both expired and not-yet-started
-- vouchers without relying on a zero-total or exhausted-capacity rejection.
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('commerce_order_qa.admin'),'role','authenticated','aal','aal2')::text,true);
do $$ declare n integer; code text; d jsonb; saved jsonb; begin
 for n in 1..2 loop
  code:='QA-WINDOW-'||upper(substr(gen_random_uuid()::text,1,8));
  d:=jsonb_build_object('productIds',jsonb_build_array(current_setting('commerce_order_qa.a')),'discountType','fixed','discountValue',1,'minimumSubtotalMinor',0,'maximumDiscountMinor',null,'voucherCode',code,
   'startsAt',to_char(now()+case when n=1 then interval '-2 hours' else interval '1 hour' end,'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
   'endsAt',to_char(now()+case when n=1 then interval '-1 hour' else interval '2 hours' end,'YYYY-MM-DD"T"HH24:MI:SS"Z"'),'audience','all','usageLimit',null);
  saved:=public.save_commerce_draft(null,'promotion','PH','Financial window fixture '||n,'review',d,0);
  perform public.approve_commerce_draft((saved->>'id')::uuid,1,null,'ROLLBACK-FINANCIAL-WINDOW');
  perform set_config('commerce_financial_qa.window_code_'||n,code,true);
 end loop;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('commerce_order_qa.customer'),'role','authenticated','aal','aal1')::text,true);
do $$ declare n integer; begin
 for n in 1..2 loop
  begin
   perform public.quote_commerce_checkout('PH',current_setting('commerce_order_qa.single')::jsonb,current_setting('commerce_financial_qa.window_code_'||n));
   raise exception 'FAIL: expired or future voucher window accepted';
  exception when raise_exception then if SQLERRM<>'Voucher is unavailable' then raise; end if; end;
 end loop;
end $$;
reset role;
rollback;
select 'PASS: approved snapshots, roles/MFA/markets, stale revisions/quotes, exact discounts, package component aggregation, replay, paid deduplication, voucher reservation/release/consumption, orphan expiry, open Stripe protection, legacy expiry, zero-total rejection, partial free-line billing, withdrawn-offer resume/settlement, late-paid capacity protection, missing/extra manifest event rollback and repair replay, UTC voucher windows; all fixtures rolled back' as result;
