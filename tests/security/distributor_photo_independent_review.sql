-- A staff member who is also a distributor needs another reviewer.
-- Exercises both admin and compliance with MFA; all fixtures roll back.
begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
select set_config('request.jwt.claims','{}',true);

do $$ declare a uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); begin
 insert into auth.users(id,email) select x,'photo-review-qa-'||x||'@example.invalid' from unnest(array[a,c]) x;
 insert into public.staff_roles(user_id,market,role) values(a,'PH','admin'),(c,'PH','compliance');
 insert into public.distributor_profiles(user_id,external_member_id,code,display_name,active,verified_at,market)
 select x,'QA-PHOTO-'||x,'QP-'||substr(x::text,1,8),'Sample staff distributor',true,now(),'PH' from unnest(array[a,c]) x;
 perform set_config('photo_qa.admin',a::text,true);
 perform set_config('photo_qa.compliance',c::text,true);
 if has_function_privilege('anon','public.review_distributor_photo(uuid,boolean,text,text,text)','execute')
 or has_function_privilege('anon','public.set_distributor_photo(text,text,text)','execute')
 or has_table_privilege('authenticated','private.distributor_photo_submissions','update') then raise exception 'FAIL: photo grants'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in ('review_distributor_photo','set_distributor_photo','staff_photo_submissions') and p.prosecdef) then
  raise exception 'FAIL: exposed definer'; end if;
end $$;

set local role authenticated;
do $$ declare who text; uid uuid; sid uuid; decision boolean; q jsonb; begin
 foreach who in array array['admin','compliance'] loop
  uid:=current_setting('photo_qa.'||who)::uuid;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','aal','aal2')::text,true);
  sid:=public.submit_distributor_photo(uid||'/'||gen_random_uuid()||'.png');
  perform set_config('photo_qa.'||who||'_submission',sid::text,true);

  -- Neither approving nor rejecting one's own submission is an independent review.
  foreach decision in array array[true,false] loop
   begin
    perform public.review_distributor_photo(sid,decision,
     'https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/distributor-photos/PH/'||gen_random_uuid()||'.png','QA-SELF',null);
    raise exception 'FAIL: % reviewed own submission (%)',who,decision;
   exception when insufficient_privilege then null; end;
  end loop;
  -- The direct staff setter must not bypass the review rule, including removal.
  begin
   perform public.set_distributor_photo('QP-'||substr(uid::text,1,8),'/images/self.png','QA-SELF');
   raise exception 'FAIL: % set own photo',who;
  exception when insufficient_privilege then null; end;
  begin
   perform public.set_distributor_photo('QP-'||substr(uid::text,1,8),null,null);
   raise exception 'FAIL: % cleared own photo',who;
  exception when insufficient_privilege then null; end;
  q:=public.staff_photo_submissions();
  if exists(select 1 from jsonb_array_elements(q) item where item->>'id'=sid::text) then
   raise exception 'FAIL: own submission in review queue'; end if;
 end loop;
end $$;
reset role;

do $$ begin
 if (select count(*) from private.distributor_photo_submissions
  where user_id in (current_setting('photo_qa.admin')::uuid,current_setting('photo_qa.compliance')::uuid)
  and status='pending' and reviewed_by is null and reviewed_at is null)<>2 then raise exception 'FAIL: refused reviews mutated submissions'; end if;
 if exists(select 1 from public.distributor_profiles where user_id in (current_setting('photo_qa.admin')::uuid,current_setting('photo_qa.compliance')::uuid)
  and (photo_url is not null or photo_reference is not null)) then raise exception 'FAIL: refused photo published'; end if;
 if exists(select 1 from public.audit_logs where actor_id in (current_setting('photo_qa.admin')::uuid,current_setting('photo_qa.compliance')::uuid)
  and (action like 'DISTRIBUTOR_PHOTO:%' or action in ('DISTRIBUTOR_PHOTO_APPROVED','DISTRIBUTOR_PHOTO_REJECTED'))) then
  raise exception 'FAIL: refused changes audited as successful'; end if;
end $$;

-- Another staff member in the same market can approve/reject or set a photo.
set local role authenticated;
do $$ declare q jsonb; begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('photo_qa.compliance'),'role','authenticated','aal','aal2')::text,true);
 q:=public.staff_photo_submissions();
 if not exists(select 1 from jsonb_array_elements(q) item where item->>'id'=current_setting('photo_qa.admin_submission')) then
  raise exception 'FAIL: independent reviewer cannot see submission'; end if;
 perform public.review_distributor_photo(current_setting('photo_qa.admin_submission')::uuid,true,
  'https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/distributor-photos/PH/'||gen_random_uuid()||'.png','QA-INDEPENDENT','Approved');
 perform public.set_distributor_photo('QP-'||substr(current_setting('photo_qa.admin'),1,8),'/images/approved.png','QA-INDEPENDENT');

 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('photo_qa.admin'),'role','authenticated','aal','aal2')::text,true);
 perform public.review_distributor_photo(current_setting('photo_qa.compliance_submission')::uuid,false,null,null,'Please resubmit');
end $$;
reset role;
do $$ begin
 if not exists(select 1 from private.distributor_photo_submissions where id=current_setting('photo_qa.admin_submission')::uuid
  and status='approved' and reviewed_by=current_setting('photo_qa.compliance')::uuid and reviewed_at is not null) then raise exception 'FAIL: approval provenance'; end if;
 if not exists(select 1 from private.distributor_photo_submissions where id=current_setting('photo_qa.compliance_submission')::uuid
  and status='rejected' and reviewed_by=current_setting('photo_qa.admin')::uuid and reviewed_at is not null) then raise exception 'FAIL: rejection provenance'; end if;
 if (select photo_url from public.distributor_profiles where user_id=current_setting('photo_qa.admin')::uuid)<>'/images/approved.png' then
  raise exception 'FAIL: independent setter'; end if;
end $$;
rollback;
