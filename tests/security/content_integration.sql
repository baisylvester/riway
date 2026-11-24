-- Content integration acceptance: product content publishing, opt-in
-- distributor directory and moderated photo submissions. Synthetic fixtures; rolls back.
begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
select set_config('request.jwt.claims','{}',true);
do $$ declare ed uuid:=gen_random_uuid(); comp uuid:=gen_random_uuid(); sgcomp uuid:=gen_random_uuid(); d1 uuid:=gen_random_uuid();
 d2 uuid:=gen_random_uuid(); d3 uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); begin
 insert into auth.users(id,email) select x,'content-qa-'||x||'@example.invalid' from unnest(array[ed,comp,sgcomp,d1,d2,d3,c]) x;
 insert into public.staff_roles(user_id,market,role) values(ed,'PH','editor'),(comp,'PH','compliance'),(sgcomp,'SG','compliance');
 insert into public.distributor_profiles(user_id,external_member_id,code,display_name,active,verified_at,market) values
  (d1,'QA-CI-1','QC1-'||substr(d1::text,1,8),'Sample listed distributor',true,now(),'PH'),
  (d2,'QA-CI-2','QC2-'||substr(d2::text,1,8),'Sample unlisted distributor',true,now(),'PH'),
  (d3,'QA-CI-3','QC3-'||substr(d3::text,1,8),'Sample unverified',true,null,'PH');
 insert into public.products(id,slug,name,category,status) values(p,'content-qa-'||p,'Sample content product','Nutrition','published');
 perform set_config('ci.ed',ed::text,true); perform set_config('ci.comp',comp::text,true); perform set_config('ci.sgcomp',sgcomp::text,true);
 perform set_config('ci.d1',d1::text,true); perform set_config('ci.d2',d2::text,true); perform set_config('ci.d3',d3::text,true);
 perform set_config('ci.c',c::text,true); perform set_config('ci.p',p::text,true);
 if has_table_privilege('authenticated','private.distributor_directory','select')
 or has_table_privilege('authenticated','private.distributor_photo_submissions','select')
 or has_table_privilege('anon','public.product_market_content','insert')
 or has_function_privilege('anon','public.set_distributor_listing(boolean,text)','execute')
 or has_function_privilege('anon','public.review_distributor_photo(uuid,boolean,text,text,text)','execute')
 or not has_function_privilege('anon','public.find_distributors(text,text)','execute') then raise exception 'FAIL: grants'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in ('my_distributor_listing','set_distributor_listing','find_distributors','submit_distributor_photo','staff_photo_submissions','review_distributor_photo')
  and p.prosecdef) then raise exception 'FAIL: exposed definer'; end if;
end $$;

-- Product content: editors draft, compliance publishes with a reference.
set local role authenticated;
do $$ declare n integer; begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('ci.ed'),'role','authenticated','aal','aal2')::text,true);
 insert into public.product_market_content(product_id,market,ingredients,usage,status) values(current_setting('ci.p')::uuid,'PH','Sample ingredients','Sample usage','review');
 begin
  update public.product_market_content set status='published',approval_reference='QA-REF' where product_id=current_setting('ci.p')::uuid;
  raise exception 'FAIL: editor published';
 exception when raise_exception then if SQLERRM<>'Compliance approval required before publication' then raise; end if; end;
 begin
  insert into public.product_market_content(product_id,market,status) values(current_setting('ci.p')::uuid,'SG','draft');
  raise exception 'FAIL: editor wrote another market';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.product_market_content(product_id,market,video_url) values(current_setting('ci.p')::uuid,'PH','https://evil.example/v');
  raise exception 'FAIL: unapproved video host';
 exception when check_violation or unique_violation then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('ci.comp'),'role','authenticated','aal','aal2')::text,true);
 begin
  update public.product_market_content set status='published' where product_id=current_setting('ci.p')::uuid;
  raise exception 'FAIL: published without reference';
 exception when raise_exception then if SQLERRM<>'An approval reference is required to publish' then raise; end if; end;
 update public.product_market_content set status='published',approval_reference='QA-REF',video_url='https://www.youtube.com/watch?v=abc123'
  where product_id=current_setting('ci.p')::uuid;
 get diagnostics n=row_count; if n<>1 then raise exception 'FAIL: compliance publish'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
 perform set_config('request.jwt.claims','{"role":"anon"}',true);
 if (select count(*) from public.product_market_content where product_id=current_setting('ci.p')::uuid and status='published' and approved_by is not null)<>1
  then raise exception 'FAIL: public published content'; end if;
end $$;
reset role;
update public.product_market_content set status='draft' where product_id=current_setting('ci.p')::uuid;
set local role anon;
do $$ begin
 if exists(select 1 from public.product_market_content where product_id=current_setting('ci.p')::uuid) then raise exception 'FAIL: draft visible to public'; end if;
end $$;
reset role;

-- Directory: opt-in by verified distributors only; public sees safe fields.
set local role authenticated;
do $$ declare r jsonb; begin
 foreach r in array array[to_jsonb(current_setting('ci.c')),to_jsonb(current_setting('ci.d3'))] loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',r#>>'{}','role','authenticated','aal','aal1')::text,true);
  begin perform public.set_distributor_listing(true,'Manila'); raise exception 'FAIL: listing by non-distributor';
  exception when insufficient_privilege then null; end;
 end loop;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('ci.d1'),'role','authenticated','aal','aal1')::text,true);
 begin perform public.set_distributor_listing(true,'<script>'); raise exception 'FAIL: unsafe city';
 exception when check_violation then null; end;
 r:=public.set_distributor_listing(true,' Quezon City ');
 if r->>'listed'<>'true' or r->>'city'<>'Quezon City' then raise exception 'FAIL: listing %',r; end if;
end $$;
reset role;
set local role anon;
do $$ declare n integer; begin
 perform set_config('request.jwt.claims','{"role":"anon"}',true);
 select count(*) into n from public.find_distributors('PH',null) where code like 'QC%';
 if n<>1 then raise exception 'FAIL: only the opted-in verified distributor is listed (%)',n; end if;
 if not exists(select 1 from public.find_distributors('PH','quezon')) then raise exception 'FAIL: city filter'; end if;
 if exists(select 1 from public.find_distributors('PH','%')) and not exists(select 1 from public.find_distributors('PH','Quezon')) then raise exception 'FAIL: wildcard'; end if;
 if exists(select 1 from public.find_distributors('SG',null) where code like 'QC%') then raise exception 'FAIL: market filter'; end if;
end $$;
reset role;

-- Photos: own folder only, one pending, market-scoped review.
set local role authenticated;
do $$ declare sid uuid; begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('ci.d1'),'role','authenticated','aal','aal1')::text,true);
 begin
  insert into storage.objects(bucket_id,name,owner_id) values('distributor-photo-submissions',current_setting('ci.d2')||'/'||gen_random_uuid()||'.png',current_setting('ci.d1'));
  raise exception 'FAIL: upload into another distributor folder';
 exception when insufficient_privilege then null; end;
 perform set_config('ci.path',current_setting('ci.d1')||'/'||gen_random_uuid()||'.png',true);
 insert into storage.objects(bucket_id,name,owner_id) values('distributor-photo-submissions',current_setting('ci.path'),current_setting('ci.d1'));
 begin perform public.submit_distributor_photo(current_setting('ci.d2')||'/'||gen_random_uuid()||'.png'); raise exception 'FAIL: foreign path';
 exception when raise_exception then if SQLERRM<>'Invalid photo location' then raise; end if; end;
 perform public.submit_distributor_photo(current_setting('ci.d1')||'/'||gen_random_uuid()||'.png');
 sid:=public.submit_distributor_photo(current_setting('ci.path'));
 perform set_config('ci.sid',sid::text,true);
 if (public.my_distributor_listing()->>'pendingPhoto')<>'true' then raise exception 'FAIL: pending flag'; end if;
 begin perform public.staff_photo_submissions(); raise exception 'FAIL: distributor sees review queue';
 exception when insufficient_privilege then null; end;
 begin perform public.review_distributor_photo(sid,true,'https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/distributor-photos/PH/'||gen_random_uuid()||'.png','SELF',null);
  raise exception 'FAIL: self approval';
 exception when insufficient_privilege then null; end;

 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('ci.sgcomp'),'role','authenticated','aal','aal2')::text,true);
 if jsonb_array_length(public.staff_photo_submissions())<>0 then raise exception 'FAIL: other-market review queue'; end if;
 begin perform public.review_distributor_photo(sid,false,null,null,'no'); raise exception 'FAIL: other-market review';
 exception when insufficient_privilege then null; end;

 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('ci.comp'),'role','authenticated','aal','aal2')::text,true);
 if jsonb_array_length(public.staff_photo_submissions())<>1 then raise exception 'FAIL: one pending submission per distributor'; end if;
 if not exists(select 1 from storage.objects where bucket_id='distributor-photo-submissions' and name=current_setting('ci.path')) then raise exception 'FAIL: reviewer cannot read submission'; end if;
 begin
  insert into storage.objects(bucket_id,name,owner_id) values('distributor-photos','SG/'||gen_random_uuid()||'.png',current_setting('ci.comp'));
  raise exception 'FAIL: publish into another market folder';
 exception when insufficient_privilege then null; end;
 begin perform public.review_distributor_photo(sid,true,'https://evil.example/x.png','QA-PHOTO',null); raise exception 'FAIL: bad public url';
 exception when raise_exception then if SQLERRM<>'Invalid published photo location' then raise; end if; end;
 perform set_config('ci.url','https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/distributor-photos/PH/'||gen_random_uuid()||'.png',true);
 perform public.review_distributor_photo(sid,true,current_setting('ci.url'),'QA-PHOTO','Approved');
 begin perform public.review_distributor_photo(sid,false,null,null,null); raise exception 'FAIL: double review';
 exception when raise_exception then if SQLERRM<>'This photo was already reviewed' then raise; end if; end;
end $$;
reset role;
set local role anon;
do $$ begin
 if (select photo_url from public.lookup_distributor_store('QC1-'||substr(current_setting('ci.d1'),1,8)))<>current_setting('ci.url') then raise exception 'FAIL: approved photo not public'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.distributor_photo_submissions where user_id=current_setting('ci.d1')::uuid and status='withdrawn')<>1 then raise exception 'FAIL: replaced submission withdrawn'; end if;
end $$;
rollback;
