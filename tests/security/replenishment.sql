begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
do $$
declare
 buyer uuid:=gen_random_uuid(); reviewer uuid:=gen_random_uuid(); sg uuid:=gen_random_uuid();
 sponsor uuid:=gen_random_uuid(); product uuid:=gen_random_uuid(); original uuid:=gen_random_uuid();
 rule uuid; schedule uuid; renewal uuid; replacement uuid; q jsonb; latest jsonb; attempt jsonb;
 delivery jsonb:='{"full_name":"Synthetic shopper","phone":"0000000000","line1":"Synthetic fixture address","city":"Manila","postal_code":"1000","country":"PH"}';
 revision integer;
begin
 insert into auth.users(id,email,email_confirmed_at)
 select id,'replenishment-'||id||'@example.invalid',now() from unnest(array[buyer,reviewer,sg,sponsor]) as id;
 insert into public.staff_roles(user_id,market,role)values(reviewer,'PH','compliance'),(sg,'SG','admin');
 insert into public.distributor_profiles(user_id,external_member_id,code,display_name,market,active,verified_at)
 values(sponsor,'QA-'||sponsor,'Q'||replace(sponsor::text,'-',''),'Fixture sponsor','PH',true,now());
 insert into public.sponsor_attributions(user_id,distributor_id)values(buyer,sponsor);
 insert into public.products(id,slug,name,category,status)values(product,'replenishment-'||product,'Fixture replenishment product','Nutrition','published');
 insert into public.product_offers(product_id,market,currency,retail_minor,regulatory_approved,approval_reference)
 values(product,'PH','PHP',100,true,'ROLLBACK-QA');
 insert into public.inventory(product_id,market,on_hand)values(product,'PH',8);
 update public.markets set online_sales_approved=true,payments_ready=true,policy_reference='ROLLBACK-QA' where code='PH';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',buyer,'role','authenticated','aal','aal1')::text,true);
 insert into public.orders(id,user_id,sponsor_id,market,currency,total_minor,status,payment_status,address,idempotency_key,request_hash,terms_version)
 values(original,buyer,sponsor,'PH','PHP',100,'paid','paid',delivery,gen_random_uuid(),'fixture','ROLLBACK-TERMS');
 insert into public.order_items(order_id,product_id,product_name,quantity,unit_minor)values(original,product,'Fixture replenishment product',1,100);

 if has_table_privilege('authenticated','private.replenishment_schedules','select')
  or has_function_privilege('anon','public.start_replenishment(uuid,uuid,text)','execute') then
  raise exception 'FAIL: schedule grants';
 end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'role','authenticated','aal','aal1')::text,true);
 begin
  perform public.save_replenishment_rule('PH',product,30,'PH-v1','Synthetic manually paid schedule terms.','ROLLBACK-POLICY');
  raise exception 'FAIL: staff MFA';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',sg,'role','authenticated','aal','aal2')::text,true);
 begin
  perform public.save_replenishment_rule('PH',product,30,'PH-v1','Synthetic manually paid schedule terms.','ROLLBACK-POLICY');
  raise exception 'FAIL: cross-market staff';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'role','authenticated','aal','aal2')::text,true);
 rule:=public.save_replenishment_rule('PH',product,30,'PH-v1','Synthetic manually paid schedule terms.','ROLLBACK-POLICY');
 if public.replenishment_options(original)is not null then raise exception 'FAIL: original purchase ownership'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',buyer,'role','authenticated','aal','aal1')::text,true);
 begin
  perform public.start_replenishment(original,rule,'stale');
  raise exception 'FAIL: stale consent';
 exception when serialization_failure then null; end;
 schedule:=public.start_replenishment(original,rule,'PH-v1');
 if public.start_replenishment(original,rule,'PH-v1')<>schedule then raise exception 'FAIL: consent replay'; end if;
 perform public.change_replenishment(schedule,1,'pause');
 begin
  perform public.change_replenishment(schedule,1,'resume');
  raise exception 'FAIL: stale lifecycle change';
 exception when serialization_failure then null; end;
 perform public.change_replenishment(schedule,2,'resume');
 perform public.change_replenishment(schedule,3,'skip');
 if not exists(select 1 from private.replenishment_schedules where id=schedule and cycle=2 and next_due_at>now()+interval '59 days') then
  raise exception 'FAIL: skip did not advance';
 end if;
 begin
  perform public.quote_replenishment(schedule,4);
  raise exception 'FAIL: early renewal quote';
 exception when invalid_parameter_value then null; end;
 update private.replenishment_schedules set next_due_at=now()-interval '1 second' where id=schedule;
 q:=public.quote_replenishment(schedule,4);
 if (q->'quote'->>'totalMinor')::integer<>100 then raise exception 'FAIL: initial quote'; end if;
 update public.product_offers set retail_minor=150 where product_id=product and market='PH';
 begin
  perform public.create_replenishment_order(schedule,4,q->'quote'->>'quoteHash',q->>'terms');
  raise exception 'FAIL: stale price accepted';
 exception when serialization_failure then null; end;
 q:=public.quote_replenishment(schedule,4);
 renewal:=public.create_replenishment_order(schedule,4,q->'quote'->>'quoteHash',q->>'terms');
 if not exists(select 1 from public.orders where id=renewal and sponsor_id=sponsor and total_minor=150 and payment_status='pending')or
  not exists(select 1 from public.inventory_reservations where order_id=renewal and product_id=product) then
  raise exception 'FAIL: pending sponsored renewal and reservation';
 end if;
 begin
  perform public.create_replenishment_order(schedule,4,q->'quote'->>'quoteHash',q->>'terms');
  raise exception 'FAIL: duplicate renewal';
 exception when serialization_failure then null; end;
 begin
  perform public.change_replenishment(schedule,5,'skip');
  raise exception 'FAIL: skipped with open order';
 exception when invalid_parameter_value then null; end;
 perform public.cancel_order(renewal,'Synthetic unpaid cancellation');
 q:=public.quote_replenishment(schedule,5);
 replacement:=public.create_replenishment_order(schedule,5,q->'quote'->>'quoteHash',q->>'terms');
 if replacement=renewal then raise exception 'FAIL: retry reused closed order'; end if;
 attempt:=public.prepare_stripe_checkout(replacement,buyer,false,'https://example.invalid');
 if public.apply_stripe_checkout_event('evt_replenishment_'||replacement,(attempt->>'id')::uuid,replacement,
   'cs_test_replenishment',false,150,'php','complete','paid','pi_replenishment')<>'paid' then
  raise exception 'FAIL: verified settlement';
 end if;
 latest:=public.my_replenishment_schedules()->0;
 revision:=(latest->>'revision')::int;
 if revision<>7 or (latest->>'due')::boolean or latest->>'orderId' is not null then
  raise exception 'FAIL: cycle advanced once after verified payment';
 end if;
 perform public.change_replenishment(schedule,revision,'cancel');
 if (public.my_replenishment_schedules()->0->>'state')<>'cancelled' then raise exception 'FAIL: cancellation'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'role','authenticated','aal','aal2')::text,true);
 perform public.withdraw_replenishment_rule(rule);
 if jsonb_array_length(public.my_replenishment_schedules())<>0 then raise exception 'FAIL: another customer schedule visible'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',buyer,'role','authenticated','aal','aal1')::text,true);
 if public.replenishment_options(original)is not null then raise exception 'FAIL: withdrawn rule advertised'; end if;
end $$;
rollback;
