-- Synthetic sample rules only. Every approval, consent, payment and member rolls back.
begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
select set_config('request.jwt.claims','{}',true);
do $$ declare a uuid:=gen_random_uuid(); wrong uuid:=gen_random_uuid(); editor uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); suspended uuid:=gen_random_uuid(); sponsor uuid:=gen_random_uuid(); physical uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); p2 uuid:=gen_random_uuid(); begin
 insert into auth.users(id,email) select x,'membership-qa-'||x||'@example.invalid' from unnest(array[a,wrong,editor,u,other,suspended,sponsor]) x;
 insert into public.staff_roles(user_id,market,role) values(a,'PH','admin'),(wrong,'SG','compliance'),(editor,'PH','editor');
 insert into public.distributor_profiles(user_id,external_member_id,code,display_name,active,verified_at,market)
 values(sponsor,'QA-SPONSOR-'||sponsor,'QA-'||substr(sponsor::text,1,8),'Sample sponsor',true,now(),'PH');
 insert into public.sponsor_attributions(user_id,distributor_id) values(u,sponsor),(other,sponsor),(suspended,sponsor);
 insert into public.memberships(user_id,external_member_id,tier,status) values(suspended,'QA-SUSPENDED-'||suspended,'Existing tier','suspended');
 insert into public.products(id,slug,name,category,status) values
 (physical,'membership-qa-'||physical,'Sample physical product','Nutrition','published'),
 (p,'membership-qa-'||p,'Sample starter package','Packages','published'),(p2,'membership-qa-'||p2,'Sample second package','Packages','published');
 insert into public.product_offers(product_id,market,currency,retail_minor,regulatory_approved,approval_reference,max_quantity)
 values(physical,'PH','PHP',100,true,'ROLLBACK-QA',24),(p,'PH','PHP',500,true,'ROLLBACK-QA',24),(p2,'PH','PHP',500,true,'ROLLBACK-QA',24);
 insert into public.inventory(product_id,market,on_hand) values(physical,'PH',100);
 update public.markets set online_sales_approved=true,payments_ready=true,policy_reference='ROLLBACK-QA' where code='PH';
 perform set_config('membership_qa.admin',a::text,true); perform set_config('membership_qa.wrong',wrong::text,true); perform set_config('membership_qa.editor',editor::text,true);
 perform set_config('membership_qa.customer',u::text,true); perform set_config('membership_qa.other',other::text,true); perform set_config('membership_qa.suspended',suspended::text,true);
 perform set_config('membership_qa.sponsor',sponsor::text,true); perform set_config('membership_qa.physical',physical::text,true); perform set_config('membership_qa.package',p::text,true); perform set_config('membership_qa.package2',p2::text,true);
 perform set_config('membership_qa.delivery','{"full_name":"Sample QA customer","phone":"0000000000","line1":"Sample QA address","city":"Manila","postal_code":"1000","country":"PH"}',true);
 perform set_config('membership_qa.cart',jsonb_build_array(jsonb_build_object('productId',p,'quantity',1))::text,true);
 perform set_config('membership_qa.terms',(select checkout_terms_version from public.markets where code='PH'),true);
 perform set_config('membership_qa.key',gen_random_uuid()::text,true);
 if has_table_privilege('authenticated','private.membership_rules','select,insert,update,delete') or has_table_privilege('service_role','private.membership_enrollments','select,insert,update,delete')
 or has_function_privilege('authenticated','private.create_commerce_order_without_membership(text,jsonb,jsonb,uuid,text,text,text)','execute')
 or has_function_privilege('authenticated','private.plan_commerce_checkout_without_membership(text,jsonb,text,boolean)','execute')
 or has_function_privilege('anon','public.my_memberships(integer)','execute') then raise exception 'FAIL: membership state or bypass grants'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('my_memberships','staff_memberships','approve_membership_rule','withdraw_membership_rule','confirm_membership_enrollment','create_membership_commerce_order') and p.prosecdef) then raise exception 'FAIL: exposed membership definer'; end if;
end $$;

set local role authenticated;
do $$ declare d jsonb; o jsonb; i integer; begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('membership_qa.admin'),'role','authenticated','aal','aal2')::text,true);
 for i in 1..2 loop
  d:=public.save_commerce_draft(null,'package','PH','Sample package '||i,'review',jsonb_build_object('components',jsonb_build_array(jsonb_build_object('productId',current_setting('membership_qa.physical'),'quantity',1)),'retailMinor',500,'memberMinor',400),0);
  o:=public.approve_commerce_draft((d->>'id')::uuid,1,current_setting(case when i=1 then 'membership_qa.package' else 'membership_qa.package2' end)::uuid,'ROLLBACK-SAMPLE');
  perform set_config(case when i=1 then 'membership_qa.offer' else 'membership_qa.offer2' end,o->>'id',true);
 end loop;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('membership_qa.customer'),'role','authenticated','aal','aal1')::text,true);
 -- An exact pre-rule legacy retry remains valid after approval; no old-order backfill.
 perform set_config('membership_qa.legacy_key',gen_random_uuid()::text,true);
 perform set_config('membership_qa.legacy',public.create_commerce_order('PH',current_setting('membership_qa.cart')::jsonb,current_setting('membership_qa.delivery')::jsonb,current_setting('membership_qa.legacy_key')::uuid,current_setting('membership_qa.terms'))::text,true);
 perform set_config('membership_qa.oldquote',(public.quote_commerce_checkout('PH',current_setting('membership_qa.cart')::jsonb))->>'quoteHash',true);
end $$;

do $$ declare who text; r jsonb; i integer; begin
 foreach who in array array['customer','editor','wrong'] loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('membership_qa.'||who),'role','authenticated','aal','aal2')::text,true);
  begin
   perform public.approve_membership_rule(current_setting('membership_qa.offer')::uuid,'SAMPLE_STARTER','Sample Starter',1,'sample-terms-v1','Sample terms for rollback tests only.','sample-code-v1','Sample Code of Conduct for tests only.','ROLLBACK-SAMPLE');
   raise exception 'FAIL: unauthorized membership approval';
  exception when insufficient_privilege then null; end;
 end loop;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('membership_qa.admin'),'role','authenticated','aal','aal1')::text,true);
 begin
  perform public.approve_membership_rule(current_setting('membership_qa.offer')::uuid,'SAMPLE_STARTER','Sample Starter',1,'sample-terms-v1','Sample terms for rollback tests only.','sample-code-v1','Sample Code of Conduct for tests only.','ROLLBACK-SAMPLE');
  raise exception 'FAIL: MFA missing membership approval';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('membership_qa.admin'),'role','authenticated','aal','aal2')::text,true);
 begin
  perform public.approve_membership_rule(current_setting('membership_qa.offer')::uuid,'bad code','Sample Starter',0,'v1','short','v1','short','bad');
  raise exception 'FAIL: invalid membership rule';
 exception when raise_exception then if SQLERRM like 'FAIL:%' then raise; end if; end;
 for i in 1..2 loop
  r:=public.approve_membership_rule(current_setting(case when i=1 then 'membership_qa.offer' else 'membership_qa.offer2' end)::uuid,'SAMPLE_'||i,'Sample tier '||i,1,'sample-terms-v1','Sample terms for rollback tests only.','sample-code-v1','Sample Code of Conduct for tests only.','ROLLBACK-SAMPLE');
  perform set_config(case when i=1 then 'membership_qa.rule' else 'membership_qa.rule2' end,r->>'id',true);
 end loop;
 if jsonb_array_length(public.staff_memberships()->'rules')<>2 then raise exception 'FAIL: staff rules list'; end if;
end $$;

do $$ declare q jsonb; consent jsonb; o uuid; i integer; begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('membership_qa.customer'),'role','authenticated','aal','aal1')::text,true);
 if public.create_order('PH',current_setting('membership_qa.cart')::jsonb,current_setting('membership_qa.delivery')::jsonb,current_setting('membership_qa.legacy_key')::uuid,current_setting('membership_qa.terms'))::text<>current_setting('membership_qa.legacy') then raise exception 'FAIL: exact legacy retry changed'; end if;
 q:=public.quote_commerce_checkout('PH',current_setting('membership_qa.cart')::jsonb);
 if q->'membership'->>'ruleId' is distinct from current_setting('membership_qa.rule') or q->'membership'->>'termsText'<>'Sample terms for rollback tests only.' then raise exception 'FAIL: quote membership snapshot'; end if;
 consent:=jsonb_build_object('ruleId',current_setting('membership_qa.rule'),'termsVersion','sample-terms-v1','codeVersion','sample-code-v1','accepted',true);
 perform set_config('membership_qa.consent',consent::text,true);
 begin
  perform public.create_order('PH',current_setting('membership_qa.cart')::jsonb,current_setting('membership_qa.delivery')::jsonb,gen_random_uuid(),current_setting('membership_qa.terms'));
  raise exception 'FAIL: legacy missing-consent bypass';
 exception when raise_exception then if SQLERRM like 'FAIL:%' then raise; end if; end;
 begin
  perform public.create_commerce_order('PH',current_setting('membership_qa.cart')::jsonb,current_setting('membership_qa.delivery')::jsonb,gen_random_uuid(),current_setting('membership_qa.terms'),null,q->>'quoteHash');
  raise exception 'FAIL: commerce missing-consent bypass';
 exception when raise_exception then if SQLERRM like 'FAIL:%' then raise; end if; end;
 begin
  perform public.create_membership_commerce_order('PH',current_setting('membership_qa.cart')::jsonb,current_setting('membership_qa.delivery')::jsonb,gen_random_uuid(),current_setting('membership_qa.terms'),null,q->>'quoteHash',consent||'{"accepted":false}'::jsonb);
  raise exception 'FAIL: false consent accepted';
 exception when raise_exception then if SQLERRM like 'FAIL:%' then raise; end if; end;
 begin
  perform public.create_membership_commerce_order('PH',current_setting('membership_qa.cart')::jsonb,current_setting('membership_qa.delivery')::jsonb,gen_random_uuid(),current_setting('membership_qa.terms'),null,current_setting('membership_qa.oldquote'),consent);
  raise exception 'FAIL: stale membership quote accepted';
 exception when serialization_failure then null; end;
 begin
  perform public.quote_commerce_checkout('PH',current_setting('membership_qa.cart')::jsonb||jsonb_build_array(jsonb_build_object('productId',current_setting('membership_qa.package2'),'quantity',1)));
  raise exception 'FAIL: ambiguous membership tier accepted';
 exception when raise_exception then if SQLERRM like 'FAIL:%' then raise; end if; end;
 for i in 1..2 loop
  o:=public.create_membership_commerce_order('PH',current_setting('membership_qa.cart')::jsonb,current_setting('membership_qa.delivery')::jsonb,
   case when i=1 then current_setting('membership_qa.key')::uuid else gen_random_uuid() end,current_setting('membership_qa.terms'),null,q->>'quoteHash',consent);
  perform set_config(case when i=1 then 'membership_qa.order' else 'membership_qa.order2' end,o::text,true);
 end loop;
 perform set_config('membership_qa.quote',q->>'quoteHash',true);
 if jsonb_array_length(public.my_memberships()->'enrollments')<>2 or public.my_memberships()->'membership'<>'null'::jsonb then raise exception 'FAIL: pending payment member benefits'; end if;
 begin
  perform public.create_membership_commerce_order('PH',current_setting('membership_qa.cart')::jsonb,current_setting('membership_qa.delivery')::jsonb,current_setting('membership_qa.key')::uuid,current_setting('membership_qa.terms'),null,q->>'quoteHash',consent||'{"codeVersion":"different"}'::jsonb);
  raise exception 'FAIL: replay consent changed';
 exception when raise_exception then if SQLERRM like 'FAIL:%' then raise; end if; end;
end $$;

-- Other users cannot see this account's consent/order history. Existing suspended
-- membership is not replaced, upgraded or reactivated by a qualifying package.
do $$ begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('membership_qa.other'),'role','authenticated','aal','aal1')::text,true);
 if jsonb_array_length(public.my_memberships()->'enrollments')<>0 then raise exception 'FAIL: customer enrollment isolation'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('membership_qa.suspended'),'role','authenticated','aal','aal1')::text,true);
 if public.quote_commerce_checkout('PH',current_setting('membership_qa.cart')::jsonb)->'membership'<>'null'::jsonb then raise exception 'FAIL: suspended member re-enrollment'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('membership_qa.wrong'),'role','authenticated','aal','aal2')::text,true);
 if jsonb_array_length(public.staff_memberships()->'rules')<>0 or jsonb_array_length(public.staff_memberships()->'enrollments')<>0 then raise exception 'FAIL: staff market leak'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('membership_qa.admin'),'role','authenticated','aal','aal2')::text,true);
 perform public.withdraw_membership_rule(current_setting('membership_qa.rule')::uuid,'ROLLBACK-WITHDRAW');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('membership_qa.customer'),'role','authenticated','aal','aal1')::text,true);
 if public.quote_commerce_checkout('PH',current_setting('membership_qa.cart')::jsonb)->'membership'<>'null'::jsonb then raise exception 'FAIL: withdrawn new qualification'; end if;
 if public.create_membership_commerce_order('PH',current_setting('membership_qa.cart')::jsonb,current_setting('membership_qa.delivery')::jsonb,current_setting('membership_qa.key')::uuid,current_setting('membership_qa.terms'),null,current_setting('membership_qa.quote'),current_setting('membership_qa.consent')::jsonb)::text<>current_setting('membership_qa.order') then raise exception 'FAIL: withdrawn exact order replay'; end if;
end $$;
reset role;

do $$ begin
 if exists(select 1 from public.memberships where user_id=current_setting('membership_qa.customer')::uuid)
 or exists(select 1 from private.notification_jobs where user_id=current_setting('membership_qa.customer')::uuid and kind like 'membership_%') then raise exception 'FAIL: unpaid enrollment activated/notified'; end if;
 begin
  update private.membership_rules set terms_text='Changed historical legal content for QA.' where id=current_setting('membership_qa.rule')::uuid;
  raise exception 'FAIL: approved rule mutation';
 exception when raise_exception then if SQLERRM like 'FAIL:%' then raise; end if; end;
end $$;

set local role service_role;
do $$ declare p jsonb; oid uuid; i integer; begin
 for i in 1..2 loop
  oid:=current_setting(case when i=1 then 'membership_qa.order' else 'membership_qa.order2' end)::uuid;
  p:=public.prepare_stripe_checkout(oid,current_setting('membership_qa.customer')::uuid,false,'https://example.invalid');
  if public.apply_stripe_checkout_event('evt_membership_'||oid,(p->>'id')::uuid,oid,'cs_test_membership_'||i,false,500,'php','complete','paid','pi_membership'||i)<>'paid' then raise exception 'FAIL: membership paid event'; end if;
  if public.apply_stripe_checkout_event('evt_membership_'||oid,(p->>'id')::uuid,oid,'cs_test_membership_'||i,false,500,'php','complete','paid','pi_membership'||i)<>'duplicate' then raise exception 'FAIL: membership duplicate event'; end if;
 end loop;
end $$;
reset role;
do $$ declare e private.membership_enrollments; j private.notification_jobs; begin
 select * into e from private.membership_enrollments where order_id=current_setting('membership_qa.order')::uuid;
 perform set_config('membership_qa.enrollment',e.id::text,true);
 if e.status<>'pending_verification' or e.rule_snapshot->>'termsText'<>'Sample terms for rollback tests only.' or e.consented_at is null
 or e.sponsor_id<>current_setting('membership_qa.sponsor')::uuid then raise exception 'FAIL: paid snapshot/consent/sponsor'; end if;
 if private.membership_enrollment_json(e)->>'sponsorMemberId' is distinct from 'QA-SPONSOR-'||current_setting('membership_qa.sponsor') then raise exception 'FAIL: sponsor RIWAY member ID missing from staff evidence'; end if;
 if exists(select 1 from public.memberships where user_id=e.user_id) then raise exception 'FAIL: pending verification gained member pricing'; end if;
 if (select status from private.membership_enrollments where order_id=current_setting('membership_qa.order2')::uuid)<>'not_applied' then raise exception 'FAIL: repeated qualifying purchase duplicated enrollment'; end if;
 if (select count(*) from private.notification_jobs where user_id=e.user_id and kind='membership_requested')<>1 then raise exception 'FAIL: duplicate membership requested notification'; end if;
 update private.notification_jobs set status='processing',lease=gen_random_uuid(),lease_until=now()+interval '1 minute' where kind='membership_requested' and reference=e.id returning * into j;
 if not private.notification_authorized(j.id,j.lease) then raise exception 'FAIL: valid requested notification denied'; end if;
end $$;

-- Rejection runs inside a rolled-back subtransaction, so the confirmation checks
-- below still start from the same pending enrolment.
set local role authenticated;
do $$ declare who text; r jsonb; second_cart jsonb:=jsonb_build_array(jsonb_build_object('productId',current_setting('membership_qa.package2'),'quantity',1)); begin
 foreach who in array array['customer','editor','wrong'] loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('membership_qa.'||who),'role','authenticated','aal','aal2')::text,true);
  begin
   perform public.reject_membership_enrollment(current_setting('membership_qa.enrollment')::uuid,'ROLLBACK-REJECT');
   raise exception 'FAIL: unauthorized membership rejection';
  exception when insufficient_privilege then null; end;
 end loop;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('membership_qa.admin'),'role','authenticated','aal','aal1')::text,true);
 begin
  perform public.reject_membership_enrollment(current_setting('membership_qa.enrollment')::uuid,'ROLLBACK-REJECT');
  raise exception 'FAIL: rejection without MFA';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('membership_qa.admin'),'role','authenticated','aal','aal2')::text,true);
 begin
  perform public.reject_membership_enrollment(current_setting('membership_qa.enrollment')::uuid,'no');
  raise exception 'FAIL: rejection without reference';
 exception when raise_exception then if SQLERRM<>'A review reference is required' then raise; end if; end;
 begin
  r:=public.reject_membership_enrollment(current_setting('membership_qa.enrollment')::uuid,' ROLLBACK-REJECT ');
  if r->>'status'<>'rejected' or r->>'rejectionReference'<>'ROLLBACK-REJECT' or r->>'rejectedAt' is null then raise exception 'FAIL: membership rejection'; end if;
  if public.reject_membership_enrollment(current_setting('membership_qa.enrollment')::uuid,'ROLLBACK-REJECT')->>'status'<>'rejected' then raise exception 'FAIL: rejection replay'; end if;
  begin
   perform public.reject_membership_enrollment(current_setting('membership_qa.enrollment')::uuid,'DIFFERENT-REJECT');
   raise exception 'FAIL: conflicting rejection replay';
  exception when raise_exception then if SQLERRM like 'FAIL:%' then raise; end if; end;
  begin
   perform public.confirm_membership_enrollment(current_setting('membership_qa.enrollment')::uuid,'SAMPLE-MEMBER-REJECTED','ROLLBACK-CONFIRM');
   raise exception 'FAIL: rejected enrolment confirmed';
  exception when raise_exception then if SQLERRM like 'FAIL:%' then raise; end if; end;
  if (select count(*) from public.audit_logs where action='MEMBERSHIP_REJECT:PH' and entity_id=current_setting('membership_qa.enrollment'))<>1 then raise exception 'FAIL: rejection audit'; end if;
  -- A rejected applicant may apply again with another qualifying purchase.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('membership_qa.customer'),'role','authenticated','aal','aal1')::text,true);
  if public.quote_commerce_checkout('PH',second_cart)->'membership'->>'ruleId' is distinct from current_setting('membership_qa.rule2') then raise exception 'FAIL: rejected customer cannot re-apply'; end if;
  if public.my_memberships()->'membership'<>'null'::jsonb then raise exception 'FAIL: rejection granted membership'; end if;
  raise exception 'ROLLBACK_REJECTION';
 exception when raise_exception then if SQLERRM<>'ROLLBACK_REJECTION' then raise; end if; end;
 -- After the rollback the enrolment is pending again, which still blocks a second application.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('membership_qa.customer'),'role','authenticated','aal','aal1')::text,true);
 if public.quote_commerce_checkout('PH',second_cart)->'membership'<>'null'::jsonb then raise exception 'FAIL: pending enrolment allowed a second application'; end if;
end $$;
reset role;

set local role authenticated;
do $$ declare who text; r jsonb; begin
 foreach who in array array['customer','editor','wrong'] loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('membership_qa.'||who),'role','authenticated','aal','aal2')::text,true);
  begin
   perform public.confirm_membership_enrollment(current_setting('membership_qa.enrollment')::uuid,'SAMPLE-MEMBER-'||current_setting('membership_qa.customer'),'ROLLBACK-CONFIRM');
   raise exception 'FAIL: unauthorized external confirmation';
  exception when insufficient_privilege then null; end;
 end loop;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('membership_qa.admin'),'role','authenticated','aal','aal2')::text,true);
 r:=public.confirm_membership_enrollment(current_setting('membership_qa.enrollment')::uuid,'SAMPLE-MEMBER-'||current_setting('membership_qa.customer'),'ROLLBACK-CONFIRM');
 if r->>'status'<>'confirmed' then raise exception 'FAIL: verified external confirmation'; end if;
 perform public.confirm_membership_enrollment(current_setting('membership_qa.enrollment')::uuid,'SAMPLE-MEMBER-'||current_setting('membership_qa.customer'),'ROLLBACK-CONFIRM');
 begin
  perform public.confirm_membership_enrollment(current_setting('membership_qa.enrollment')::uuid,'DIFFERENT-MEMBER','ROLLBACK-CONFIRM');
  raise exception 'FAIL: confirmation replay changed identity';
 exception when raise_exception then if SQLERRM like 'FAIL:%' then raise; end if; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('membership_qa.customer'),'role','authenticated','aal','aal1')::text,true);
 if public.my_memberships()->'membership'->>'status'<>'active' or public.my_memberships()->'membership'->>'tier'<>'Sample tier 1'
 or public.quote_commerce_checkout('PH',current_setting('membership_qa.cart')::jsonb)->'membership'<>'null'::jsonb then raise exception 'FAIL: confirmed membership summary'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('membership_qa.admin'),'role','authenticated','aal','aal2')::text,true);
 begin
  perform public.reject_membership_enrollment(current_setting('membership_qa.enrollment')::uuid,'ROLLBACK-REJECT');
  raise exception 'FAIL: confirmed enrolment rejected';
 exception when raise_exception then if SQLERRM<>'Only an enrolment awaiting RIWAY confirmation can be rejected' then raise; end if; end;
end $$;
reset role;
do $$ declare j private.notification_jobs; begin
 if (select count(*) from private.notification_jobs where kind='membership_confirmed' and reference=current_setting('membership_qa.enrollment')::uuid)<>1 then raise exception 'FAIL: duplicate membership confirmation notification'; end if;
 select * into j from private.notification_jobs where kind='membership_requested' and reference=current_setting('membership_qa.enrollment')::uuid;
 if private.notification_authorized(j.id,j.lease) then raise exception 'FAIL: stale requested notification after confirmation'; end if;
 update private.notification_jobs set status='processing',lease=gen_random_uuid(),lease_until=now()+interval '1 minute' where kind='membership_confirmed' and reference=current_setting('membership_qa.enrollment')::uuid returning * into j;
 if not private.notification_authorized(j.id,j.lease) then raise exception 'FAIL: confirmed membership notification denied'; end if;
 if exists(select 1 from public.staff_roles where user_id=current_setting('membership_qa.customer')::uuid)
 or exists(select 1 from public.distributor_profiles where user_id=current_setting('membership_qa.customer')::uuid) then raise exception 'FAIL: membership granted privileged roles'; end if;
 -- No backfill from an old paid order or a late paid order under review.
 update public.orders set status='paid',payment_status='paid' where id=current_setting('membership_qa.legacy')::uuid;
 if exists(select 1 from private.membership_enrollments where order_id=current_setting('membership_qa.legacy')::uuid) then raise exception 'FAIL: old paid order membership backfill'; end if;
end $$;

select 'PASS: sample membership approval/scope/MFA, immutable consent, legacy replay and bypass denial, ambiguous tiers, owner isolation, paid-only requests, idempotency, external confirmation and notification authorization; all fixtures rolled back' as result;
rollback;
