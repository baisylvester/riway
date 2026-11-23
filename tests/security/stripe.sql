-- Stripe settlement integration test. Approval flags, fixtures and every event row roll back.
begin;
insert into auth.users(id,email) values
 ('30000000-0000-4000-8000-000000000001','stripe-test@example.invalid'),
 ('30000000-0000-4000-8000-000000000002','stripe-sponsor@example.invalid');
insert into public.distributor_profiles(user_id,external_member_id,code,display_name,active,verified_at,market) values
 ('30000000-0000-4000-8000-000000000002','TEST-STRIPE-MEMBER','TEST-STRIPE','Test sponsor',true,now(),'PH');
insert into public.sponsor_attributions(user_id,distributor_id) values('30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002');
insert into public.products(id,slug,name,category,status) values('30000000-0000-4000-8000-000000000003','stripe-test-product','Test product','Nutrition','published');
insert into public.product_offers(product_id,market,currency,retail_minor,member_minor,regulatory_approved,approval_reference,max_quantity) values('30000000-0000-4000-8000-000000000003','PH','PHP',10000,8000,true,'TEST-APPROVAL',6);
insert into public.inventory(product_id,market,on_hand) values('30000000-0000-4000-8000-000000000003','PH',10);
update public.markets set online_sales_approved=true,policy_reference='TEST-POLICY',payments_ready=true where code='PH';

select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
do $$ declare paid_order uuid; failed_order uuid; lines jsonb:='[{"productId":"30000000-0000-4000-8000-000000000003","quantity":2}]'; address jsonb:='{"full_name":"Test Customer","phone":"123456789","line1":"123 Test Street","city":"Manila","postal_code":"1000","country":"PH"}'; begin
 paid_order:=public.create_order('PH',lines,address,'30000000-0000-4000-8000-000000000004','2026-11-draft');
 failed_order:=public.create_order('PH','[{"productId":"30000000-0000-4000-8000-000000000003","quantity":1}]',address,'30000000-0000-4000-8000-000000000005','2026-11-draft');
 perform set_config('stripe.paid_order', paid_order::text, true);
 perform set_config('stripe.failed_order', failed_order::text, true);
end $$;
reset role;

-- Service role is the only caller allowed to attach sessions or settle events.
set role service_role;
do $$ declare paid_order uuid:=current_setting('stripe.paid_order')::uuid; failed_order uuid:=current_setting('stripe.failed_order')::uuid; begin
 if not public.stripe_attach_session(paid_order,'cs_test_paid_1',now()+interval '31 minutes') then raise exception 'FAIL: attach paid session'; end if;
 if public.stripe_attach_session(paid_order,'cs_test_paid_other',now()+interval '31 minutes') then raise exception 'FAIL: second session attached'; end if;
 if not public.stripe_attach_session(failed_order,'cs_test_failed_1',now()+interval '31 minutes') then raise exception 'FAIL: attach failed-path session'; end if;
 if (select expires_at < now()+interval '35 minutes' from public.inventory_reservations where order_id=paid_order limit 1) then raise exception 'FAIL: reservation not extended to session expiry'; end if;
 begin
  perform public.stripe_attach_session(paid_order,'not-a-session',now()+interval '31 minutes');
  raise exception 'FAIL: malformed session id accepted';
 exception when raise_exception then if SQLERRM<>'Invalid checkout session' then raise; end if; end;
end $$;

do $$ begin
 if public.stripe_settle_event('evt_test_amount','checkout.session.completed','cs_test_paid_1','paid',19999,'PHP')<>'amount_mismatch' then raise exception 'FAIL: amount mismatch was not refused'; end if;
 if (select status||'/'||payment_status from public.orders where stripe_checkout_session_id='cs_test_paid_1')<>'awaiting_payment/pending' then raise exception 'FAIL: mismatched payment changed the order'; end if;
 if (select reserved from public.inventory where product_id='30000000-0000-4000-8000-000000000003' and market='PH')<>3 then raise exception 'FAIL: stock changed by mismatched payment'; end if;
 if public.stripe_settle_event('evt_test_paid_1','checkout.session.completed','cs_test_paid_1','paid',20000,'PHP')<>'paid' then raise exception 'FAIL: paid event not settled'; end if;
 if (select on_hand||'/'||reserved from public.inventory where product_id='30000000-0000-4000-8000-000000000003' and market='PH')<>'8/1' then raise exception 'FAIL: paid stock not consumed'; end if;
 if (select status||'/'||payment_status from public.orders where stripe_checkout_session_id='cs_test_paid_1')<>'paid/paid' then raise exception 'FAIL: order not marked paid'; end if;
 if (select count(*) from public.inventory_movements where reason like 'Stripe payment for order%' and delta=-2)<>1 then raise exception 'FAIL: payment movement not recorded'; end if;
 if public.stripe_settle_event('evt_test_paid_1','checkout.session.completed','cs_test_paid_1','paid',20000,'PHP')<>'duplicate' then raise exception 'FAIL: replayed event not deduplicated'; end if;
 if public.stripe_settle_event('evt_test_paid_2','checkout.session.async_payment_succeeded','cs_test_paid_1','paid',20000,'PHP')<>'already_paid' then raise exception 'FAIL: second success double-consumed stock'; end if;
 if public.stripe_settle_event('evt_test_expired_paid','checkout.session.expired','cs_test_paid_1','expired',20000,'PHP')<>'not_releasable' then raise exception 'FAIL: expiry released a paid order'; end if;
 if (select on_hand||'/'||reserved from public.inventory where product_id='30000000-0000-4000-8000-000000000003' and market='PH')<>'8/1' then raise exception 'FAIL: stock moved after payment'; end if;
 if public.stripe_settle_event('evt_test_failed_1','checkout.session.expired','cs_test_failed_1','expired',10000,'PHP')<>'released' then raise exception 'FAIL: expired session not released'; end if;
 if (select status||'/'||payment_status from public.orders where stripe_checkout_session_id='cs_test_failed_1')<>'cancelled/failed' then raise exception 'FAIL: expired order not cancelled'; end if;
 if (select on_hand||'/'||reserved from public.inventory where product_id='30000000-0000-4000-8000-000000000003' and market='PH')<>'8/0' then raise exception 'FAIL: expired hold not returned to stock'; end if;
 if public.stripe_settle_event('evt_test_unknown','checkout.session.completed','cs_test_missing','paid',20000,'PHP')<>'unknown_session' then raise exception 'FAIL: unknown session accepted'; end if;
 if public.stripe_settle_event('evt_test_ignored','checkout.session.completed','cs_test_paid_1','ignored',0,'PHP')<>'ignored' then raise exception 'FAIL: ignored outcome changed state'; end if;
 begin
  perform public.stripe_settle_event('evt_test_bad','checkout.session.completed','cs_test_paid_1','refunded',20000,'PHP');
  raise exception 'FAIL: invalid outcome accepted';
 exception when raise_exception then if SQLERRM<>'Invalid payment outcome' then raise; end if; end;
end $$;
reset role;

-- Browser roles cannot settle payments.
set local role authenticated;
do $$ begin
 begin
  perform public.stripe_settle_event('evt_test_browser','checkout.session.completed','cs_test_paid_1','paid',20000,'PHP');
  raise exception 'FAIL: browser role settled a payment';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: Stripe session attachment, amount verification, paid stock consumption, webhook replay protection, expiry release, unknown sessions and browser denial; fixtures rolled back' as result;
