-- Scheduled sales report acceptance. Fixtures, payments, jobs and audit rows
-- roll back. A fixed Monday and month start are used through the internal
-- queue function, so the result does not depend on today's date.
begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
select set_config('request.jwt.claims','{}',true);
do $$ declare ops uuid:=gen_random_uuid(); admin uuid:=gen_random_uuid(); sg_ops uuid:=gen_random_uuid(); editor uuid:=gen_random_uuid();
 u uuid:=gen_random_uuid(); sponsor uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); begin
 insert into auth.users(id,email) select x,'sched-qa-'||x||'@example.invalid' from unnest(array[ops,admin,sg_ops,editor,u,sponsor]) x;
 insert into public.staff_roles(user_id,market,role) values(ops,'PH','operations'),(admin,'PH','admin'),(sg_ops,'SG','operations'),(editor,'PH','editor');
 insert into public.distributor_profiles(user_id,external_member_id,code,display_name,active,verified_at,market)
 values(sponsor,'QA-SCHED-'||sponsor,'QD-'||substr(sponsor::text,1,8),'Sample sponsor',true,now(),'PH');
 insert into public.sponsor_attributions(user_id,distributor_id) values(u,sponsor);
 insert into public.products(id,slug,name,category,status) values(p,'sched-qa-'||p,'Scheduled report product','Nutrition','published');
 insert into public.product_offers(product_id,market,currency,retail_minor,regulatory_approved,approval_reference,max_quantity)
 values(p,'PH','PHP',100,true,'ROLLBACK-QA',24);
 insert into public.inventory(product_id,market,on_hand) values(p,'PH',100);
 update public.markets set online_sales_approved=true,payments_ready=true,policy_reference='ROLLBACK-QA' where code='PH';
 perform set_config('sched_qa.ops',ops::text,true); perform set_config('sched_qa.admin',admin::text,true);
 perform set_config('sched_qa.sg_ops',sg_ops::text,true); perform set_config('sched_qa.editor',editor::text,true);
 perform set_config('sched_qa.customer',u::text,true); perform set_config('sched_qa.product',p::text,true);
 if has_function_privilege('authenticated','public.queue_sales_reports(date)','execute')
 or has_function_privilege('anon','public.queue_sales_reports(date)','execute')
 or has_function_privilege('service_role','private.queue_sales_reports_for(date)','execute')
 or has_function_privilege('authenticated','private.queue_sales_reports_for(date)','execute')
 or has_function_privilege('anon','public.set_report_subscription(text,text)','execute')
 or has_table_privilege('authenticated','private.report_subscriptions','select,insert,update,delete')
 or has_table_privilege('service_role','private.report_subscriptions','select,insert,update,delete') then raise exception 'FAIL: scheduled report grants'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in ('queue_sales_reports','set_report_subscription','my_report_subscriptions') and p.prosecdef) then raise exception 'FAIL: exposed scheduled report definer'; end if;
end $$;

-- One settled PH order of two units, placed on Wednesday 11 November 2026.
set local role authenticated;
do $$ begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('sched_qa.customer'),'role','authenticated','aal','aal1')::text,true);
 perform set_config('sched_qa.order',public.create_commerce_order('PH',jsonb_build_array(jsonb_build_object('productId',current_setting('sched_qa.product'),'quantity',2)),
  '{"full_name":"Sample QA customer","phone":"0000000000","line1":"Sample QA address","city":"Manila","postal_code":"1000","country":"PH"}'::jsonb,
  gen_random_uuid(),(select checkout_terms_version from public.markets where code='PH'))::text,true);
end $$;
reset role;
set local role service_role;
do $$ declare c jsonb; oid uuid:=current_setting('sched_qa.order')::uuid; begin
 c:=public.prepare_stripe_checkout(oid,current_setting('sched_qa.customer')::uuid,false,'https://example.invalid');
 if public.apply_stripe_checkout_event('evt_sched_'||oid,(c->>'id')::uuid,oid,'cs_test_sched',false,200,'php','complete','paid','pi_sched')<>'paid' then raise exception 'FAIL: fixture payment'; end if;
 begin
  perform public.queue_sales_reports('2020-01-06');
  raise exception 'FAIL: out-of-window report day accepted';
 exception when raise_exception then if SQLERRM<>'Invalid report date' then raise; end if; end;
end $$;
reset role;
update public.orders set created_at='2026-11-11 04:00:00+00' where id=current_setting('sched_qa.order')::uuid;

set local role authenticated;
do $$ declare who text; r jsonb; begin
 -- Customers, editors and unverified staff cannot subscribe; SG staff cannot subscribe to PH.
 foreach who in array array['customer','editor'] loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('sched_qa.'||who),'role','authenticated','aal','aal2')::text,true);
  begin
   perform public.set_report_subscription('PH','weekly');
   raise exception 'FAIL: subscription by %',who;
  exception when insufficient_privilege then null; end;
  begin
   perform public.my_report_subscriptions();
   raise exception 'FAIL: subscription list for %',who;
  exception when insufficient_privilege then null; end;
 end loop;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('sched_qa.ops'),'role','authenticated','aal','aal1')::text,true);
 begin
  perform public.set_report_subscription('PH','weekly');
  raise exception 'FAIL: subscription without MFA';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('sched_qa.sg_ops'),'role','authenticated','aal','aal2')::text,true);
 begin
  perform public.set_report_subscription('PH','weekly');
  raise exception 'FAIL: cross-market subscription';
 exception when insufficient_privilege then null; end;
 r:=public.set_report_subscription('SG','weekly');
 if r<>'[{"market":"SG","frequency":"weekly"}]'::jsonb then raise exception 'FAIL: SG subscription %',r; end if;

 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('sched_qa.ops'),'role','authenticated','aal','aal2')::text,true);
 begin
  perform public.set_report_subscription('PH','daily');
  raise exception 'FAIL: daily accepted';
 exception when raise_exception then if SQLERRM<>'Choose weekly or monthly reports' then raise; end if; end;
 if public.my_report_subscriptions()<>'[{"market":"PH","frequency":null}]'::jsonb then raise exception 'FAIL: empty list'; end if;
 perform public.set_report_subscription('PH','monthly');
 r:=public.set_report_subscription('PH','weekly');
 if r<>'[{"market":"PH","frequency":"weekly"}]'::jsonb then raise exception 'FAIL: ops subscription %',r; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('sched_qa.admin'),'role','authenticated','aal','aal2')::text,true);
 perform public.set_report_subscription('PH','monthly');
end $$;
reset role;

do $$ declare n integer; j private.notification_jobs; expected bigint; begin
 -- Monday 16 November: weekly reports for 9-15 November only.
 n:=private.queue_sales_reports_for('2026-11-16');
 if n<>2 then raise exception 'FAIL: weekly queue count %',n; end if;
 if private.queue_sales_reports_for('2026-11-16')<>0 then raise exception 'FAIL: weekly replay queued again'; end if;
 select * into j from private.notification_jobs where kind='sales_report' and user_id=current_setting('sched_qa.ops')::uuid;
 select count(*) into expected from public.orders where market='PH' and payment_status='paid' and status in ('paid','fulfilling','shipped','delivered')
  and created_at>='2026-11-09 00:00:00+00' and created_at<'2026-11-16 00:00:00+00';
 if j.context->>'frequency'<>'weekly' or j.context->>'from'<>'2026-11-09' or j.context->>'to'<>'2026-11-15' or j.context->>'currency'<>'PHP'
  or (j.context->>'orders')::bigint<>expected or (j.context->>'orders')::int<1
  or not exists(select 1 from jsonb_array_elements(j.context->'topProducts') e where e->>'name'='Scheduled report product' and (e->>'units')::int>=2)
  then raise exception 'FAIL: weekly context %',j.context; end if;
 if not exists(select 1 from private.notification_jobs where kind='sales_report' and user_id=current_setting('sched_qa.sg_ops')::uuid and context->>'market'='SG' and (context->>'orders')::int=0)
  then raise exception 'FAIL: SG weekly report'; end if;
 if exists(select 1 from private.notification_jobs where kind='sales_report' and user_id=current_setting('sched_qa.admin')::uuid) then raise exception 'FAIL: monthly queued on a Monday'; end if;

 -- Tuesday 1 December: monthly report for November only.
 if private.queue_sales_reports_for('2026-12-01')<>1 then raise exception 'FAIL: monthly queue count'; end if;
 select * into j from private.notification_jobs where kind='sales_report' and user_id=current_setting('sched_qa.admin')::uuid;
 if j.context->>'from'<>'2026-11-01' or j.context->>'to'<>'2026-11-30' or (j.context->>'orders')::int<1 then raise exception 'FAIL: monthly context %',j.context; end if;
 if private.queue_sales_reports_for('2026-11-17')<>0 then raise exception 'FAIL: report queued on a non-due day'; end if;

 -- Delivery rechecks the subscription and the role.
 update private.notification_jobs set status='processing',lease=gen_random_uuid(),lease_until=now()+interval '1 minute'
  where kind='sales_report' and user_id in (current_setting('sched_qa.ops')::uuid,current_setting('sched_qa.admin')::uuid);
 select * into j from private.notification_jobs where kind='sales_report' and user_id=current_setting('sched_qa.ops')::uuid;
 if not private.notification_authorized(j.id,j.lease) then raise exception 'FAIL: subscribed report denied'; end if;
 perform set_config('sched_qa.ops_job',j.id::text,true); perform set_config('sched_qa.ops_lease',j.lease::text,true);
 delete from public.staff_roles where user_id=current_setting('sched_qa.admin')::uuid;
 select * into j from private.notification_jobs where kind='sales_report' and user_id=current_setting('sched_qa.admin')::uuid;
 if private.notification_authorized(j.id,j.lease) then raise exception 'FAIL: report delivered after role removal'; end if;
end $$;

set local role authenticated;
do $$ begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('sched_qa.ops'),'role','authenticated','aal','aal2')::text,true);
 perform public.set_report_subscription('PH',null);
end $$;
reset role;

do $$ begin
 if private.notification_authorized(current_setting('sched_qa.ops_job')::uuid,current_setting('sched_qa.ops_lease')::uuid) then raise exception 'FAIL: report delivered after unsubscribe'; end if;
 if (select count(*) from public.audit_logs where entity='report_subscriptions' and actor_id=current_setting('sched_qa.ops')::uuid and action like 'REPORT_SUBSCRIPTION_%:PH')<>3 then raise exception 'FAIL: subscription audit'; end if;
end $$;

select 'PASS: scheduled reports role/market/MFA scope, weekly/monthly periods, idempotent queue, settled totals, delivery recheck of subscription and role, audit; all fixtures rolled back' as result;
rollback;
