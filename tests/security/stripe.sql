-- Only synthetic fixtures, with approvals and all payment/stock changes rolled back.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ declare u uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); p2 uuid:=gen_random_uuid(); begin
 perform set_config('stripe_qa.user',u::text,true); perform set_config('stripe_qa.product',p::text,true); perform set_config('stripe_qa.product2',p2::text,true);
 insert into auth.users(id,email) values(u,'riway-stripe-qa-'||u::text||'@example.invalid'),(d,'riway-stripe-qa-'||d::text||'@example.invalid');
 insert into public.distributor_profiles(user_id,external_member_id,code,display_name,active,verified_at,market)
 values(d,d::text,'QA-'||d::text,'Temporary Stripe QA sponsor',true,now(),'PH');
 insert into public.sponsor_attributions(user_id,distributor_id) values(u,d);
 insert into public.products(id,slug,name,category,status) values(p,'stripe-qa-'||p::text,'Temporary QA product','Nutrition','published'),(p2,'stripe-qa-'||p2::text,'Other temporary QA product','Nutrition','published');
 insert into public.product_offers(product_id,market,currency,retail_minor,regulatory_approved,approval_reference,max_quantity)
 select id,'PH','PHP',10000,true,'ROLLBACK-QA-ONLY',6 from unnest(array[p,p2]) id;
 insert into public.inventory(product_id,market,on_hand) values(p,'PH',20),(p2,'PH',20);
 update public.markets set online_sales_approved=true,payments_ready=true,policy_reference='ROLLBACK-QA-ONLY' where code='PH';
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('stripe_qa.user'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
do $$ declare oid uuid; items jsonb; n integer; begin
 for n in 1..6 loop
  items:=jsonb_build_array(jsonb_build_object('productId',current_setting('stripe_qa.product'),'quantity',case when n=1 then 2 else 1 end));
  if n=6 then items:=items||jsonb_build_array(jsonb_build_object('productId',current_setting('stripe_qa.product2'),'quantity',1)); end if;
  oid:=public.create_order('PH',items,'{"full_name":"Temporary QA Customer","phone":"0000000000","line1":"Temporary QA address","city":"Manila","postal_code":"1000","country":"PH"}'::jsonb,gen_random_uuid(),'2026-11-draft');
  perform set_config('stripe_qa.order'||n,oid::text,true);
 end loop;
 begin
  perform public.prepare_stripe_checkout(current_setting('stripe_qa.order1')::uuid,current_setting('stripe_qa.user')::uuid,false,'https://example.invalid');
  raise exception 'FAIL: browser can prepare payment';
 exception when insufficient_privilege then null; end;
 begin
  perform public.apply_stripe_checkout_event('evt_forged',gen_random_uuid(),current_setting('stripe_qa.order1')::uuid,'cs_test_forged',false,20000,'php','complete','paid','pi_forged');
  raise exception 'FAIL: browser can mark paid';
 exception when insufficient_privilege then null; end;
 if public.stripe_checkout_status(current_setting('stripe_qa.order1')::uuid) is not null then raise exception 'FAIL: unexpected payment'; end if;
end $$;
reset role;
set local role service_role;
do $$ declare c jsonb; n integer; begin
 begin
  perform public.prepare_stripe_checkout(current_setting('stripe_qa.order1')::uuid,gen_random_uuid(),false,'https://example.invalid');
  raise exception 'FAIL: owner mismatch accepted';
 exception when raise_exception then if SQLERRM<>'Order unavailable' then raise; end if; end;
 begin
  perform public.prepare_stripe_checkout(current_setting('stripe_qa.order1')::uuid,current_setting('stripe_qa.user')::uuid,true,'https://example.invalid');
  raise exception 'FAIL: draft live terms accepted';
 exception when raise_exception then if SQLERRM<>'Final terms required for live payment' then raise; end if; end;
 for n in 1..5 loop
  c:=public.prepare_stripe_checkout(current_setting('stripe_qa.order'||n)::uuid,current_setting('stripe_qa.user')::uuid,false,'https://example.invalid');
  perform set_config('stripe_qa.attempt'||n,c->>'id',true);
  if c->>'currency'<>'php' or c->>'phase'<>'preparing' then raise exception 'FAIL: incorrect payment snapshot'; end if;
 end loop;
 c:=public.prepare_stripe_checkout(current_setting('stripe_qa.order1')::uuid,current_setting('stripe_qa.user')::uuid,false,'https://other.invalid');
 if c->>'id'<>current_setting('stripe_qa.attempt1') or c->>'origin'<>'https://example.invalid' then raise exception 'FAIL: unstable payment replay snapshot'; end if;
 perform public.bind_stripe_checkout(current_setting('stripe_qa.attempt1')::uuid,'cs_test_paid','https://checkout.stripe.com/c/pay/test_fixture');
 begin
  perform public.apply_stripe_checkout_event('evt_qa_amount',current_setting('stripe_qa.attempt1')::uuid,current_setting('stripe_qa.order1')::uuid,'cs_test_paid',false,1,'php','complete','paid','pi_paid');
  raise exception 'FAIL: tampered amount accepted';
 exception when raise_exception then if SQLERRM<>'Payment does not match order' then raise; end if; end;
 begin
  perform public.apply_stripe_checkout_event('evt_qa_mode',current_setting('stripe_qa.attempt1')::uuid,current_setting('stripe_qa.order1')::uuid,'cs_test_paid',true,20000,'php','complete','paid','pi_paid');
  raise exception 'FAIL: live/test mismatch accepted';
 exception when raise_exception then if SQLERRM<>'Payment does not match order' then raise; end if; end;
 if public.apply_stripe_checkout_event('evt_qa_processing',current_setting('stripe_qa.attempt1')::uuid,current_setting('stripe_qa.order1')::uuid,'cs_test_paid',false,20000,'php','complete','unpaid',null)<>'processing' then raise exception 'FAIL: unpaid session fulfilled'; end if;
 if public.apply_stripe_checkout_event('evt_qa_amount',current_setting('stripe_qa.attempt1')::uuid,current_setting('stripe_qa.order1')::uuid,'cs_test_paid',false,20000,'php','complete','paid','pi_paid')<>'paid' then raise exception 'FAIL: payment not applied'; end if;
 if public.apply_stripe_checkout_event('evt_qa_amount',current_setting('stripe_qa.attempt1')::uuid,current_setting('stripe_qa.order1')::uuid,'cs_test_paid',false,20000,'php','complete','paid','pi_paid')<>'duplicate' then raise exception 'FAIL: duplicate event reapplied'; end if;
 perform public.apply_stripe_checkout_event('evt_qa_paid_again',current_setting('stripe_qa.attempt1')::uuid,current_setting('stripe_qa.order1')::uuid,'cs_test_paid',false,20000,'php','complete','paid','pi_paid');
 perform public.apply_stripe_checkout_event('evt_qa_expired_late',current_setting('stripe_qa.attempt1')::uuid,current_setting('stripe_qa.order1')::uuid,'cs_test_paid',false,20000,'php','expired','unpaid',null);
 -- Expiry releases once; a later reported payment is flagged, never fulfilled against released stock.
 perform public.apply_stripe_checkout_event('evt_qa_expired',current_setting('stripe_qa.attempt2')::uuid,current_setting('stripe_qa.order2')::uuid,'cs_test_expired',false,10000,'php','expired','unpaid',null);
 perform public.apply_stripe_checkout_event('evt_qa_failure_after_expiry',current_setting('stripe_qa.attempt2')::uuid,current_setting('stripe_qa.order2')::uuid,'cs_test_expired',false,10000,'php','complete','unpaid',null,true);
 if public.apply_stripe_checkout_event('evt_qa_late_charge',current_setting('stripe_qa.attempt2')::uuid,current_setting('stripe_qa.order2')::uuid,'cs_test_expired',false,10000,'php','complete','paid','pi_late')<>'review' then raise exception 'FAIL: late charge not flagged'; end if;
 -- Asynchronous failure releases stock without marking paid.
 perform public.apply_stripe_checkout_event('evt_qa_async_fail',current_setting('stripe_qa.attempt3')::uuid,current_setting('stripe_qa.order3')::uuid,'cs_test_failed',false,10000,'php','complete','unpaid',null,true);
 -- A fast webhook can arrive before the API binds the session; binding must not regress paid.
 perform public.apply_stripe_checkout_event('evt_qa_race',current_setting('stripe_qa.attempt4')::uuid,current_setting('stripe_qa.order4')::uuid,'cs_test_race',false,10000,'php','complete','paid','pi_race');
 if public.bind_stripe_checkout(current_setting('stripe_qa.attempt4')::uuid,'cs_test_race','https://checkout.stripe.com/c/pay/race')<>'paid' then raise exception 'FAIL: session bind regressed paid status'; end if;
end $$;
reset role;
do $$ begin
 if (select on_hand from public.inventory where product_id=current_setting('stripe_qa.product')::uuid and market='PH')<>17 then raise exception 'FAIL: paid stock not deducted exactly once'; end if;
 if (select reserved from public.inventory where product_id=current_setting('stripe_qa.product')::uuid and market='PH')<>2 then raise exception 'FAIL: reserved stock mismatch'; end if;
 if (select payment_status from public.orders where id=current_setting('stripe_qa.order1')::uuid)<>'paid' then raise exception 'FAIL: payment status regressed'; end if;
 if (select status from public.orders where id=current_setting('stripe_qa.order2')::uuid)<>'cancelled' then raise exception 'FAIL: late charge fulfilled'; end if;
 update public.inventory_reservations set expires_at=now()-interval '1 minute' where order_id in (current_setting('stripe_qa.order5')::uuid,current_setting('stripe_qa.order6')::uuid);
 if public.release_expired_reservations()<>2 then raise exception 'FAIL: multi-line legacy expiry incomplete'; end if;
 if (select reserved from public.inventory where product_id=current_setting('stripe_qa.product')::uuid and market='PH')<>1 then raise exception 'FAIL: open Stripe stock released by local expiry'; end if;
 if (select count(*) from public.inventory_reservations where order_id=current_setting('stripe_qa.order6')::uuid)<>0 then raise exception 'FAIL: legacy order lines leaked'; end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('stripe_qa.user'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
do $$ begin
 if public.stripe_checkout_status(current_setting('stripe_qa.order1')::uuid)->>'phase'<>'paid' then raise exception 'FAIL: owner cannot read own status'; end if;
 if jsonb_array_length(public.staff_stripe_payments())<>0 then raise exception 'FAIL: customer can read staff payment records'; end if;
 begin perform 1 from private.stripe_checkouts; raise exception 'FAIL: browser can read private payment state'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
do $$ begin if public.stripe_checkout_status(current_setting('stripe_qa.order1')::uuid) is not null then raise exception 'FAIL: other customer payment exposed'; end if; end $$;
reset role;
rollback;
select 'PASS: payment snapshot/replay, service-only transitions, owner isolation, amount/mode matching, unpaid handling, webhook deduplication, monotonic state, expiry/failure release, late-charge review, webhook/bind race, all-line legacy expiry and open-session stock protection; all fixtures rolled back' as result;
