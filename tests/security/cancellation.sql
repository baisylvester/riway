-- Order cancellation acceptance. Every order, payment, cancellation, audit row
-- and stock change is a synthetic fixture and rolls back.
begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
select set_config('request.jwt.claims','{}',true);
do $$ declare ops uuid:=gen_random_uuid(); admin uuid:=gen_random_uuid(); wrong uuid:=gen_random_uuid(); editor uuid:=gen_random_uuid();
 u uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); sponsor uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); begin
 insert into auth.users(id,email) select x,'cancel-qa-'||x||'@example.invalid' from unnest(array[ops,admin,wrong,editor,u,other,sponsor]) x;
 insert into public.staff_roles(user_id,market,role) values(ops,'PH','operations'),(admin,'PH','admin'),(wrong,'SG','operations'),(editor,'PH','editor');
 insert into public.distributor_profiles(user_id,external_member_id,code,display_name,active,verified_at,market)
 values(sponsor,'QA-CANCEL-'||sponsor,'QC-'||substr(sponsor::text,1,8),'Sample sponsor',true,now(),'PH');
 insert into public.sponsor_attributions(user_id,distributor_id) values(u,sponsor),(other,sponsor);
 insert into public.products(id,slug,name,category,status) values(p,'cancel-qa-'||p,'Sample cancellation product','Nutrition','published');
 insert into public.product_offers(product_id,market,currency,retail_minor,regulatory_approved,approval_reference,max_quantity)
 values(p,'PH','PHP',100,true,'ROLLBACK-QA',24);
 insert into public.inventory(product_id,market,on_hand) values(p,'PH',100);
 update public.markets set online_sales_approved=true,payments_ready=true,policy_reference='ROLLBACK-QA' where code='PH';
 perform set_config('cancel_qa.ops',ops::text,true); perform set_config('cancel_qa.admin',admin::text,true);
 perform set_config('cancel_qa.wrong',wrong::text,true); perform set_config('cancel_qa.editor',editor::text,true);
 perform set_config('cancel_qa.customer',u::text,true); perform set_config('cancel_qa.other',other::text,true);
 perform set_config('cancel_qa.product',p::text,true);
 perform set_config('cancel_qa.cart',jsonb_build_array(jsonb_build_object('productId',p,'quantity',2))::text,true);
 perform set_config('cancel_qa.delivery','{"full_name":"Sample QA customer","phone":"0000000000","line1":"Sample QA address","city":"Manila","postal_code":"1000","country":"PH"}',true);
 perform set_config('cancel_qa.terms',(select checkout_terms_version from public.markets where code='PH'),true);
 if has_table_privilege('authenticated','private.order_cancellations','select,insert,update,delete')
 or has_table_privilege('service_role','private.order_cancellations','select,insert,update,delete')
 or has_function_privilege('anon','public.cancel_order(uuid,text)','execute')
 or has_function_privilege('anon','public.order_cancellation(uuid)','execute') then raise exception 'FAIL: cancellation grants'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in ('cancel_order','order_cancellation') and p.prosecdef) then raise exception 'FAIL: exposed cancellation definer'; end if;
end $$;

-- Four unpaid orders of two units each: 1 customer-cancelled, 2 staff-cancelled,
-- 3 with a started payment attempt, 4 paid through the real Stripe path.
set local role authenticated;
do $$ declare i integer; begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('cancel_qa.customer'),'role','authenticated','aal','aal1')::text,true);
 for i in 1..4 loop
  perform set_config('cancel_qa.order'||i,public.create_commerce_order('PH',current_setting('cancel_qa.cart')::jsonb,
   current_setting('cancel_qa.delivery')::jsonb,gen_random_uuid(),current_setting('cancel_qa.terms'))::text,true);
 end loop;
end $$;
reset role;
set local role service_role;
do $$ declare c jsonb; oid uuid; begin
 perform public.prepare_stripe_checkout(current_setting('cancel_qa.order3')::uuid,current_setting('cancel_qa.customer')::uuid,false,'https://example.invalid');
 oid:=current_setting('cancel_qa.order4')::uuid;
 c:=public.prepare_stripe_checkout(oid,current_setting('cancel_qa.customer')::uuid,false,'https://example.invalid');
 if public.apply_stripe_checkout_event('evt_cancel_'||oid,(c->>'id')::uuid,oid,'cs_test_cancel4',false,200,'php','complete','paid','pi_cancel4')<>'paid' then raise exception 'FAIL: fixture payment'; end if;
end $$;
reset role;
do $$ begin
 perform set_config('cancel_qa.reserved',(select reserved from public.inventory where market='PH' and product_id=current_setting('cancel_qa.product')::uuid)::text,true);
end $$;

set local role authenticated;
do $$ declare who text; r jsonb; o1 uuid:=current_setting('cancel_qa.order1')::uuid; o2 uuid:=current_setting('cancel_qa.order2')::uuid; begin
 -- Another customer, editors, other-market operations and unverified admins cannot cancel or read.
 foreach who in array array['other','editor','wrong'] loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('cancel_qa.'||who),'role','authenticated','aal','aal2')::text,true);
  begin
   perform public.cancel_order(o1,'Unauthorized attempt');
   raise exception 'FAIL: unauthorized cancellation by %',who;
  exception when insufficient_privilege then null; end;
  begin
   perform public.order_cancellation(o1);
   raise exception 'FAIL: cancellation state leaked to %',who;
  exception when insufficient_privilege then null; end;
 end loop;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('cancel_qa.admin'),'role','authenticated','aal','aal1')::text,true);
 begin
  perform public.cancel_order(o2,'No MFA attempt');
  raise exception 'FAIL: staff cancellation without MFA';
 exception when insufficient_privilege then null; end;

 -- The owner cancels without a reason; an exact replay returns the same record.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('cancel_qa.customer'),'role','authenticated','aal','aal1')::text,true);
 r:=public.order_cancellation(o1);
 if r->>'cancellable'<>'true' or r->'cancellation'<>'null'::jsonb then raise exception 'FAIL: cancellable state'; end if;
 r:=public.cancel_order(o1);
 if r->>'status'<>'cancelled' or r->>'cancellable'<>'false' or r->'cancellation'->>'cancelledBy'<>'customer' or (r->'cancellation') ? 'actorId' then raise exception 'FAIL: customer cancellation'; end if;
 if public.cancel_order(o1)<>r then raise exception 'FAIL: exact replay changed state'; end if;
 begin
  perform public.cancel_order(o1,'Changed my mind later');
  raise exception 'FAIL: conflicting replay accepted';
 exception when raise_exception then if SQLERRM<>'This order was already cancelled' then raise; end if; end;

 -- A started payment attempt and a paid order cannot be cancelled online.
 begin
  perform public.cancel_order(current_setting('cancel_qa.order3')::uuid);
  raise exception 'FAIL: order with payment attempt cancelled';
 exception when serialization_failure then if SQLERRM<>'A payment has started for this order' then raise; end if; end;
 if (public.order_cancellation(current_setting('cancel_qa.order3')::uuid)->>'cancellable')<>'false' then raise exception 'FAIL: attempt shown cancellable'; end if;
 begin
  perform public.cancel_order(current_setting('cancel_qa.order4')::uuid);
  raise exception 'FAIL: paid order cancelled';
 exception when serialization_failure then if SQLERRM<>'Only unpaid orders can be cancelled online' then raise; end if; end;

 -- Staff must give a well-formed reason.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('cancel_qa.ops'),'role','authenticated','aal','aal2')::text,true);
 begin
  perform public.cancel_order(o2,'   ');
  raise exception 'FAIL: staff cancellation without reason';
 exception when raise_exception then if SQLERRM<>'A cancellation reason is required' then raise; end if; end;
 begin
  perform public.cancel_order(o2,E'Duplicate\torder');
  raise exception 'FAIL: tab character accepted in reason';
 exception when check_violation then null; end;
 r:=public.cancel_order(o2,E'  Duplicate order\r\nconfirmed by phone  ');
 if r->>'status'<>'cancelled' or r->'cancellation'->>'cancelledBy'<>'staff' or r->'cancellation'->>'reason'<>E'Duplicate order\nconfirmed by phone' then raise exception 'FAIL: staff cancellation'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('cancel_qa.admin'),'role','authenticated','aal','aal2')::text,true);
 begin
  perform public.cancel_order(o2,'Another reason here');
  raise exception 'FAIL: second staff cancellation accepted';
 exception when raise_exception then if SQLERRM<>'This order was already cancelled' then raise; end if; end;

 -- The owner sees who cancelled.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('cancel_qa.customer'),'role','authenticated','aal','aal1')::text,true);
 if public.order_cancellation(o2)->'cancellation'->>'cancelledBy'<>'staff' then raise exception 'FAIL: owner cancellation view'; end if;
end $$;
reset role;

do $$ declare p uuid:=current_setting('cancel_qa.product')::uuid; o1 uuid:=current_setting('cancel_qa.order1')::uuid; o2 uuid:=current_setting('cancel_qa.order2')::uuid; begin
 if exists(select 1 from public.inventory_reservations where order_id in (o1,o2)) then raise exception 'FAIL: stock hold kept'; end if;
 if (select reserved from public.inventory where market='PH' and product_id=p)<>current_setting('cancel_qa.reserved')::integer-4 then raise exception 'FAIL: reserved stock not released'; end if;
 if not exists(select 1 from public.inventory_reservations where order_id=current_setting('cancel_qa.order3')::uuid) then raise exception 'FAIL: attempt hold released'; end if;
 if (select status from public.orders where id=current_setting('cancel_qa.order3')::uuid)<>'awaiting_payment'
 or (select status from public.orders where id=current_setting('cancel_qa.order4')::uuid)<>'paid' then raise exception 'FAIL: refused order changed'; end if;
 if (select count(*) from public.audit_logs where entity='orders' and entity_id in (o1::text,o2::text) and action in ('ORDER_CANCEL_CUSTOMER:PH','ORDER_CANCEL_STAFF:PH'))<>2 then raise exception 'FAIL: cancellation audit'; end if;
 if (select count(*) from private.order_cancellations where order_id in (o1,o2))<>2 then raise exception 'FAIL: cancellation records'; end if;
end $$;

select 'PASS: cancellation owner/role/market/MFA scope, unpaid-only with no payment attempt, staff reason, idempotent replay, stock release, audit; all fixtures rolled back' as result;
rollback;
