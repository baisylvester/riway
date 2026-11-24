-- Paid-order confirmation and corporate low-stock alert acceptance. Every
-- user, order, payment, subscription and job is a synthetic fixture and rolls back.
begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
select set_config('request.jwt.claims','{}',true);
do $$ declare ops uuid:=gen_random_uuid(); wrong uuid:=gen_random_uuid(); editor uuid:=gen_random_uuid();
 u uuid:=gen_random_uuid(); sponsor uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); q uuid:=gen_random_uuid(); begin
 insert into auth.users(id,email) select x,'confirm-qa-'||x||'@example.invalid' from unnest(array[ops,wrong,editor,u,sponsor]) x;
 insert into public.staff_roles(user_id,market,role) values(ops,'PH','operations'),(wrong,'SG','operations'),(editor,'PH','editor');
 insert into public.distributor_profiles(user_id,external_member_id,code,display_name,active,verified_at,market)
 values(sponsor,'QA-CONFIRM-'||sponsor,'QC-'||substr(sponsor::text,1,8),'Sample sponsor',true,now(),'PH');
 insert into public.sponsor_attributions(user_id,distributor_id) values(u,sponsor);
 insert into public.products(id,slug,name,category,status) values(p,'confirm-qa-'||p,'Sample confirmation product','Nutrition','published'),
  (q,'confirm-qa-'||q,'Sample well-stocked product','Nutrition','published');
 insert into public.product_offers(product_id,market,currency,retail_minor,regulatory_approved,approval_reference,max_quantity)
 values(p,'PH','PHP',100,true,'ROLLBACK-QA',24);
 insert into public.inventory(product_id,market,on_hand,low_stock_threshold) values(p,'PH',6,5),(q,'PH',100,5);
 update public.markets set online_sales_approved=true,payments_ready=true,policy_reference='ROLLBACK-QA' where code='PH';
 perform set_config('confirm_qa.ops',ops::text,true); perform set_config('confirm_qa.wrong',wrong::text,true);
 perform set_config('confirm_qa.editor',editor::text,true); perform set_config('confirm_qa.customer',u::text,true);
 perform set_config('confirm_qa.product',p::text,true);
 perform set_config('confirm_qa.cart',jsonb_build_array(jsonb_build_object('productId',p,'quantity',2))::text,true);
 perform set_config('confirm_qa.delivery','{"full_name":"Sample QA customer","phone":"0000000000","line1":"Sample QA address","city":"Manila","postal_code":"1000","country":"PH"}',true);
 perform set_config('confirm_qa.terms',(select checkout_terms_version from public.markets where code='PH'),true);
 if has_table_privilege('authenticated','private.inventory_alert_subscriptions','select,insert,update,delete')
 or has_table_privilege('service_role','private.inventory_alert_subscriptions','select,insert,update,delete')
 or has_function_privilege('anon','public.set_inventory_alert_subscription(text,boolean)','execute')
 or has_function_privilege('authenticated','public.queue_corporate_low_stock(date)','execute')
 or has_function_privilege('authenticated','private.queue_corporate_low_stock_for(date)','execute')
 or has_function_privilege('service_role','private.queue_corporate_low_stock_for(date)','execute')
 or has_function_privilege('authenticated','private.enqueue_order_confirmation()','execute') then raise exception 'FAIL: grants'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in ('my_inventory_alert_subscriptions','set_inventory_alert_subscription','queue_corporate_low_stock') and p.prosecdef) then
  raise exception 'FAIL: exposed definer'; end if;
end $$;

-- Two orders; only order1 is paid through the real Stripe settlement path.
set local role authenticated;
do $$ declare i integer; begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('confirm_qa.customer'),'role','authenticated','aal','aal1')::text,true);
 for i in 1..2 loop
  perform set_config('confirm_qa.order'||i,public.create_commerce_order('PH',current_setting('confirm_qa.cart')::jsonb,
   current_setting('confirm_qa.delivery')::jsonb,gen_random_uuid(),current_setting('confirm_qa.terms'))::text,true);
 end loop;
end $$;
reset role;
do $$ begin
 if exists(select 1 from private.notification_jobs where kind='order_confirmed') then raise exception 'FAIL: confirmation before payment'; end if;
end $$;
set local role service_role;
do $$ declare c jsonb; oid uuid:=current_setting('confirm_qa.order1')::uuid; begin
 c:=public.prepare_stripe_checkout(oid,current_setting('confirm_qa.customer')::uuid,false,'https://example.invalid');
 if public.apply_stripe_checkout_event('evt_confirm_'||oid,(c->>'id')::uuid,oid,'cs_test_confirm1',false,200,'php','complete','paid','pi_confirm1')<>'paid' then
  raise exception 'FAIL: fixture payment'; end if;
 -- A duplicate provider event must not queue a second confirmation.
 perform public.apply_stripe_checkout_event('evt_confirm_'||oid,(c->>'id')::uuid,oid,'cs_test_confirm1',false,200,'php','complete','paid','pi_confirm1');
end $$;
reset role;

do $$ declare j private.notification_jobs; tok uuid:=gen_random_uuid(); ok boolean; begin
 if (select count(*) from private.notification_jobs where kind='order_confirmed')<>1 then raise exception 'FAIL: exactly one confirmation'; end if;
 select * into j from private.notification_jobs where kind='order_confirmed';
 if j.reference<>current_setting('confirm_qa.order1')::uuid or j.user_id<>current_setting('confirm_qa.customer')::uuid then raise exception 'FAIL: confirmation target'; end if;
 if j.context->>'currency'<>'PHP' or (j.context->>'totalMinor')::bigint<>200 or jsonb_array_length(j.context->'items')<>1
  or (j.context->'items'->0->>'quantity')::int<>2 or j.context->'items'->0->>'name'<>'Sample confirmation product' then
  raise exception 'FAIL: confirmation snapshot %',j.context; end if;
 if j.context::text ~* 'full_name|line1|postal|phone|email' then raise exception 'FAIL: personal data in job context'; end if;
 update private.notification_jobs set status='processing',lease=tok,lease_until=now()+interval '5 minutes' where id=j.id;
 perform set_config('confirm_qa.job',j.id::text,true); perform set_config('confirm_qa.token',tok::text,true);
end $$;
set local role service_role;
do $$ begin
 if public.notification_authorized(current_setting('confirm_qa.job')::uuid,current_setting('confirm_qa.token')::uuid) is not true then
  raise exception 'FAIL: paid confirmation not authorized'; end if;
end $$;
reset role;
-- If the order is later refunded before delivery, the confirmation is suppressed.
update public.orders set payment_status='refunded',status='refunded' where id=current_setting('confirm_qa.order1')::uuid;
set local role service_role;
do $$ begin
 if public.notification_authorized(current_setting('confirm_qa.job')::uuid,current_setting('confirm_qa.token')::uuid) then
  raise exception 'FAIL: refunded order confirmation authorized'; end if;
end $$;
reset role;

-- Low-stock subscriptions: only admin/operations with MFA in that market.
set local role authenticated;
do $$ declare who text; r jsonb; begin
 foreach who in array array['customer','editor','wrong'] loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('confirm_qa.'||who),'role','authenticated','aal','aal2')::text,true);
  begin
   perform public.set_inventory_alert_subscription('PH',true);
   raise exception 'FAIL: subscription by %',who;
  exception when insufficient_privilege then null; end;
 end loop;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('confirm_qa.ops'),'role','authenticated','aal','aal1')::text,true);
 begin
  perform public.set_inventory_alert_subscription('PH',true);
  raise exception 'FAIL: subscription without MFA';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('confirm_qa.ops'),'role','authenticated','aal','aal2')::text,true);
 begin
  perform public.set_inventory_alert_subscription('SG',true);
  raise exception 'FAIL: other-market subscription';
 exception when insufficient_privilege then null; end;
 r:=public.set_inventory_alert_subscription('PH',true);
 if r<>'[{"market":"PH","subscribed":true}]'::jsonb then raise exception 'FAIL: subscription result %',r; end if;
 if public.set_inventory_alert_subscription('PH',true)<>r then raise exception 'FAIL: idempotent subscribe'; end if;
end $$;
reset role;

-- order1 consumed 2 of 6 units and order2 still reserves 2, so p has 2 available
-- (threshold 5); q is well stocked. Seeded catalogue rows may also be listed.
set local role service_role;
do $$ declare d date:=(now() at time zone 'UTC')::date; begin
 begin
  perform public.queue_corporate_low_stock(d-10);
  raise exception 'FAIL: stale report day accepted';
 exception when raise_exception then if SQLERRM<>'Invalid report date' then raise; end if; end;
 if public.queue_corporate_low_stock(d)<>1 then raise exception 'FAIL: low-stock queue'; end if;
 if public.queue_corporate_low_stock(d)<>0 then raise exception 'FAIL: low-stock queue replay'; end if;
end $$;
reset role;
do $$ declare j private.notification_jobs; tok uuid:=gen_random_uuid(); begin
 select * into j from private.notification_jobs where kind='corporate_low_stock';
 if j.user_id<>current_setting('confirm_qa.ops')::uuid or j.context->>'market'<>'PH'
  or (j.context->>'lowStockCount')::int<>jsonb_array_length(j.context->'items')
  or not (j.context->'items' @> '[{"product":"Sample confirmation product","available":2,"threshold":5}]')
  or j.context->'items' @> '[{"product":"Sample well-stocked product"}]' then
  raise exception 'FAIL: low-stock context %',j.context; end if;
 update private.notification_jobs set status='processing',lease=tok,lease_until=now()+interval '5 minutes' where id=j.id;
 perform set_config('confirm_qa.job',j.id::text,true); perform set_config('confirm_qa.token',tok::text,true);
end $$;
set local role service_role;
do $$ begin
 if public.notification_authorized(current_setting('confirm_qa.job')::uuid,current_setting('confirm_qa.token')::uuid) is not true then
  raise exception 'FAIL: low-stock alert not authorized'; end if;
end $$;
reset role;
-- A revoked role suppresses delivery.
delete from public.staff_roles where user_id=current_setting('confirm_qa.ops')::uuid;
set local role service_role;
do $$ begin
 if public.notification_authorized(current_setting('confirm_qa.job')::uuid,current_setting('confirm_qa.token')::uuid) then
  raise exception 'FAIL: revoked staff alert authorized'; end if;
end $$;
reset role;
rollback;
