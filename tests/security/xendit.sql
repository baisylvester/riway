-- Xendit acceptance suite. Synthetic fixtures only; everything is rolled back.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ begin
 if (select prosecdef from pg_proc where oid='public.xendit_payment_status(uuid)'::regprocedure)
  or (select prosecdef from pg_proc where oid='public.staff_xendit_payments()'::regprocedure)
  or (select prosecdef from pg_proc where oid='public.set_xendit_market_account(text,boolean,text,text,text,text[],boolean)'::regprocedure) then
  raise exception 'FAIL: exposed Xendit entry points are security definer'; end if;
 if has_function_privilege('anon','public.prepare_xendit_payment(uuid,uuid,boolean,text,text)','execute')
  or has_function_privilege('authenticated','public.apply_xendit_payment_event(text,uuid,uuid,text,boolean,bigint,text,text,text)','execute')
  or has_function_privilege('authenticated','public.xendit_payment_context(uuid)','execute') then
  raise exception 'FAIL: browser can reach service-only Xendit functions'; end if;
end $$;
do $$ declare u uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); admin uuid:=gen_random_uuid(); sg uuid:=gen_random_uuid(); n integer; begin
 perform set_config('xendit_qa.user',u::text,true); perform set_config('xendit_qa.product',p::text,true);
 perform set_config('xendit_qa.admin',admin::text,true); perform set_config('xendit_qa.sg',sg::text,true);
 insert into auth.users(id,email) values(u,'riway-xendit-qa-'||u::text||'@example.invalid'),(d,'riway-xendit-qa-'||d::text||'@example.invalid'),
  (admin,'riway-xendit-qa-'||admin::text||'@example.invalid'),(sg,'riway-xendit-qa-'||sg::text||'@example.invalid');
 insert into public.staff_roles(user_id,market,role) values(admin,'PH','admin'),(sg,'SG','admin');
 insert into public.distributor_profiles(user_id,external_member_id,code,display_name,active,verified_at,market)
 values(d,d::text,'QA-'||d::text,'Temporary Xendit QA sponsor',true,now(),'PH');
 insert into public.sponsor_attributions(user_id,distributor_id) values(u,d);
 insert into public.products(id,slug,name,category,status) values(p,'xendit-qa-'||p::text,'Temporary QA product','Nutrition','published');
 insert into public.product_offers(product_id,market,currency,retail_minor,regulatory_approved,approval_reference,max_quantity)
 values(p,'PH','PHP',10000,true,'ROLLBACK-QA-ONLY',6);
 insert into public.inventory(product_id,market,on_hand) values(p,'PH',50);
 update public.markets set online_sales_approved=true,payments_ready=true,policy_reference='ROLLBACK-QA-ONLY' where code='PH';
 insert into private.xendit_market_accounts(market,livemode,account_type,enabled_channels,payments_enabled)
 values('PH',false,'MASTER','{GCASH,BPI_ONLINE_BANKING}',true)
 on conflict(market,livemode) do update set
  account_type=excluded.account_type,sub_account_id=null,account_status=null,
  enabled_channels=excluded.enabled_channels,payments_enabled=excluded.payments_enabled;
end $$;

-- Browser boundary.
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('xendit_qa.user'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
do $$ declare oid uuid; n integer; begin
 for n in 1..8 loop
  oid:=public.create_order('PH',jsonb_build_array(jsonb_build_object('productId',current_setting('xendit_qa.product'),'quantity',case when n=1 then 2 else 1 end)),
   '{"full_name":"Temporary QA Customer","phone":"0000000000","line1":"Temporary QA address","city":"Manila","postal_code":"1000","country":"PH"}'::jsonb,gen_random_uuid(),'2026-11-draft');
  perform set_config('xendit_qa.order'||n,oid::text,true);
 end loop;
 begin
  perform public.prepare_xendit_payment(current_setting('xendit_qa.order1')::uuid,current_setting('xendit_qa.user')::uuid,false,'https://example.invalid','GCASH');
  raise exception 'FAIL: browser can prepare payment';
 exception when insufficient_privilege then null; end;
 begin
  perform public.apply_xendit_payment_event('forged',gen_random_uuid(),current_setting('xendit_qa.order1')::uuid,'ps-forged01',false,20000,'PHP','COMPLETED','py-forged');
  raise exception 'FAIL: browser can mark paid';
 exception when insufficient_privilege then null; end;
 begin
  perform public.set_xendit_market_account('PH',false,'OWNED','attacker_account_01','LIVE','{GCASH}',true);
  raise exception 'FAIL: customer can change payment routing';
 exception when insufficient_privilege then null; end;
 begin perform 1 from private.xendit_payments; raise exception 'FAIL: browser can read private payment state'; exception when insufficient_privilege then null; end;
 if public.xendit_checkout_channels('PH',false)<>'{GCASH,BPI_ONLINE_BANKING}'::text[] then raise exception 'FAIL: enabled channels not readable for checkout'; end if;
 if cardinality(public.xendit_checkout_channels('MY',false))<>0 then raise exception 'FAIL: unconfigured market exposes channels'; end if;
end $$;
reset role;

set local role service_role;
do $$ declare c jsonb; c2 jsonb; n integer; begin
 -- Ownership, channel and routing gates.
 begin
  perform public.prepare_xendit_payment(current_setting('xendit_qa.order1')::uuid,gen_random_uuid(),false,'https://example.invalid','GCASH');
  raise exception 'FAIL: owner mismatch accepted';
 exception when raise_exception then if SQLERRM<>'Order unavailable' then raise; end if; end;
 begin
  perform public.prepare_xendit_payment(current_setting('xendit_qa.order1')::uuid,current_setting('xendit_qa.user')::uuid,false,'https://example.invalid','PAYMAYA');
  raise exception 'FAIL: disabled channel accepted';
 exception when raise_exception then if SQLERRM<>'Payment channel unavailable' then raise; end if; end;
 begin
  perform public.prepare_xendit_payment(current_setting('xendit_qa.order1')::uuid,current_setting('xendit_qa.user')::uuid,true,'https://example.invalid','GCASH');
  raise exception 'FAIL: live payment without live routing accepted';
 exception when raise_exception then if SQLERRM<>'Xendit is not enabled for this market' then raise; end if; end;

 -- Snapshot and duplicate-click replay.
 c:=public.prepare_xendit_payment(current_setting('xendit_qa.order1')::uuid,current_setting('xendit_qa.user')::uuid,false,'https://example.invalid','GCASH');
 if c->>'phase'<>'preparing' or (c->>'amount')::bigint<>20000 or c->>'currency'<>'PHP' or c->>'country'<>'PH'
  or c->>'channel'<>'GCASH' or c->'subAccountId'<>'null'::jsonb or (c->>'attemptNo')::int<>1 then raise exception 'FAIL: incorrect payment snapshot %',c; end if;
 c2:=public.prepare_xendit_payment(current_setting('xendit_qa.order1')::uuid,current_setting('xendit_qa.user')::uuid,false,'https://other.invalid','GCASH');
 if c2->>'id'<>c->>'id' or c2->>'origin'<>'https://example.invalid' then raise exception 'FAIL: duplicate submission created a second attempt'; end if;
 perform set_config('xendit_qa.attempt1',c->>'id',true);
 begin
  perform public.prepare_stripe_checkout(current_setting('xendit_qa.order1')::uuid,current_setting('xendit_qa.user')::uuid,false,'https://example.invalid');
  raise exception 'FAIL: second gateway started on the same order';
 exception when raise_exception then if SQLERRM<>'Another payment gateway is in use for this order' then raise; end if; end;
 begin
  perform public.bind_xendit_payment((c->>'id')::uuid,'ps-qa000001','https://evil.example/sessions/ps-qa000001');
  raise exception 'FAIL: foreign checkout host accepted';
 exception when raise_exception then if SQLERRM<>'Invalid Xendit session' then raise; end if; end;
 if public.bind_xendit_payment((c->>'id')::uuid,'ps-qa000001','https://checkout-staging.xendit.co/sessions/ps-qa000001')<>'open' then raise exception 'FAIL: bind'; end if;

 -- Tampered amount, currency and mode are rejected.
 begin
  perform public.apply_xendit_payment_event('tamper-1',(c->>'id')::uuid,current_setting('xendit_qa.order1')::uuid,'ps-qa000001',false,1,'PHP','COMPLETED','py-qa1');
  raise exception 'FAIL: tampered amount accepted';
 exception when raise_exception then if SQLERRM<>'Payment does not match order' then raise; end if; end;
 begin
  perform public.apply_xendit_payment_event('tamper-2',(c->>'id')::uuid,current_setting('xendit_qa.order1')::uuid,'ps-qa000001',false,20000,'SGD','COMPLETED','py-qa1');
  raise exception 'FAIL: tampered currency accepted';
 exception when raise_exception then if SQLERRM<>'Payment does not match order' then raise; end if; end;
 begin
  perform public.apply_xendit_payment_event('tamper-3',(c->>'id')::uuid,current_setting('xendit_qa.order1')::uuid,'ps-qa000001',true,20000,'PHP','COMPLETED','py-qa1');
  raise exception 'FAIL: live/test mismatch accepted';
 exception when raise_exception then if SQLERRM<>'Payment does not match order' then raise; end if; end;
 begin
  perform public.apply_xendit_payment_event('tamper-4',(c->>'id')::uuid,current_setting('xendit_qa.order2')::uuid,'ps-qa000001',false,20000,'PHP','COMPLETED','py-qa1');
  raise exception 'FAIL: attempt applied to another order';
 exception when raise_exception then if SQLERRM<>'Payment does not match order' then raise; end if; end;

 -- Success, duplicate delivery and out-of-order expiry.
 if public.apply_xendit_payment_event('payment_session.completed:ps-qa000001',(c->>'id')::uuid,current_setting('xendit_qa.order1')::uuid,'ps-qa000001',false,20000,'PHP','COMPLETED','py-qa1')<>'paid' then raise exception 'FAIL: payment not applied'; end if;
 if public.apply_xendit_payment_event('payment_session.completed:ps-qa000001',(c->>'id')::uuid,current_setting('xendit_qa.order1')::uuid,'ps-qa000001',false,20000,'PHP','COMPLETED','py-qa1')<>'duplicate' then raise exception 'FAIL: duplicate event reapplied'; end if;
 if public.apply_xendit_payment_event('poll-late',(c->>'id')::uuid,current_setting('xendit_qa.order1')::uuid,'ps-qa000001',false,20000,'PHP','COMPLETED','py-qa1')<>'paid' then raise exception 'FAIL: repeated success changed state'; end if;
 if public.apply_xendit_payment_event('payment_session.expired:ps-qa000001',(c->>'id')::uuid,current_setting('xendit_qa.order1')::uuid,'ps-qa000001',false,20000,'PHP','EXPIRED',null)<>'paid' then raise exception 'FAIL: out-of-order expiry regressed paid'; end if;

 -- Expiry releases stock once; a late success is flagged, never fulfilled.
 c:=public.prepare_xendit_payment(current_setting('xendit_qa.order2')::uuid,current_setting('xendit_qa.user')::uuid,false,'https://example.invalid','BPI_ONLINE_BANKING');
 perform set_config('xendit_qa.attempt2',c->>'id',true);
 perform public.bind_xendit_payment((c->>'id')::uuid,'ps-qa000002','https://checkout-staging.xendit.co/sessions/ps-qa000002');
 if public.apply_xendit_payment_event('payment_session.expired:ps-qa000002',(c->>'id')::uuid,current_setting('xendit_qa.order2')::uuid,'ps-qa000002',false,10000,'PHP','EXPIRED',null)<>'expired' then raise exception 'FAIL: expiry'; end if;
 if public.apply_xendit_payment_event('late-success',(c->>'id')::uuid,current_setting('xendit_qa.order2')::uuid,'ps-qa000002',false,10000,'PHP','COMPLETED','py-late')<>'review' then raise exception 'FAIL: late success not flagged'; end if;

 -- Channel switch: old session confirmed cancelled, stock hold kept, new attempt.
 c:=public.prepare_xendit_payment(current_setting('xendit_qa.order3')::uuid,current_setting('xendit_qa.user')::uuid,false,'https://example.invalid','GCASH');
 perform public.bind_xendit_payment((c->>'id')::uuid,'ps-qa000003','https://checkout-staging.xendit.co/sessions/ps-qa000003');
 begin
  perform public.supersede_xendit_payment((c->>'id')::uuid,'ps-wrong003');
  raise exception 'FAIL: supersede with wrong session';
 exception when raise_exception then if SQLERRM<>'Session mismatch' then raise; end if; end;
 if public.supersede_xendit_payment((c->>'id')::uuid,'ps-qa000003')<>'canceled' then raise exception 'FAIL: supersede'; end if;
 c2:=public.prepare_xendit_payment(current_setting('xendit_qa.order3')::uuid,current_setting('xendit_qa.user')::uuid,false,'https://example.invalid','BPI_ONLINE_BANKING');
 if (c2->>'attemptNo')::int<>2 or c2->>'channel'<>'BPI_ONLINE_BANKING' or c2->>'phase'<>'preparing' then raise exception 'FAIL: switched attempt'; end if;
 if not exists(select 1 from public.inventory_reservations where order_id=current_setting('xendit_qa.order3')::uuid) then raise exception 'FAIL: switch released stock'; end if;
 perform public.bind_xendit_payment((c2->>'id')::uuid,'ps-qa000033','https://checkout-staging.xendit.co/sessions/ps-qa000033');
 -- Race: the customer paid the old session just before it was cancelled, then the new one too.
 if public.apply_xendit_payment_event('race-old',(c->>'id')::uuid,current_setting('xendit_qa.order3')::uuid,'ps-qa000003',false,10000,'PHP','COMPLETED','py-old')<>'paid' then raise exception 'FAIL: first success not applied'; end if;
 if public.apply_xendit_payment_event('race-new',(c2->>'id')::uuid,current_setting('xendit_qa.order3')::uuid,'ps-qa000033',false,10000,'PHP','COMPLETED','py-new')<>'review' then raise exception 'FAIL: excess payment not flagged'; end if;
 if (select attention from private.xendit_payments where id=(c2->>'id')::uuid) not like 'Additional payment%' then raise exception 'FAIL: excess payment reason'; end if;

 -- A session created by a lost (timed-out) request is never bound or fulfilled.
 c:=public.prepare_xendit_payment(current_setting('xendit_qa.order4')::uuid,current_setting('xendit_qa.user')::uuid,false,'https://example.invalid','GCASH');
 perform public.bind_xendit_payment((c->>'id')::uuid,'ps-qa000004','https://checkout-staging.xendit.co/sessions/ps-qa000004');
 if public.apply_xendit_payment_event('orphan-exp',(c->>'id')::uuid,current_setting('xendit_qa.order4')::uuid,'ps-orphan04',false,10000,'PHP','EXPIRED',null)<>'ignored' then raise exception 'FAIL: orphan expiry applied'; end if;
 if (select status from public.orders where id=current_setting('xendit_qa.order4')::uuid)<>'awaiting_payment' then raise exception 'FAIL: orphan expiry cancelled order'; end if;
 if public.apply_xendit_payment_event('orphan-paid',(c->>'id')::uuid,current_setting('xendit_qa.order4')::uuid,'ps-orphan04',false,10000,'PHP','COMPLETED','py-orphan')<>'review' then raise exception 'FAIL: orphan payment not flagged'; end if;

 -- Order 5 keeps an open attempt (local expiry must not release it).
 c:=public.prepare_xendit_payment(current_setting('xendit_qa.order5')::uuid,current_setting('xendit_qa.user')::uuid,false,'https://example.invalid','GCASH');
 perform set_config('xendit_qa.attempt5',c->>'id',true);
 -- Order 6 is abandoned: its only session was confirmed cancelled long ago.
 c:=public.prepare_xendit_payment(current_setting('xendit_qa.order6')::uuid,current_setting('xendit_qa.user')::uuid,false,'https://example.invalid','GCASH');
 perform public.bind_xendit_payment((c->>'id')::uuid,'ps-qa000006','https://checkout-staging.xendit.co/sessions/ps-qa000006');
 perform public.supersede_xendit_payment((c->>'id')::uuid,'ps-qa000006');
 -- Xendit refused creation: the attempt closes and another channel can start.
 c:=public.prepare_xendit_payment(current_setting('xendit_qa.order8')::uuid,current_setting('xendit_qa.user')::uuid,false,'https://example.invalid','GCASH');
 begin
  perform public.reject_xendit_payment((c->>'id')::uuid,'bad code');
  raise exception 'FAIL: unsanitized rejection code accepted';
 exception when raise_exception then if SQLERRM<>'Invalid rejection' then raise; end if; end;
 if public.reject_xendit_payment((c->>'id')::uuid,'CHANNEL_NOT_ACTIVATED')<>'canceled' then raise exception 'FAIL: refused creation not closed'; end if;
 c2:=public.prepare_xendit_payment(current_setting('xendit_qa.order8')::uuid,current_setting('xendit_qa.user')::uuid,false,'https://example.invalid','BPI_ONLINE_BANKING');
 if (c2->>'attemptNo')::int<>2 or c2->>'phase'<>'preparing' then raise exception 'FAIL: no new attempt after refusal'; end if;
 perform set_config('xendit_qa.attempt8',c2->>'id',true);
 -- A bound session cannot be closed as refused.
 if public.reject_xendit_payment((select id from private.xendit_payments where order_id=current_setting('xendit_qa.order4')::uuid),'CHANNEL_NOT_ACTIVATED')<>'review' then raise exception 'FAIL: bound attempt closed as refused'; end if;
 -- Reconciliation queue claims only payable attempts, at most once per window.
 select count(*) into n from public.pending_xendit_payments(false);
 if n<1 then raise exception 'FAIL: reconciliation queue empty'; end if;
 if exists(select 1 from public.pending_xendit_payments(false)) then raise exception 'FAIL: reconciliation claimed twice'; end if;
end $$;
reset role;

do $$ begin
 -- Stock: 50 on hand; order1 (2) and order3 (1) paid once each.
 if (select on_hand from public.inventory where product_id=current_setting('xendit_qa.product')::uuid and market='PH')<>47 then raise exception 'FAIL: paid stock not deducted exactly once'; end if;
 if (select payment_status from public.orders where id=current_setting('xendit_qa.order1')::uuid)<>'paid' then raise exception 'FAIL: payment status regressed'; end if;
 if (select status from public.orders where id=current_setting('xendit_qa.order2')::uuid)<>'cancelled'
  or exists(select 1 from public.inventory_reservations where order_id=current_setting('xendit_qa.order2')::uuid) then raise exception 'FAIL: expiry did not release order'; end if;
 update private.xendit_payments set updated_at=now()-interval '20 minutes' where order_id=current_setting('xendit_qa.order6')::uuid;
 -- Order 8's second attempt never got a confirmed session and its expiry passed.
 update private.xendit_payments set expires_at=now()-interval '10 minutes' where id=current_setting('xendit_qa.attempt8')::uuid;
 update private.xendit_payments set updated_at=now()-interval '20 minutes' where order_id=current_setting('xendit_qa.order8')::uuid and phase='canceled';
 update public.inventory_reservations set expires_at=now()-interval '1 minute' where order_id=current_setting('xendit_qa.order5')::uuid;
end $$;
set local role service_role;
do $$ begin
 perform public.release_expired_reservations();
 if (select status from public.orders where id=current_setting('xendit_qa.order5')::uuid)<>'awaiting_payment' then raise exception 'FAIL: open Xendit stock released by local expiry'; end if;
 if public.release_abandoned_xendit_orders()<>2 then raise exception 'FAIL: abandoned orders not released'; end if;
 if (select phase from private.xendit_payments where id=current_setting('xendit_qa.attempt8')::uuid)<>'expired'
  or (select status from public.orders where id=current_setting('xendit_qa.order8')::uuid)<>'cancelled'
  or exists(select 1 from public.inventory_reservations where order_id=current_setting('xendit_qa.order8')::uuid) then raise exception 'FAIL: unconfirmed expired attempt kept stock'; end if;
 if (select status from public.orders where id=current_setting('xendit_qa.order5')::uuid)<>'awaiting_payment' then raise exception 'FAIL: sweep released an attempt that has not expired'; end if;
 if (select status from public.orders where id=current_setting('xendit_qa.order6')::uuid)<>'cancelled' then raise exception 'FAIL: abandoned order still open'; end if;
 if (select status from public.orders where id=current_setting('xendit_qa.order3')::uuid)<>'paid' then raise exception 'FAIL: sweep touched a paid order'; end if;
end $$;
reset role;

-- Owner reads own status; cancellation is refused once a payment started.
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('xendit_qa.user'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
do $$ begin
 if public.xendit_payment_status(current_setting('xendit_qa.order1')::uuid)->>'phase'<>'paid' then raise exception 'FAIL: owner cannot read own status'; end if;
 if public.xendit_payment_status(current_setting('xendit_qa.order3')::uuid)->>'phase'<>'paid' then raise exception 'FAIL: status should prefer the paid attempt'; end if;
 if jsonb_array_length(public.staff_xendit_payments())<>0 then raise exception 'FAIL: customer can read staff payment records'; end if;
 begin
  perform public.cancel_order(current_setting('xendit_qa.order5')::uuid);
  raise exception 'FAIL: order with a Xendit attempt cancelled locally';
 exception when serialization_failure then null; end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
do $$ begin if public.xendit_payment_status(current_setting('xendit_qa.order1')::uuid) is not null then raise exception 'FAIL: other customer payment exposed'; end if; end $$;
reset role;

-- Tenant isolation and routing administration.
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('xendit_qa.sg'),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
do $$ begin
 if exists(select 1 from jsonb_array_elements(public.staff_xendit_payments()) x where x->>'market'='PH') then raise exception 'FAIL: SG staff can read PH payments'; end if;
 if exists(select 1 from jsonb_array_elements(public.staff_xendit_market_accounts()) x where x->>'market'='PH') then raise exception 'FAIL: SG staff can read PH routing'; end if;
 begin
  perform public.set_xendit_market_account('PH',false,'OWNED','sg_controlled_0001','LIVE','{GCASH}',true);
  raise exception 'FAIL: another market admin changed PH routing';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('xendit_qa.admin'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
do $$ begin
 begin
  perform public.set_xendit_market_account('PH',false,'MASTER',null,null,'{GCASH}',true);
  raise exception 'FAIL: routing changed without MFA';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('xendit_qa.admin'),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
do $$ begin
 if jsonb_array_length(public.staff_xendit_payments())<1 then raise exception 'FAIL: PH admin cannot read PH payments'; end if;
 begin
  perform public.set_xendit_market_account('PH',false,'OWNED','qa_sub_account_01','PENDING_VERIFICATION','{GCASH}',true);
  raise exception 'FAIL: non-LIVE sub-account enabled for payments';
 exception when check_violation then null; end;
 begin
  perform public.set_xendit_market_account('PH',true,'MASTER',null,null,'{GCASH}',true);
  raise exception 'FAIL: live payments routed to the master account';
 exception when check_violation then null; end;
 perform public.set_xendit_market_account('PH',true,'OWNED','qa_live_sub_ph01','LIVE','{GCASH}',false);
 perform public.set_xendit_market_account('PH',false,'OWNED','qa_sub_account_01','LIVE','{GCASH,BPI_ONLINE_BANKING}',true);
end $$;
reset role;
set local role service_role;
do $$ declare c jsonb; begin
 -- New attempts snapshot the new routing; existing attempts keep theirs.
 c:=public.prepare_xendit_payment(current_setting('xendit_qa.order7')::uuid,current_setting('xendit_qa.user')::uuid,false,'https://example.invalid','GCASH');
 if c->>'subAccountId'<>'qa_sub_account_01' then raise exception 'FAIL: sub-account routing not applied'; end if;
 if public.xendit_payment_context(current_setting('xendit_qa.attempt5')::uuid)->'subAccountId'<>'null'::jsonb then raise exception 'FAIL: routing change moved an existing attempt'; end if;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.audit_logs where action='XENDIT_ROUTING_TEST:PH') then raise exception 'FAIL: routing change not audited'; end if;
end $$;
rollback;
select 'PASS: Xendit service-only transitions, channel/routing gates, duplicate submission replay, single gateway per order, checkout host allowlist, amount/currency/mode/order matching, deduplicated and out-of-order events, expiry release, late and excess payment review, orphan session handling, refused creation, unconfirmed-expiry release, channel switch, abandoned release, local-expiry protection, owner/tenant isolation, MFA admin routing with LIVE sub-account rule, sub-account-only live routing and audit; all fixtures rolled back' as result;
