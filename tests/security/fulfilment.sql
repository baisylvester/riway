-- Order fulfilment acceptance. Every order, payment, event, audit row and
-- notification is a synthetic fixture and rolls back.
begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
select set_config('request.jwt.claims','{}',true);
do $$ declare ops uuid:=gen_random_uuid(); admin uuid:=gen_random_uuid(); wrong uuid:=gen_random_uuid(); editor uuid:=gen_random_uuid();
 u uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); sponsor uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); begin
 insert into auth.users(id,email) select x,'fulfilment-qa-'||x||'@example.invalid' from unnest(array[ops,admin,wrong,editor,u,other,sponsor]) x;
 insert into public.staff_roles(user_id,market,role) values(ops,'PH','operations'),(admin,'PH','admin'),(wrong,'SG','operations'),(editor,'PH','editor');
 insert into public.distributor_profiles(user_id,external_member_id,code,display_name,active,verified_at,market)
 values(sponsor,'QA-FULFIL-'||sponsor,'QF-'||substr(sponsor::text,1,8),'Sample sponsor',true,now(),'PH');
 insert into public.sponsor_attributions(user_id,distributor_id) values(u,sponsor),(other,sponsor);
 insert into public.products(id,slug,name,category,status) values(p,'fulfilment-qa-'||p,'Sample fulfilment product','Nutrition','published');
 insert into public.product_offers(product_id,market,currency,retail_minor,regulatory_approved,approval_reference,max_quantity)
 values(p,'PH','PHP',100,true,'ROLLBACK-QA',24);
 insert into public.inventory(product_id,market,on_hand) values(p,'PH',100);
 update public.markets set online_sales_approved=true,payments_ready=true,policy_reference='ROLLBACK-QA' where code='PH';
 perform set_config('fulfil_qa.ops',ops::text,true); perform set_config('fulfil_qa.admin',admin::text,true);
 perform set_config('fulfil_qa.wrong',wrong::text,true); perform set_config('fulfil_qa.editor',editor::text,true);
 perform set_config('fulfil_qa.customer',u::text,true); perform set_config('fulfil_qa.other',other::text,true);
 perform set_config('fulfil_qa.cart',jsonb_build_array(jsonb_build_object('productId',p,'quantity',1))::text,true);
 perform set_config('fulfil_qa.delivery','{"full_name":"Sample QA customer","phone":"0000000000","line1":"Sample QA address","city":"Manila","postal_code":"1000","country":"PH"}',true);
 perform set_config('fulfil_qa.terms',(select checkout_terms_version from public.markets where code='PH'),true);
 if has_table_privilege('authenticated','private.order_fulfilment_events','select,insert,update,delete')
 or has_table_privilege('service_role','private.order_fulfilment_events','select,insert,update,delete')
 or has_function_privilege('anon','public.advance_order_fulfilment(uuid,text,text,text,text,text,text)','execute')
 or has_function_privilege('anon','public.order_fulfilment(uuid)','execute')
 or has_function_privilege('anon','public.reject_membership_enrollment(uuid,text)','execute') then raise exception 'FAIL: fulfilment grants'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in ('advance_order_fulfilment','order_fulfilment','reject_membership_enrollment') and p.prosecdef) then raise exception 'FAIL: exposed fulfilment definer'; end if;
end $$;

-- One order is paid through the real Stripe settlement path; one stays unpaid.
set local role authenticated;
do $$ declare i integer; begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('fulfil_qa.customer'),'role','authenticated','aal','aal1')::text,true);
 for i in 1..2 loop
  perform set_config('fulfil_qa.order'||i,public.create_commerce_order('PH',current_setting('fulfil_qa.cart')::jsonb,
   current_setting('fulfil_qa.delivery')::jsonb,gen_random_uuid(),current_setting('fulfil_qa.terms'))::text,true);
 end loop;
end $$;
reset role;
set local role service_role;
do $$ declare c jsonb; oid uuid:=current_setting('fulfil_qa.order1')::uuid; begin
 c:=public.prepare_stripe_checkout(oid,current_setting('fulfil_qa.customer')::uuid,false,'https://example.invalid');
 if public.apply_stripe_checkout_event('evt_fulfil_'||oid,(c->>'id')::uuid,oid,'cs_test_fulfil1',false,100,'php','complete','paid','pi_fulfil1')<>'paid' then raise exception 'FAIL: fixture payment'; end if;
end $$;
reset role;

set local role authenticated;
do $$ declare who text; oid uuid:=current_setting('fulfil_qa.order1')::uuid; r jsonb; begin
 -- Customers, editors, other-market operations and unverified admins cannot fulfil.
 foreach who in array array['customer','editor','wrong'] loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('fulfil_qa.'||who),'role','authenticated','aal','aal2')::text,true);
  begin
   perform public.advance_order_fulfilment(oid,'fulfilling');
   raise exception 'FAIL: unauthorized fulfilment by %',who;
  exception when insufficient_privilege then null; end;
 end loop;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('fulfil_qa.admin'),'role','authenticated','aal','aal1')::text,true);
 begin
  perform public.advance_order_fulfilment(oid,'fulfilling');
  raise exception 'FAIL: fulfilment without MFA';
 exception when insufficient_privilege then null; end;

 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('fulfil_qa.ops'),'role','authenticated','aal','aal2')::text,true);
 begin
  perform public.advance_order_fulfilment(current_setting('fulfil_qa.order2')::uuid,'fulfilling');
  raise exception 'FAIL: unpaid order fulfilled';
 exception when raise_exception then if SQLERRM<>'Only paid orders can be fulfilled' then raise; end if; end;
 begin
  perform public.advance_order_fulfilment(oid,'shipped','courier','Sample Courier','QA123456');
  raise exception 'FAIL: skipped packing step';
 exception when serialization_failure then null; end;
 begin
  perform public.advance_order_fulfilment(oid,'returned');
  raise exception 'FAIL: unknown fulfilment step';
 exception when raise_exception then if SQLERRM<>'Unknown fulfilment step' then raise; end if; end;
 begin
  perform public.advance_order_fulfilment(oid,'fulfilling','courier','Sample Courier','QA123456');
  raise exception 'FAIL: carrier details on packing step';
 exception when raise_exception then if SQLERRM<>'Carrier details belong to the dispatch step' then raise; end if; end;

 r:=public.advance_order_fulfilment(oid,'fulfilling',null,null,null,null,'  Packed at Manila warehouse  ');
 if r->>'status'<>'fulfilling' or jsonb_array_length(r->'events')<>1 or r->'events'->0->>'note'<>'Packed at Manila warehouse' then raise exception 'FAIL: packing step'; end if;
 if public.advance_order_fulfilment(oid,'fulfilling',null,null,null,null,'Packed at Manila warehouse')->'events'<>r->'events' then raise exception 'FAIL: exact replay changed state'; end if;
 begin
  perform public.advance_order_fulfilment(oid,'fulfilling',null,null,null,null,'Different note');
  raise exception 'FAIL: conflicting replay accepted';
 exception when raise_exception then if SQLERRM like 'FAIL:%' then raise; end if; end;

 begin
  perform public.advance_order_fulfilment(oid,'shipped');
  raise exception 'FAIL: dispatch without method';
 exception when raise_exception then if SQLERRM<>'Choose courier delivery or service-centre collection' then raise; end if; end;
 begin
  perform public.advance_order_fulfilment(oid,'shipped','courier','Sample Courier');
  raise exception 'FAIL: courier without tracking';
 exception when raise_exception then if SQLERRM<>'Courier dispatch requires a carrier and tracking number' then raise; end if; end;
 begin
  perform public.advance_order_fulfilment(oid,'shipped','collection','Sample Courier',null,null,'Service centre');
  raise exception 'FAIL: collection with carrier';
 exception when raise_exception then if SQLERRM<>'Collection requires service-centre details only' then raise; end if; end;
 begin
  perform public.advance_order_fulfilment(oid,'shipped','courier','Sample Courier','QA123456','http://tracking.example.invalid/QA123456');
  raise exception 'FAIL: non-https tracking link';
 exception when check_violation then null; end;
 begin
  perform public.advance_order_fulfilment(oid,'shipped','courier','Sample Courier','QA 123 <script>');
  raise exception 'FAIL: malformed tracking number';
 exception when check_violation then null; end;

 r:=public.advance_order_fulfilment(oid,'shipped','courier','Sample Courier','QA123456','https://tracking.example.invalid/QA123456');
 if r->>'status'<>'shipped' or r->'events'->1->>'trackingNumber'<>'QA123456' or r->'events'->1->>'method'<>'courier' then raise exception 'FAIL: dispatch step'; end if;
 begin
  perform public.advance_order_fulfilment(oid,'delivered',null,null,null,null,E'Left with\treception');
  raise exception 'FAIL: tab character accepted in note';
 exception when check_violation then null; end;
 r:=public.advance_order_fulfilment(oid,'delivered',null,null,null,null,E'Left with reception\nSigned by customer');
 if r->>'status'<>'delivered' or jsonb_array_length(r->'events')<>3 or r->'events'->2->>'note'<>E'Left with reception\nSigned by customer' then raise exception 'FAIL: delivery step'; end if;
 begin
  perform public.advance_order_fulfilment(oid,'shipped','courier','Other Courier','QA999999');
  raise exception 'FAIL: delivered order re-dispatched';
 exception when raise_exception then if SQLERRM like 'FAIL:%' then raise; end if; end;

 -- The owner sees the timeline; another customer and other-market staff cannot.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('fulfil_qa.customer'),'role','authenticated','aal','aal1')::text,true);
 r:=public.order_fulfilment(oid);
 if r->>'status'<>'delivered' or jsonb_array_length(r->'events')<>3 or (r->'events'->0) ? 'actorId' then raise exception 'FAIL: customer timeline'; end if;
 foreach who in array array['other','wrong'] loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('fulfil_qa.'||who),'role','authenticated','aal','aal2')::text,true);
  begin
   perform public.order_fulfilment(oid);
   raise exception 'FAIL: fulfilment history leaked to %',who;
  exception when insufficient_privilege then null; end;
 end loop;
end $$;
reset role;

do $$ declare oid uuid:=current_setting('fulfil_qa.order1')::uuid; j private.notification_jobs; begin
 if (select count(*) from public.audit_logs where entity='orders' and entity_id=oid::text and action like 'ORDER_FULFILMENT_%:PH')<>3 then raise exception 'FAIL: fulfilment audit'; end if;
 if (select count(*) from private.notification_jobs where user_id=current_setting('fulfil_qa.customer')::uuid and kind='order_shipped')<>1
 or (select count(*) from private.notification_jobs where user_id=current_setting('fulfil_qa.customer')::uuid and kind='order_delivered')<>1 then raise exception 'FAIL: shipping notifications'; end if;
 if exists(select 1 from private.notification_jobs where user_id=current_setting('fulfil_qa.customer')::uuid and kind not in ('order_shipped','order_delivered')) then raise exception 'FAIL: unexpected notification'; end if;
 update private.notification_jobs set status='processing',lease=gen_random_uuid(),lease_until=now()+interval '1 minute'
  where user_id=current_setting('fulfil_qa.customer')::uuid and kind='order_delivered' returning * into j;
 if not private.notification_authorized(j.id,j.lease) then raise exception 'FAIL: delivery notification denied'; end if;
 if (select status from public.orders where id=current_setting('fulfil_qa.order2')::uuid)<>'awaiting_payment' then raise exception 'FAIL: unpaid order changed'; end if;
 if (select on_hand from public.inventory where market='PH' and product_id=(current_setting('fulfil_qa.cart')::jsonb->0->>'productId')::uuid)<>99 then raise exception 'FAIL: fulfilment changed stock'; end if;
end $$;

select 'PASS: fulfilment role/market/MFA scope, paid-only linear steps, dispatch validation, idempotent replay, owner-only timeline, audit, notifications and unchanged stock; all fixtures rolled back' as result;
rollback;
