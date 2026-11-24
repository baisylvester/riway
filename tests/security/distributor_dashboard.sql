-- Distributor dashboard acceptance: verified-only access, own attributed
-- orders only, pseudonymous customers, approved cycles/materials/photos.
-- Every record is a synthetic fixture and rolls back.
begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
select set_config('request.jwt.claims','{}',true);
do $$ declare d1 uuid:=gen_random_uuid(); d2 uuid:=gen_random_uuid(); d3 uuid:=gen_random_uuid(); c1 uuid:=gen_random_uuid();
 c2 uuid:=gen_random_uuid(); c3 uuid:=gen_random_uuid(); comp uuid:=gen_random_uuid(); ed uuid:=gen_random_uuid(); sgcomp uuid:=gen_random_uuid();
 p uuid:=gen_random_uuid(); begin
 insert into auth.users(id,email) select x,'dist-qa-'||x||'@example.invalid' from unnest(array[d1,d2,d3,c1,c2,c3,comp,ed,sgcomp]) x;
 insert into public.staff_roles(user_id,market,role) values(comp,'PH','compliance'),(ed,'PH','editor'),(sgcomp,'SG','compliance');
 insert into public.distributor_profiles(user_id,external_member_id,code,display_name,active,verified_at,market) values
  (d1,'QA-DIST-1','QD1-'||substr(d1::text,1,8),'Sample distributor one',true,now(),'PH'),
  (d2,'QA-DIST-2','QD2-'||substr(d2::text,1,8),'Sample distributor two',true,now(),'PH'),
  (d3,'QA-DIST-3','QD3-'||substr(d3::text,1,8),'Sample unverified',true,null,'PH');
 insert into public.sponsor_attributions(user_id,distributor_id) values(c1,d1),(c2,d1),(c3,d2);
 insert into public.products(id,slug,name,category,status) values(p,'dist-qa-'||p,'Sample cycle product','Nutrition','published');
 insert into public.product_offers(product_id,market,currency,retail_minor,regulatory_approved,approval_reference,max_quantity)
 values(p,'PH','PHP',100,true,'ROLLBACK-QA',24);
 insert into public.inventory(product_id,market,on_hand) values(p,'PH',100);
 update public.markets set online_sales_approved=true,payments_ready=true,policy_reference='ROLLBACK-QA' where code='PH';
 perform set_config('dist_qa.d1',d1::text,true); perform set_config('dist_qa.d2',d2::text,true); perform set_config('dist_qa.d3',d3::text,true);
 perform set_config('dist_qa.c1',c1::text,true); perform set_config('dist_qa.c2',c2::text,true); perform set_config('dist_qa.c3',c3::text,true);
 perform set_config('dist_qa.comp',comp::text,true); perform set_config('dist_qa.ed',ed::text,true); perform set_config('dist_qa.sgcomp',sgcomp::text,true);
 perform set_config('dist_qa.product',p::text,true);
 perform set_config('dist_qa.code1','QD1-'||substr(d1::text,1,8),true);
 perform set_config('dist_qa.cart',jsonb_build_array(jsonb_build_object('productId',p,'quantity',2))::text,true);
 perform set_config('dist_qa.delivery','{"full_name":"Sample QA customer","phone":"0000000000","line1":"Sample QA address","city":"Manila","postal_code":"1000","country":"PH"}',true);
 perform set_config('dist_qa.terms',(select checkout_terms_version from public.markets where code='PH'),true);
 if has_table_privilege('authenticated','private.distributor_materials','select,insert,update,delete')
 or has_function_privilege('anon','public.my_distributor_dashboard()','execute')
 or has_function_privilege('anon','public.set_distributor_photo(text,text,text)','execute')
 or has_function_privilege('anon','public.set_product_replenishment(uuid,integer,text)','execute')
 or not has_function_privilege('anon','public.lookup_distributor_store(text)','execute') then raise exception 'FAIL: grants'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in ('my_distributor_dashboard','lookup_distributor_store','set_product_replenishment','set_distributor_photo',
   'save_distributor_material','staff_distributor_materials') and p.prosecdef) then raise exception 'FAIL: exposed definer'; end if;
end $$;

-- c1 and c3 each pay one order; c2 leaves one unpaid.
set local role authenticated;
do $$ declare who text; begin
 foreach who in array array['c1','c2','c3'] loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('dist_qa.'||who),'role','authenticated','aal','aal1')::text,true);
  perform set_config('dist_qa.order_'||who,public.create_commerce_order('PH',current_setting('dist_qa.cart')::jsonb,
   current_setting('dist_qa.delivery')::jsonb,gen_random_uuid(),current_setting('dist_qa.terms'))::text,true);
 end loop;
end $$;
reset role;
set local role service_role;
do $$ declare c jsonb; who text; oid uuid; begin
 foreach who in array array['c1','c3'] loop
  oid:=current_setting('dist_qa.order_'||who)::uuid;
  c:=public.prepare_stripe_checkout(oid,current_setting('dist_qa.'||who)::uuid,false,'https://example.invalid');
  if public.apply_stripe_checkout_event('evt_dist_'||oid,(c->>'id')::uuid,oid,'cs_test_dist'||who,false,200,'php','complete','paid','pi_dist'||who)<>'paid' then
   raise exception 'FAIL: fixture payment'; end if;
 end loop;
end $$;
reset role;

set local role authenticated;
do $$ declare r jsonb; begin
 -- Cycles: only admin/compliance with MFA, and an approval reference is required.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('dist_qa.ed'),'role','authenticated','aal','aal2')::text,true);
 begin perform public.set_product_replenishment(current_setting('dist_qa.product')::uuid,30,'QA-CYCLE'); raise exception 'FAIL: editor set cycle';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('dist_qa.comp'),'role','authenticated','aal','aal2')::text,true);
 begin perform public.set_product_replenishment(current_setting('dist_qa.product')::uuid,30,null); raise exception 'FAIL: cycle without reference';
 exception when raise_exception then if SQLERRM<>'A reorder cycle needs an approval reference' then raise; end if; end;
 begin perform public.set_product_replenishment(current_setting('dist_qa.product')::uuid,3,'QA-CYCLE'); raise exception 'FAIL: 3-day cycle';
 exception when check_violation then null; end;
 perform public.set_product_replenishment(current_setting('dist_qa.product')::uuid,30,'QA-CYCLE');

 -- Customers and unverified distributors cannot open a dashboard.
 foreach r in array array[to_jsonb(current_setting('dist_qa.c1')),to_jsonb(current_setting('dist_qa.d3'))] loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',r#>>'{}','role','authenticated','aal','aal1')::text,true);
  begin perform public.my_distributor_dashboard(); raise exception 'FAIL: dashboard for non-distributor';
  exception when insufficient_privilege then null; end;
 end loop;

 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('dist_qa.d1'),'role','authenticated','aal','aal1')::text,true);
 r:=public.my_distributor_dashboard();
 if jsonb_array_length(r->'orders')<>1 or jsonb_array_length(r->'customers')<>1 then raise exception 'FAIL: d1 sees only settled own orders %',r; end if;
 if (r->'orders'->0->>'totalMinor')::int<>200 or (r->'orders'->0->>'units')::int<>2 or r->'orders'->0->>'customer' !~ '^Customer [0-9A-F]{6}$' then
  raise exception 'FAIL: order summary %',r->'orders'; end if;
 if r->'customers'->0->>'expectedReorderOn'<>to_char((now()+interval '60 days') at time zone 'UTC','YYYY-MM-DD') then
  raise exception 'FAIL: reorder date %',r->'customers'->0; end if;
 if r::text ~* ('Sample QA|example.invalid|0000000000|Manila|'||current_setting('dist_qa.c1')||'|'||current_setting('dist_qa.order_c1')) then
  raise exception 'FAIL: personal data or identifiers exposed'; end if;
 perform set_config('dist_qa.label1',r->'orders'->0->>'customer',true);

 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('dist_qa.d2'),'role','authenticated','aal','aal1')::text,true);
 r:=public.my_distributor_dashboard();
 if jsonb_array_length(r->'orders')<>1 or r->'orders'->0->>'customer'=current_setting('dist_qa.label1') then raise exception 'FAIL: d2 isolation %',r; end if;
end $$;
reset role;

-- A refunded order leaves the dashboard.
update public.orders set payment_status='refunded',status='refunded' where id=current_setting('dist_qa.order_c3')::uuid;
set local role authenticated;
do $$ declare r jsonb; begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('dist_qa.d2'),'role','authenticated','aal','aal1')::text,true);
 r:=public.my_distributor_dashboard();
 if jsonb_array_length(r->'orders')<>0 then raise exception 'FAIL: refunded order still listed'; end if;

 -- Materials: editors with MFA in the market; distributors see published items for their market.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('dist_qa.ed'),'role','authenticated','aal','aal1')::text,true);
 begin perform public.save_distributor_material(null,'PH','Sample brochure','','/images/sample.pdf','QA-MAT',true); raise exception 'FAIL: material without MFA';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('dist_qa.ed'),'role','authenticated','aal','aal2')::text,true);
 begin perform public.save_distributor_material(null,'PH','Sample brochure','','https://evil.example/x','QA-MAT',true); raise exception 'FAIL: unapproved host';
 exception when check_violation then null; end;
 begin perform public.save_distributor_material(null,'PH','Sample brochure','','//evil.example/x','QA-MAT',true); raise exception 'FAIL: protocol-relative link';
 exception when check_violation then null; end;
 begin perform public.save_distributor_material(null,'SG','Sample SG brochure','','/images/sg.pdf','QA-MAT',true); raise exception 'FAIL: other market material';
 exception when insufficient_privilege then null; end;
 perform public.save_distributor_material(null,'PH','Sample brochure','Approved overview','/images/sample.pdf','QA-MAT',true);
 perform public.save_distributor_material(null,'PH','Sample draft','','/images/draft.pdf','QA-MAT',false);
 if jsonb_array_length(public.staff_distributor_materials())<2 then raise exception 'FAIL: staff material list'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('dist_qa.d1'),'role','authenticated','aal','aal1')::text,true);
 r:=public.my_distributor_dashboard();
 if jsonb_array_length(r->'materials')<>1 or r->'materials'->0->>'title'<>'Sample brochure' then raise exception 'FAIL: distributor materials %',r->'materials'; end if;
 begin perform public.staff_distributor_materials(); raise exception 'FAIL: distributor read staff materials';
 exception when insufficient_privilege then null; end;

 -- Photos: compliance/admin in the distributor's market, approved locations only.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('dist_qa.d1'),'role','authenticated','aal','aal2')::text,true);
 begin perform public.set_distributor_photo(current_setting('dist_qa.code1'),'/images/me.webp','SELF'); raise exception 'FAIL: self-approved photo';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('dist_qa.sgcomp'),'role','authenticated','aal','aal2')::text,true);
 begin perform public.set_distributor_photo(current_setting('dist_qa.code1'),'/images/me.webp','QA-PHOTO'); raise exception 'FAIL: other-market photo';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('dist_qa.comp'),'role','authenticated','aal','aal2')::text,true);
 begin perform public.set_distributor_photo(current_setting('dist_qa.code1'),'https://evil.example/me.webp','QA-PHOTO'); raise exception 'FAIL: unapproved photo host';
 exception when check_violation then null; end;
 begin perform public.set_distributor_photo(current_setting('dist_qa.code1'),'/images/me.webp',null); raise exception 'FAIL: photo without reference';
 exception when raise_exception then if SQLERRM<>'A photo needs an approval reference' then raise; end if; end;
 perform public.set_distributor_photo(current_setting('dist_qa.code1'),'/images/me.webp','QA-PHOTO');
end $$;
reset role;
set local role anon;
do $$ begin
 perform set_config('request.jwt.claims','{"role":"anon"}',true);
 if (select photo_url from public.lookup_distributor_store(current_setting('dist_qa.code1')))<>'/images/me.webp' then raise exception 'FAIL: public photo'; end if;
 if exists(select 1 from public.lookup_distributor_store('QD3-'||substr(current_setting('dist_qa.d3'),1,8))) then raise exception 'FAIL: unverified store visible'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.audit_logs where action in ('DISTRIBUTOR_PHOTO:approved','PRODUCT_REPLENISHMENT:30','DISTRIBUTOR_MATERIAL_SAVED'))<4 then
  raise exception 'FAIL: audit trail'; end if;
end $$;
rollback;
