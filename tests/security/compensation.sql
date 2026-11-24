-- Compensation order-volume outbox acceptance. Every user, order, payment and
-- event is a synthetic fixture and rolls back. No external system is called.
begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
select set_config('request.jwt.claims','{}',true);
do $$ declare ops uuid:=gen_random_uuid(); wrong uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); sponsor uuid:=gen_random_uuid();
 p uuid:=gen_random_uuid(); begin
 insert into auth.users(id,email) select x,'comp-qa-'||x||'@example.invalid' from unnest(array[ops,wrong,u,sponsor]) x;
 insert into public.staff_roles(user_id,market,role) values(ops,'PH','operations'),(wrong,'SG','operations');
 insert into public.distributor_profiles(user_id,external_member_id,code,display_name,active,verified_at,market)
 values(sponsor,'QA-COMP-SPONSOR','QX-'||substr(sponsor::text,1,8),'Sample sponsor',true,now(),'PH');
 insert into public.sponsor_attributions(user_id,distributor_id) values(u,sponsor);
 insert into public.products(id,slug,name,category,status) values(p,'comp-qa-'||p,'Sample volume product','Nutrition','published');
 insert into public.product_offers(product_id,market,currency,retail_minor,regulatory_approved,approval_reference,max_quantity)
 values(p,'PH','PHP',100,true,'ROLLBACK-QA',24);
 insert into public.inventory(product_id,market,on_hand) values(p,'PH',100);
 update public.markets set online_sales_approved=true,payments_ready=true,policy_reference='ROLLBACK-QA' where code='PH';
 perform set_config('comp_qa.ops',ops::text,true); perform set_config('comp_qa.wrong',wrong::text,true);
 perform set_config('comp_qa.customer',u::text,true);
 perform set_config('comp_qa.cart',jsonb_build_array(jsonb_build_object('productId',p,'quantity',3))::text,true);
 perform set_config('comp_qa.delivery','{"full_name":"Sample QA customer","phone":"0000000000","line1":"Sample QA address","city":"Manila","postal_code":"1000","country":"PH"}',true);
 perform set_config('comp_qa.terms',(select checkout_terms_version from public.markets where code='PH'),true);
 if has_table_privilege('authenticated','private.compensation_volume_events','select,insert,update,delete')
 or has_table_privilege('service_role','private.compensation_volume_events','select,insert,update,delete')
 or has_function_privilege('authenticated','public.claim_compensation_events(integer)','execute')
 or has_function_privilege('authenticated','public.finish_compensation_event(uuid,uuid,text,text,text)','execute')
 or has_function_privilege('authenticated','public.enqueue_missing_compensation_events(timestamptz)','execute')
 or has_function_privilege('anon','public.staff_compensation_sync()','execute')
 or has_function_privilege('anon','public.retry_compensation_event(uuid)','execute')
 or has_function_privilege('authenticated','private.compensation_payload(uuid,text)','execute') then raise exception 'FAIL: grants'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname like '%compensation%' and p.prosecdef) then raise exception 'FAIL: exposed definer'; end if;
end $$;

set local role authenticated;
do $$ declare i integer; begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('comp_qa.customer'),'role','authenticated','aal','aal1')::text,true);
 for i in 1..2 loop
  perform set_config('comp_qa.order'||i,public.create_commerce_order('PH',current_setting('comp_qa.cart')::jsonb,
   current_setting('comp_qa.delivery')::jsonb,gen_random_uuid(),current_setting('comp_qa.terms'))::text,true);
 end loop;
end $$;
reset role;
do $$ begin
 if exists(select 1 from private.compensation_volume_events) then raise exception 'FAIL: volume before payment'; end if;
end $$;

-- Unpaid cancellation never produces volume.
update public.orders set status='cancelled' where id=current_setting('comp_qa.order2')::uuid;
do $$ begin
 if exists(select 1 from private.compensation_volume_events) then raise exception 'FAIL: unpaid cancellation produced volume'; end if;
end $$;

set local role service_role;
do $$ declare c jsonb; oid uuid:=current_setting('comp_qa.order1')::uuid; begin
 c:=public.prepare_stripe_checkout(oid,current_setting('comp_qa.customer')::uuid,false,'https://example.invalid');
 if public.apply_stripe_checkout_event('evt_comp_'||oid,(c->>'id')::uuid,oid,'cs_test_comp1',false,300,'php','complete','paid','pi_comp1')<>'paid' then
  raise exception 'FAIL: fixture payment'; end if;
 perform public.apply_stripe_checkout_event('evt_comp_'||oid,(c->>'id')::uuid,oid,'cs_test_comp1',false,300,'php','complete','paid','pi_comp1');
end $$;
reset role;

do $$ declare e private.compensation_volume_events; begin
 if (select count(*) from private.compensation_volume_events)<>1 then raise exception 'FAIL: exactly one paid volume event'; end if;
 select * into e from private.compensation_volume_events;
 if e.event_type<>'order_paid' or e.external_reference<>'riway-web:order:'||current_setting('comp_qa.order1')||':paid' then raise exception 'FAIL: reference'; end if;
 if e.payload->>'sponsorMemberId'<>'QA-COMP-SPONSOR' or (e.payload->>'totalMinor')::bigint<>300 or e.payload->>'currency'<>'PHP'
  or (e.payload->'lines'->0->>'quantity')::int<>3 or e.payload ? 'customerMemberId' and e.payload->>'customerMemberId' is not null then
  raise exception 'FAIL: payload %',e.payload; end if;
 if e.payload::text ~* 'full_name|line1|postal|phone|email' then raise exception 'FAIL: personal data in payload'; end if;
end $$;

-- A refund queues a reversal, which waits for the paid acknowledgement.
update public.orders set payment_status='refunded',status='refunded' where id=current_setting('comp_qa.order1')::uuid;
update public.orders set status='refunded' where id=current_setting('comp_qa.order1')::uuid;
do $$ begin
 if (select count(*) from private.compensation_volume_events)<>2 then raise exception 'FAIL: reversal not queued once'; end if;
end $$;
set local role service_role;
do $$ declare jobs jsonb; j jsonb; ok boolean; begin
 begin perform public.claim_compensation_events(0); raise exception 'FAIL: zero claim'; exception when raise_exception then if SQLERRM<>'Invalid claim size' then raise; end if; end;
 jobs:=public.claim_compensation_events(25);
 if jsonb_array_length(jobs)<>1 or jobs->0->>'eventType'<>'order_paid' then raise exception 'FAIL: reversal claimed before paid ack %',jobs; end if;
 j:=jobs->0;
 -- Concurrent claim gets nothing while the lease is held.
 if jsonb_array_length(public.claim_compensation_events(25))<>0 then raise exception 'FAIL: leased event reclaimed'; end if;
 -- Wrong token cannot finish; acknowledgement requires a reference.
 if public.finish_compensation_event((j->>'id')::uuid,gen_random_uuid(),'acknowledged','ACK-1') then raise exception 'FAIL: wrong token'; end if;
 begin perform public.finish_compensation_event((j->>'id')::uuid,(j->>'lease')::uuid,'acknowledged',null);
  raise exception 'FAIL: ack without reference'; exception when raise_exception then if SQLERRM<>'Acknowledgement reference required' then raise; end if; end;
 -- A retry backs off; the event is not immediately claimable again.
 if not public.finish_compensation_event((j->>'id')::uuid,(j->>'lease')::uuid,'retry',null,'timeout') then raise exception 'FAIL: retry'; end if;
 if jsonb_array_length(public.claim_compensation_events(25))<>0 then raise exception 'FAIL: retry ignored backoff'; end if;
end $$;
reset role;
update private.compensation_volume_events set next_attempt_at=now() where event_type='order_paid';
set local role service_role;
do $$ declare jobs jsonb; j jsonb; begin
 jobs:=public.claim_compensation_events(25);
 if jsonb_array_length(jobs)<>1 or (jobs->0->>'attempts')::int<>2 then raise exception 'FAIL: second attempt %',jobs; end if;
 j:=jobs->0;
 if not public.finish_compensation_event((j->>'id')::uuid,(j->>'lease')::uuid,'acknowledged','RIWAY-ACK-QA-1') then raise exception 'FAIL: ack'; end if;
 if public.finish_compensation_event((j->>'id')::uuid,(j->>'lease')::uuid,'acknowledged','RIWAY-ACK-QA-1') then raise exception 'FAIL: double finish'; end if;
 jobs:=public.claim_compensation_events(25);
 if jsonb_array_length(jobs)<>1 or jobs->0->>'eventType'<>'order_reversed' then raise exception 'FAIL: reversal after ack %',jobs; end if;
 j:=jobs->0;
 -- A permanent rejection fails immediately for staff review.
 if not public.finish_compensation_event((j->>'id')::uuid,(j->>'lease')::uuid,'rejected',null,'Bad <payload>') then raise exception 'FAIL: reject'; end if;
 perform set_config('comp_qa.failed',j->>'id',true);
end $$;
reset role;
do $$ declare e private.compensation_volume_events; begin
 select * into e from private.compensation_volume_events where id=current_setting('comp_qa.failed')::uuid;
 if e.status<>'failed' or e.last_error_code<>'provider_error' then raise exception 'FAIL: rejected state % %',e.status,e.last_error_code; end if;
 if (select status from private.compensation_volume_events where event_type='order_paid')<>'acknowledged' then raise exception 'FAIL: ack state'; end if;
end $$;

-- Staff visibility and retry: market admin/operations with MFA only.
set local role authenticated;
do $$ declare r jsonb; who text; begin
 foreach who in array array['customer','wrong'] loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('comp_qa.'||who),'role','authenticated','aal','aal2')::text,true);
  begin
   perform public.retry_compensation_event(current_setting('comp_qa.failed')::uuid);
   raise exception 'FAIL: retry by %',who;
  exception when insufficient_privilege then null; end;
 end loop;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('comp_qa.wrong'),'role','authenticated','aal','aal2')::text,true);
 r:=public.staff_compensation_sync();
 if jsonb_array_length(r->'attention')<>0 or (r->'counts'->>'failed')::int<>0 then raise exception 'FAIL: other market sees PH events'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('comp_qa.ops'),'role','authenticated','aal','aal1')::text,true);
 begin perform public.staff_compensation_sync(); raise exception 'FAIL: sync view without MFA'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('comp_qa.ops'),'role','authenticated','aal','aal2')::text,true);
 r:=public.staff_compensation_sync();
 if (r->'counts'->>'failed')::int<>1 or (r->'counts'->>'acknowledged')::int<>1 or jsonb_array_length(r->'attention')<>1 then raise exception 'FAIL: staff view %',r; end if;
 if r::text ~* 'QA-COMP-SPONSOR|Sample QA|example.invalid' then raise exception 'FAIL: staff view leaks payload'; end if;
 if not public.retry_compensation_event(current_setting('comp_qa.failed')::uuid) then raise exception 'FAIL: retry'; end if;
 if public.retry_compensation_event(current_setting('comp_qa.failed')::uuid) then raise exception 'FAIL: retry of non-failed event'; end if;
end $$;
reset role;
do $$ begin
 if (select status from private.compensation_volume_events where id=current_setting('comp_qa.failed')::uuid)<>'pending' then raise exception 'FAIL: retry state'; end if;
 if not exists(select 1 from public.audit_logs where action='COMPENSATION_RETRY:order_reversed') then raise exception 'FAIL: retry audit'; end if;
end $$;

-- Backfill: bounded window and idempotent.
delete from private.compensation_volume_events;
set local role service_role;
do $$ begin
 begin perform public.enqueue_missing_compensation_events(now()-interval '40 days'); raise exception 'FAIL: unbounded backfill';
 exception when raise_exception then if SQLERRM<>'Backfill window must be within 31 days' then raise; end if; end;
 if public.enqueue_missing_compensation_events(now()-interval '1 day')<>1 then raise exception 'FAIL: backfill paid'; end if;
 if public.enqueue_missing_compensation_events(now()-interval '1 day')<>0 then raise exception 'FAIL: backfill replay'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.compensation_volume_events)<>2 then raise exception 'FAIL: backfill should restore paid and reversal'; end if;
end $$;
rollback;
