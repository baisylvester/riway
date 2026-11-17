-- Product recommendation acceptance. Fixtures roll back.
begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
select set_config('request.jwt.claims','{}',true);
do $$ declare editor uuid:=gen_random_uuid(); ops uuid:=gen_random_uuid(); u uuid:=gen_random_uuid();
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); e uuid:=gen_random_uuid(); draft uuid:=gen_random_uuid(); begin
 insert into auth.users(id,email) select x,'recs-qa-'||x||'@example.invalid' from unnest(array[editor,ops,u]) x;
 insert into public.staff_roles(user_id,market,role) values(editor,'PH','editor'),(ops,'PH','operations');
 insert into public.products(id,slug,name,category,status) select x,'recs-qa-'||x,'Recommendation sample','Nutrition','published' from unnest(array[a,b,c,d,e]) x;
 insert into public.products(id,slug,name,category,status) values(draft,'recs-qa-'||draft,'Recommendation draft','Nutrition','draft');
 perform set_config('recs_qa.editor',editor::text,true); perform set_config('recs_qa.ops',ops::text,true);
 perform set_config('recs_qa.customer',u::text,true);
 perform set_config('recs_qa.a',a::text,true); perform set_config('recs_qa.b',b::text,true); perform set_config('recs_qa.c',c::text,true);
 perform set_config('recs_qa.d',d::text,true); perform set_config('recs_qa.e',e::text,true); perform set_config('recs_qa.draft',draft::text,true);
 if has_table_privilege('authenticated','public.product_recommendations','insert,update,delete')
 or has_table_privilege('anon','public.product_recommendations','insert,update,delete')
 or has_function_privilege('anon','public.set_product_recommendations(uuid,uuid[])','execute') then raise exception 'FAIL: recommendation grants'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname='set_product_recommendations' and p.prosecdef) then raise exception 'FAIL: exposed recommendation definer'; end if;
end $$;

set local role authenticated;
do $$ declare who text; a uuid:=current_setting('recs_qa.a')::uuid; b uuid:=current_setting('recs_qa.b')::uuid; c uuid:=current_setting('recs_qa.c')::uuid;
 d uuid:=current_setting('recs_qa.d')::uuid; e uuid:=current_setting('recs_qa.e')::uuid; draft uuid:=current_setting('recs_qa.draft')::uuid; begin
 -- Customers, market operations staff and unverified editors cannot curate.
 foreach who in array array['customer','ops'] loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('recs_qa.'||who),'role','authenticated','aal','aal2')::text,true);
  begin
   perform public.set_product_recommendations(a,array[b]);
   raise exception 'FAIL: recommendations set by %',who;
  exception when insufficient_privilege then null; end;
 end loop;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('recs_qa.editor'),'role','authenticated','aal','aal1')::text,true);
 begin
  perform public.set_product_recommendations(a,array[b]);
  raise exception 'FAIL: recommendations without MFA';
 exception when insufficient_privilege then null; end;

 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('recs_qa.editor'),'role','authenticated','aal','aal2')::text,true);
 begin perform public.set_product_recommendations(a,array[b,c,d,e,draft]); raise exception 'FAIL: five picks';
 exception when raise_exception then if SQLERRM<>'Choose up to four recommended products' then raise; end if; end;
 begin perform public.set_product_recommendations(a,array[b,b]); raise exception 'FAIL: duplicate pick';
 exception when raise_exception then if SQLERRM<>'Each recommended product can be chosen once' then raise; end if; end;
 begin perform public.set_product_recommendations(a,array[a]); raise exception 'FAIL: self pick';
 exception when raise_exception then if SQLERRM<>'A product cannot recommend itself' then raise; end if; end;
 begin perform public.set_product_recommendations(a,array[gen_random_uuid()]); raise exception 'FAIL: unknown pick';
 exception when raise_exception then if SQLERRM<>'Recommended product not found' then raise; end if; end;
 begin
  insert into public.product_recommendations(product_id,recommended_id,position) values(a,b,0);
  raise exception 'FAIL: direct insert';
 exception when insufficient_privilege then null; end;

 if public.set_product_recommendations(a,array[c,b,draft])<>array[c,b,draft] then raise exception 'FAIL: save'; end if;
 if (select array_agg(recommended_id order by position) from public.product_recommendations where product_id=a)<>array[c,b,draft] then raise exception 'FAIL: staff read order'; end if;
 -- Replacing the list rewrites positions; an empty list clears it.
 perform public.set_product_recommendations(a,array[d,c]);
 if (select array_agg(recommended_id order by position) from public.product_recommendations where product_id=a)<>array[d,c] then raise exception 'FAIL: replace'; end if;
 perform public.set_product_recommendations(b,array[]::uuid[]);
 perform public.set_product_recommendations(a,array[d,c,draft]);
end $$;
reset role;

-- Shoppers see only links between published products.
set local role anon;
do $$ begin
 perform set_config('request.jwt.claims','{}',true);
 if (select array_agg(recommended_id order by position) from public.product_recommendations where product_id=current_setting('recs_qa.a')::uuid)
  <>array[current_setting('recs_qa.d')::uuid,current_setting('recs_qa.c')::uuid] then raise exception 'FAIL: public read hides drafts'; end if;
end $$;
reset role;

do $$ begin
 if (select count(*) from public.audit_logs where entity='products' and entity_id=current_setting('recs_qa.a') and action like 'PRODUCT_RECOMMENDATIONS:%')<>3 then raise exception 'FAIL: recommendation audit'; end if;
end $$;

select 'PASS: recommendation global-role/MFA scope, limits, ordered atomic replace, no direct writes, published-only public read, audit; fixtures rolled back' as result;
rollback;
