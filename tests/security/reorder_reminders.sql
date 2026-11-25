begin;
set local lock_timeout='5s';set local statement_timeout='45s';
select set_config('request.jwt.claims','{}',true);
do $$declare u uuid:=gen_random_uuid();p uuid:=gen_random_uuid();o uuid:=gen_random_uuid();s uuid:=gen_random_uuid();begin
 insert into auth.users(id,email,email_confirmed_at)values(u,'reorder-qa-'||u||'@example.invalid',now());
 insert into auth.users(id,email)values(s,'reorder-sponsor-'||s||'@example.invalid');
 insert into public.distributor_profiles(user_id,external_member_id,code,display_name,market,active,verified_at)values(s,'QA-'||s,'Q'||replace(s::text,'-',''),'QA sponsor','PH',true,now());
 insert into public.sponsor_attributions(user_id,distributor_id)values(u,s);
 insert into public.products(id,slug,name,category,status,replenishment_days,replenishment_reference,reorder_lead_days,reorder_timing_reference)
 values(p,'reorder-qa-'||p,'QA reorder product','Nutrition','published',30,'QA-CYCLE',3,'QA-TIMING');
 insert into public.product_offers(product_id,market,currency,retail_minor,regulatory_approved,approval_reference)values(p,'PH','PHP',100,true,'QA-APPROVED');
 insert into public.inventory(product_id,market,on_hand,reserved)values(p,'PH',10,0);
 update public.markets set online_sales_approved=true,payments_ready=true,policy_reference='ROLLBACK-QA'where code='PH';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','aal','aal1')::text,true);
 insert into public.orders(id,user_id,sponsor_id,market,currency,total_minor,status,payment_status,address,idempotency_key,request_hash,terms_version,created_at)
 values(o,u,s,'PH','PHP',100,'paid','paid','{"full_name":"QA buyer","phone":"0000000000","line1":"QA fixture address","city":"Manila","postal_code":"1000","country":"PH"}',gen_random_uuid(),'qa-reorder','QA-TERMS',now()-interval '28 days');
 insert into public.order_items(order_id,product_id,product_name,quantity,unit_minor)values(o,p,'QA reorder product',1,100);
 perform set_config('reorder.user',u::text,true);perform set_config('reorder.product',p::text,true);perform set_config('reorder.order',o::text,true);
 if public.queue_reorder_reminders()<>0 then raise exception 'FAIL: no consent';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('reorder.user'),'role','authenticated','aal','aal1')::text,true);
do $$begin
 if (public.my_reorder_preference()->>'emailEnabled')::boolean then raise exception 'FAIL: default optin';end if;
 begin perform public.set_reorder_preference(true,0,'old-version');raise exception 'FAIL: old consent';exception when invalid_parameter_value then null;end;
 perform public.set_reorder_preference(true,0,'reorder-email-v1');
 begin perform public.set_reorder_preference(false,0,'reorder-email-v1');raise exception 'FAIL: stale preference';exception when serialization_failure then null;end;
end $$;
reset role;
do $$declare j private.notification_jobs;u uuid:=current_setting('reorder.user')::uuid;begin
 perform public.queue_reorder_reminders();perform public.queue_reorder_reminders();
 if (select count(*)from private.reorder_reminders where user_id=u)<>1 then raise exception 'FAIL: reorder dedup';end if;
 select * into j from private.notification_jobs where user_id=u and kind='reorder_reminder';
 if j.id is null then raise exception 'FAIL: missing reorder notification';end if;
 update private.notification_jobs set status='processing',lease=gen_random_uuid(),lease_until=now()+interval '5 minutes'where id=j.id returning * into j;
 if not public.notification_authorized(j.id,j.lease)then raise exception 'FAIL: authorized reminder refused';end if;
 update public.inventory set on_hand=0 where product_id=current_setting('reorder.product')::uuid;
 if public.notification_authorized(j.id,j.lease)then raise exception 'FAIL: out of stock reminder';end if;
 update public.inventory set on_hand=10 where product_id=current_setting('reorder.product')::uuid;
 perform public.unsubscribe_reorder((j.context->>'unsubscribeToken')::uuid);
 if public.notification_authorized(j.id,j.lease)then raise exception 'FAIL: optout ignored';end if;
 if (select email_enabled from private.reorder_preferences where user_id=u)then raise exception 'FAIL: unsubscribe';end if;
 perform public.unsubscribe_reorder(gen_random_uuid()); -- invalid token reveals nothing
 if has_table_privilege('authenticated','private.reorder_preferences','select')or has_function_privilege('authenticated','public.queue_reorder_reminders()','execute')then raise exception 'FAIL: reminder grants';end if;
end $$;
rollback;
