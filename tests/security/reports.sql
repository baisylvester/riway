-- Sales reporting acceptance. Fixtures and payments roll back. Totals are
-- compared with a baseline taken first, so existing settled orders do not
-- affect the result.
begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
select set_config('request.jwt.claims','{}',true);
do $$ declare admin uuid:=gen_random_uuid(); ops uuid:=gen_random_uuid(); sg_ops uuid:=gen_random_uuid(); editor uuid:=gen_random_uuid();
 u uuid:=gen_random_uuid(); sg_u uuid:=gen_random_uuid(); sponsor uuid:=gen_random_uuid(); sg_sponsor uuid:=gen_random_uuid();
 physical uuid:=gen_random_uuid(); package uuid:=gen_random_uuid(); sg_product uuid:=gen_random_uuid(); begin
 insert into auth.users(id,email) select x,'reports-qa-'||x||'@example.invalid' from unnest(array[admin,ops,sg_ops,editor,u,sg_u,sponsor,sg_sponsor]) x;
 insert into public.staff_roles(user_id,market,role) values(admin,'PH','admin'),(ops,'PH','operations'),(sg_ops,'SG','operations'),(editor,'PH','editor');
 insert into public.distributor_profiles(user_id,external_member_id,code,display_name,active,verified_at,market) values
  (sponsor,'QA-REPORT-'||sponsor,'QR-'||substr(sponsor::text,1,8),'Report sponsor PH',true,now(),'PH'),
  (sg_sponsor,'QA-REPORT-'||sg_sponsor,'QS-'||substr(sg_sponsor::text,1,8),'Report sponsor SG',true,now(),'SG');
 insert into public.sponsor_attributions(user_id,distributor_id) values(u,sponsor),(sg_u,sg_sponsor);
 insert into public.products(id,slug,name,category,status) values
  (physical,'reports-qa-'||physical,'Report physical product','Nutrition','published'),
  (package,'reports-qa-'||package,'Report package product','Packages','published'),
  (sg_product,'reports-qa-'||sg_product,'Report SG product','Nutrition','published');
 insert into public.product_offers(product_id,market,currency,retail_minor,regulatory_approved,approval_reference,max_quantity) values
  (physical,'PH','PHP',100,true,'ROLLBACK-QA',24),(package,'PH','PHP',500,true,'ROLLBACK-QA',24),(sg_product,'SG','SGD',300,true,'ROLLBACK-QA',24);
 insert into public.inventory(product_id,market,on_hand) values(physical,'PH',100),(sg_product,'SG',100);
 update public.markets set online_sales_approved=true,payments_ready=true,policy_reference='ROLLBACK-QA' where code in ('PH','SG');
 perform set_config('reports_qa.admin',admin::text,true); perform set_config('reports_qa.ops',ops::text,true);
 perform set_config('reports_qa.sg_ops',sg_ops::text,true); perform set_config('reports_qa.editor',editor::text,true);
 perform set_config('reports_qa.customer',u::text,true); perform set_config('reports_qa.sg_customer',sg_u::text,true);
 perform set_config('reports_qa.sponsor',sponsor::text,true); perform set_config('reports_qa.sg_sponsor',sg_sponsor::text,true);
 perform set_config('reports_qa.physical',physical::text,true); perform set_config('reports_qa.package',package::text,true);
 perform set_config('reports_qa.sg_product',sg_product::text,true);
 if has_function_privilege('anon','public.staff_sales_report(date,date)','execute')
 or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='staff_sales_report' and p.prosecdef)
  then raise exception 'FAIL: report grants'; end if;
end $$;

set local role authenticated;
do $$ declare d jsonb; o jsonb; who text; begin
 -- Customers and editors cannot read sales; invalid ranges are refused.
 foreach who in array array['customer','editor'] loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('reports_qa.'||who),'role','authenticated','aal','aal2')::text,true);
  begin
   perform public.staff_sales_report(current_date,current_date);
   raise exception 'FAIL: sales report for %',who;
  exception when insufficient_privilege then null; end;
 end loop;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('reports_qa.ops'),'role','authenticated','aal','aal1')::text,true);
 begin
  perform public.staff_sales_report(current_date,current_date);
  raise exception 'FAIL: sales report without MFA';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('reports_qa.ops'),'role','authenticated','aal','aal2')::text,true);
 begin
  perform public.staff_sales_report(current_date,current_date-1);
  raise exception 'FAIL: reversed range accepted';
 exception when raise_exception then if SQLERRM<>'Choose a date range of up to 366 days' then raise; end if; end;
 begin
  perform public.staff_sales_report(current_date-400,current_date);
  raise exception 'FAIL: oversized range accepted';
 exception when raise_exception then if SQLERRM<>'Choose a date range of up to 366 days' then raise; end if; end;
 perform set_config('reports_qa.baseline',public.staff_sales_report(current_date-1,current_date+1)::text,true);

 -- An approved package offer, so package sales can be reported.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('reports_qa.admin'),'role','authenticated','aal','aal2')::text,true);
 d:=public.save_commerce_draft(null,'package','PH','Report package','review',jsonb_build_object('components',
  jsonb_build_array(jsonb_build_object('productId',current_setting('reports_qa.physical'),'quantity',1)),'retailMinor',500,'memberMinor',400),0);
 o:=public.approve_commerce_draft((d->>'id')::uuid,1,current_setting('reports_qa.package')::uuid,'ROLLBACK-SAMPLE');
 perform set_config('reports_qa.offer',o->>'id',true);

 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('reports_qa.customer'),'role','authenticated','aal','aal1')::text,true);
 perform set_config('reports_qa.order_a',public.create_commerce_order('PH',jsonb_build_array(jsonb_build_object('productId',current_setting('reports_qa.physical'),'quantity',2)),
  '{"full_name":"Sample QA customer","phone":"0000000000","line1":"Sample QA address","city":"Manila","postal_code":"1000","country":"PH"}'::jsonb,
  gen_random_uuid(),(select checkout_terms_version from public.markets where code='PH'))::text,true);
 perform set_config('reports_qa.order_b',public.create_commerce_order('PH',jsonb_build_array(jsonb_build_object('productId',current_setting('reports_qa.package'),'quantity',1)),
  '{"full_name":"Sample QA customer","phone":"0000000000","line1":"Sample QA address","city":"Manila","postal_code":"1000","country":"PH"}'::jsonb,
  gen_random_uuid(),(select checkout_terms_version from public.markets where code='PH'))::text,true);
 perform set_config('reports_qa.order_unpaid',public.create_commerce_order('PH',jsonb_build_array(jsonb_build_object('productId',current_setting('reports_qa.physical'),'quantity',1)),
  '{"full_name":"Sample QA customer","phone":"0000000000","line1":"Sample QA address","city":"Manila","postal_code":"1000","country":"PH"}'::jsonb,
  gen_random_uuid(),(select checkout_terms_version from public.markets where code='PH'))::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('reports_qa.sg_customer'),'role','authenticated','aal','aal1')::text,true);
 perform set_config('reports_qa.order_sg',public.create_commerce_order('SG',jsonb_build_array(jsonb_build_object('productId',current_setting('reports_qa.sg_product'),'quantity',1)),
  '{"full_name":"Sample QA customer","phone":"0000000000","line1":"Sample QA address","city":"Singapore","postal_code":"100000","country":"SG"}'::jsonb,
  gen_random_uuid(),(select checkout_terms_version from public.markets where code='SG'))::text,true);
end $$;
reset role;

set local role service_role;
do $$ declare c jsonb; k text; oid uuid; amount bigint; cur text; customer uuid; begin
 foreach k in array array['order_a','order_b','order_sg'] loop
  oid:=current_setting('reports_qa.'||k)::uuid;
  select total_minor,lower(currency),user_id into amount,cur,customer from public.orders where id=oid;
  c:=public.prepare_stripe_checkout(oid,customer,false,'https://example.invalid');
  if public.apply_stripe_checkout_event('evt_report_'||oid,(c->>'id')::uuid,oid,'cs_test_report_'||k,false,amount,cur,'complete','paid','pi_report'||replace(k,'_',''))<>'paid' then
   raise exception 'FAIL: fixture payment %',k;
  end if;
 end loop;
end $$;
reset role;

set local role authenticated;
do $$ declare b jsonb:=current_setting('reports_qa.baseline')::jsonb; r jsonb; m jsonb; bm jsonb; x jsonb; begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('reports_qa.ops'),'role','authenticated','aal','aal2')::text,true);
 r:=public.staff_sales_report(current_date-1,current_date+1);
 if r->'markets'<>'["PH"]'::jsonb then raise exception 'FAIL: PH staff market scope %',r->'markets'; end if;
 if exists(select 1 from jsonb_array_elements(r->'byMarket'||r->'byProduct'||r->'byPackage'||r->'byDistributor') e where e->>'market'<>'PH') then raise exception 'FAIL: other-market sales leaked'; end if;
 select e into m from jsonb_array_elements(r->'byMarket') e where e->>'market'='PH';
 select e into bm from jsonb_array_elements(b->'byMarket') e where e->>'market'='PH';
 if (m->>'orders')::int-coalesce((bm->>'orders')::int,0)<>2 or (m->>'totalMinor')::bigint-coalesce((bm->>'totalMinor')::bigint,0)<>700 or m->>'currency'<>'PHP' then
  raise exception 'FAIL: PH market totals %',m;
 end if;
 select e into x from jsonb_array_elements(r->'byProduct') e where e->>'productId'=current_setting('reports_qa.physical');
 if (x->>'units')::int<>2 or (x->>'netMinor')::bigint<>200 then raise exception 'FAIL: unpaid order counted or product totals wrong %',x; end if;
 select e into x from jsonb_array_elements(r->'byPackage') e where e->>'packageOfferId'=current_setting('reports_qa.offer');
 if (x->>'units')::int<>1 or (x->>'netMinor')::bigint<>500 or x->>'name'<>'Report package' then raise exception 'FAIL: package totals %',x; end if;
 select e into x from jsonb_array_elements(r->'byDistributor') e where e->>'distributorId'=current_setting('reports_qa.sponsor');
 if (x->>'orders')::int<>2 or (x->>'totalMinor')::bigint<>700 or x->>'name'<>'Report sponsor PH' then raise exception 'FAIL: distributor totals %',x; end if;
 -- The new customer's two settled orders: one first purchase, one repeat; no enrolment.
 declare first_now int; first_was int; repeat_now int; repeat_was int; begin
  select coalesce(sum((e->>'orders')::int),0) into first_now from jsonb_array_elements(r->'byChannel') e where e->>'market'='PH' and e->>'channel'='first_purchase';
  select coalesce(sum((e->>'orders')::int),0) into first_was from jsonb_array_elements(coalesce(b->'byChannel','[]'::jsonb)) e where e->>'market'='PH' and e->>'channel'='first_purchase';
  select coalesce(sum((e->>'orders')::int),0) into repeat_now from jsonb_array_elements(r->'byChannel') e where e->>'market'='PH' and e->>'channel'='repeat_purchase';
  select coalesce(sum((e->>'orders')::int),0) into repeat_was from jsonb_array_elements(coalesce(b->'byChannel','[]'::jsonb)) e where e->>'market'='PH' and e->>'channel'='repeat_purchase';
  if first_now-first_was<>1 or repeat_now-repeat_was<>1 then raise exception 'FAIL: channel split first %->% repeat %->%',first_was,first_now,repeat_was,repeat_now; end if;
  if (select sum((e->>'orders')::int) from jsonb_array_elements(r->'byChannel') e where e->>'market'='PH')<>(m->>'orders')::int then raise exception 'FAIL: channel orders differ from market orders'; end if;
  if (select sum((e->>'totalMinor')::bigint) from jsonb_array_elements(r->'byChannel') e where e->>'market'='PH')<>(m->>'totalMinor')::bigint then raise exception 'FAIL: channel totals differ from market totals'; end if;
  if exists(select 1 from jsonb_array_elements(r->'byChannel') e where e->>'market'<>'PH') then raise exception 'FAIL: other-market channel leaked'; end if;
 end;
 if jsonb_array_length(public.staff_sales_report(current_date-30,current_date-20)->'byProduct')<>0
  and exists(select 1 from jsonb_array_elements(public.staff_sales_report(current_date-30,current_date-20)->'byProduct') e where e->>'productId'=current_setting('reports_qa.physical'))
  then raise exception 'FAIL: date range ignored'; end if;

 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('reports_qa.sg_ops'),'role','authenticated','aal','aal2')::text,true);
 r:=public.staff_sales_report(current_date-1,current_date+1);
 if r->'markets'<>'["SG"]'::jsonb or exists(select 1 from jsonb_array_elements(r->'byDistributor') e where e->>'distributorId'=current_setting('reports_qa.sponsor')) then raise exception 'FAIL: SG staff scope'; end if;
 select e into x from jsonb_array_elements(r->'byProduct') e where e->>'productId'=current_setting('reports_qa.sg_product');
 if (x->>'netMinor')::bigint<>300 or x->>'currency'<>'SGD' then raise exception 'FAIL: SG product totals %',x; end if;
end $$;
reset role;

select 'PASS: sales report role/market/MFA scope, settled-only totals by market, channel, product, package and distributor, per-currency amounts and date range; fixtures rolled back' as result;
rollback;
