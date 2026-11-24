-- Content scheduling and public editorial media acceptance. Synthetic fixtures; rolls back.
begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
select set_config('request.jwt.claims','{}',true);
do $$ declare ed uuid:=gen_random_uuid(); comp uuid:=gen_random_uuid(); sgcomp uuid:=gen_random_uuid(); cust uuid:=gen_random_uuid();
 m1 uuid:=gen_random_uuid(); m2 uuid:=gen_random_uuid(); m3 uuid:=gen_random_uuid(); begin
 insert into auth.users(id,email) select x,'schedule-qa-'||x||'@example.invalid' from unnest(array[ed,comp,sgcomp,cust]) x;
 insert into public.staff_roles(user_id,market,role) values(ed,'PH','editor'),(comp,'PH','compliance'),(sgcomp,'SG','compliance');
 insert into public.content_entries(slug,kind,title,market,status,publish_at,unpublish_at) values
  ('qa-sched-future','story','Future story','PH','published',now()+interval '1 day',null),
  ('qa-sched-expired','story','Expired story','PH','published',null,now()-interval '1 minute'),
  ('qa-sched-open','story','Open story','PH','published',now()-interval '1 hour',now()+interval '1 hour'),
  ('qa-sched-plain','story','Plain story','PH','published',null,null),
  ('qa-sched-draft','story','Draft story','PH','draft',now()-interval '1 hour',null);
 insert into public.content_entries(slug,kind,title,market,status,publish_at,starts_at) values
  ('qa-sched-event','event','Future event','PH','published',now()+interval '1 day',now()+interval '10 days');
 perform set_config('ci.event',(select id::text from public.content_entries where slug='qa-sched-event'),true);
 perform set_config('ci.cust',cust::text,true);
 insert into public.media_assets(id,market,object_path,file_name,mime_type,size_bytes,uploaded_by) values
  (m1,'PH','PH/'||m1||'.png','editor.png','image/png',100,ed),
  (m2,'PH','PH/'||m2||'.jpg','compliance.jpg','image/jpeg',100,comp),
  (m3,'PH','PH/'||m3||'.webp','r2.webp','image/webp',100,ed);
 update public.media_assets set storage_provider='r2' where id=m3;
 perform set_config('ci.ed',ed::text,true); perform set_config('ci.comp',comp::text,true); perform set_config('ci.sgcomp',sgcomp::text,true);
 perform set_config('ci.m1',m1::text,true); perform set_config('ci.m2',m2::text,true); perform set_config('ci.m3',m3::text,true);
 perform set_config('ci.url','https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/editorial-public/PH/'||m1||'.png',true);
 if has_function_privilege('anon','public.publish_media_asset(uuid,text,text)','execute')
 or has_function_privilege('anon','public.unpublish_media_asset(uuid)','execute')
 or has_function_privilege('authenticated','private.media_extension(text)','execute')
 or has_table_privilege('authenticated','public.media_assets','update') then raise exception 'FAIL: grants'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in ('publish_media_asset','unpublish_media_asset') and p.prosecdef) then raise exception 'FAIL: exposed definer'; end if;
 begin
  insert into public.content_entries(slug,kind,title,status,publish_at,unpublish_at) values('qa-sched-bad','story','Bad','draft',now(),now());
  raise exception 'FAIL: inverted window accepted';
 exception when check_violation then null; end;
end $$;

-- The public sees an approved entry only inside its window.
set local role anon;
do $$ declare v text[]; begin
 perform set_config('request.jwt.claims','{"role":"anon"}',true);
 select array_agg(slug order by slug) into v from public.content_entries where slug like 'qa-sched-%';
 if v is distinct from array['qa-sched-open','qa-sched-plain'] then raise exception 'FAIL: public window %',v; end if;
end $$;
reset role;

set local role authenticated;
do $$ declare n integer; begin
 -- Market staff still see scheduled and expired entries to manage them.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('ci.ed'),'role','authenticated','aal','aal2')::text,true);
 if (select count(*) from public.content_entries where slug like 'qa-sched-%')<>6 then raise exception 'FAIL: staff visibility'; end if;
 -- Editors cannot move an approved schedule.
 begin
  update public.content_entries set publish_at=now()-interval '1 day' where slug='qa-sched-future';
  raise exception 'FAIL: editor moved approved schedule';
 exception when raise_exception then if SQLERRM<>'Compliance approval required before publication' then raise; end if; end;
 -- Editors can schedule a draft; compliance approval keeps the window.
 update public.content_entries set publish_at=now()+interval '2 days' where slug='qa-sched-draft';
 get diagnostics n=row_count; if n<>1 then raise exception 'FAIL: editor schedule draft'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('ci.comp'),'role','authenticated','aal','aal2')::text,true);
 update public.content_entries set status='published' where slug='qa-sched-draft';
 if (select publish_at<=now() or approved_by is null from public.content_entries where slug='qa-sched-draft') then raise exception 'FAIL: approval kept schedule'; end if;
 update public.content_entries set publish_at=now()-interval '1 minute' where slug='qa-sched-future';
 get diagnostics n=row_count; if n<>1 then raise exception 'FAIL: compliance reschedule'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
 perform set_config('request.jwt.claims','{"role":"anon"}',true);
 if not exists(select 1 from public.content_entries where slug='qa-sched-future') then raise exception 'FAIL: rescheduled entry not public'; end if;
 if exists(select 1 from public.content_entries where slug='qa-sched-draft') then raise exception 'FAIL: future approval public'; end if;
end $$;
reset role;

-- Customers cannot register for an approved event before its publish time.
set local role authenticated;
do $$ begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('ci.cust'),'role','authenticated','aal','aal1')::text,true);
 if exists(select 1 from public.content_entries where slug='qa-sched-event') then raise exception 'FAIL: event visible before publish time'; end if;
 begin
  insert into public.event_registrations(event_id,user_id) values(current_setting('ci.event')::uuid,current_setting('ci.cust')::uuid);
  raise exception 'FAIL: registered for scheduled event';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Media publication: market admin/compliance, independent of the uploader, with a reference.
set local role authenticated;
do $$ declare n integer; p text; begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('ci.ed'),'role','authenticated','aal','aal2')::text,true);
 begin perform public.publish_media_asset(current_setting('ci.m1')::uuid,current_setting('ci.url'),'QA-REF');
  raise exception 'FAIL: editor published media';
 exception when insufficient_privilege then null; end;
 begin
  insert into storage.objects(bucket_id,name,owner_id) values('editorial-public','PH/'||current_setting('ci.m1')||'.png',current_setting('ci.ed'));
  raise exception 'FAIL: editor wrote public bucket';
 exception when insufficient_privilege then null; end;

 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('ci.sgcomp'),'role','authenticated','aal','aal2')::text,true);
 begin perform public.publish_media_asset(current_setting('ci.m1')::uuid,current_setting('ci.url'),'QA-REF');
  raise exception 'FAIL: other market published media';
 exception when insufficient_privilege then null; end;

 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('ci.comp'),'role','authenticated','aal','aal2')::text,true);
 begin perform public.publish_media_asset(current_setting('ci.m2')::uuid,
   replace(current_setting('ci.url'),current_setting('ci.m1')||'.png',current_setting('ci.m2')||'.jpg'),'QA-REF');
  raise exception 'FAIL: uploader published own media';
 exception when insufficient_privilege then null; end;
 begin perform public.publish_media_asset(current_setting('ci.m3')::uuid,
   replace(current_setting('ci.url'),current_setting('ci.m1')||'.png',current_setting('ci.m3')||'.webp'),'QA-REF');
  raise exception 'FAIL: r2 media published';
 exception when raise_exception then if SQLERRM<>'Only Supabase-stored media can be published' then raise; end if; end;
 begin perform public.publish_media_asset(current_setting('ci.m1')::uuid,current_setting('ci.url'),' x ');
  raise exception 'FAIL: published without reference';
 exception when raise_exception then if SQLERRM<>'An approval reference is required to publish' then raise; end if; end;
 foreach p in array array[
  replace(current_setting('ci.url'),'/PH/','/SG/'),
  replace(current_setting('ci.url'),'.png','.jpg'),
  replace(current_setting('ci.url'),'editorial-public','distributor-photos'),
  current_setting('ci.url')||'?x=1',
  'javascript:'||current_setting('ci.url')] loop
  begin perform public.publish_media_asset(current_setting('ci.m1')::uuid,p,'QA-REF');
   raise exception 'FAIL: bad location % accepted',p;
  exception when raise_exception then if SQLERRM<>'Invalid published media location' then raise; end if; end;
 end loop;
 insert into storage.objects(bucket_id,name,owner_id) values('editorial-public','PH/'||current_setting('ci.m1')||'.png',current_setting('ci.comp'));
 begin
  insert into storage.objects(bucket_id,name,owner_id) values('editorial-public','SG/'||gen_random_uuid()||'.png',current_setting('ci.comp'));
  raise exception 'FAIL: wrote another market folder';
 exception when insufficient_privilege then null; end;
 perform public.publish_media_asset(current_setting('ci.m1')::uuid,current_setting('ci.url'),' QA-REF ');
 if (select approval_reference<>'QA-REF' or published_by<>current_setting('ci.comp')::uuid from public.media_assets where id=current_setting('ci.m1')::uuid)
  then raise exception 'FAIL: publication recorded'; end if;
 begin perform public.publish_media_asset(current_setting('ci.m1')::uuid,current_setting('ci.url'),'QA-REF');
  raise exception 'FAIL: published twice';
 exception when raise_exception then if SQLERRM<>'This media is already published' then raise; end if; end;
end $$;
reset role;

-- Content images: published editorial images of the entry market, or bundled assets.
do $$ begin
 insert into public.content_entries(slug,kind,title,market,status,image_url) values('qa-img-ph','story','PH image','PH','published',current_setting('ci.url'));
 insert into public.content_entries(slug,kind,title,status,image_url) values('qa-img-global','story','Global image','draft',current_setting('ci.url'));
 insert into public.content_entries(slug,kind,title,status,image_url) values('qa-img-design','story','Bundled','draft','/design/conscientious/collection.jpg');
 begin insert into public.content_entries(slug,kind,title,market,status,image_url) values('qa-img-sg','story','SG image','SG','draft',current_setting('ci.url'));
  raise exception 'FAIL: other market image';
 exception when raise_exception then if SQLERRM<>'Choose a published editorial image for this market' then raise; end if; end;
 begin insert into public.content_entries(slug,kind,title,status,image_url) values('qa-img-ext','story','External','draft','https://evil.example/x.png');
  raise exception 'FAIL: external image';
 exception when raise_exception then if SQLERRM<>'Choose a published editorial image for this market' then raise; end if; end;
 begin insert into public.content_entries(slug,kind,title,status,image_url) values('qa-img-up','story','Traversal','draft','/design/../secret.png');
  raise exception 'FAIL: traversal image';
 exception when raise_exception then if SQLERRM<>'Choose a published editorial image for this market' then raise; end if; end;
 begin update public.content_entries set market='SG' where slug='qa-img-global';
  raise exception 'FAIL: market change kept foreign image';
 exception when raise_exception then if SQLERRM<>'Choose a published editorial image for this market' then raise; end if; end;
end $$;

-- Unpublishing is refused while published content uses the image.
set local role authenticated;
do $$ declare p text; begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('ci.ed'),'role','authenticated','aal','aal2')::text,true);
 begin perform public.unpublish_media_asset(current_setting('ci.m1')::uuid);
  raise exception 'FAIL: editor unpublished';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('ci.comp'),'role','authenticated','aal','aal2')::text,true);
 begin perform public.unpublish_media_asset(current_setting('ci.m1')::uuid);
  raise exception 'FAIL: unpublished image in use';
 exception when raise_exception then if SQLERRM<>'Remove this image from content in review or published first' then raise; end if; end;
 update public.content_entries set status='archived' where slug='qa-img-ph';
 p:=public.unpublish_media_asset(current_setting('ci.m1')::uuid);
 if p<>'PH/'||current_setting('ci.m1')||'.png' then raise exception 'FAIL: unpublish path %',p; end if;
 if exists(select 1 from public.media_assets where id=current_setting('ci.m1')::uuid and (public_url is not null or published_at is not null))
  then raise exception 'FAIL: unpublish cleared'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.audit_logs where entity='media_assets' and entity_id=current_setting('ci.m1')
  and action in ('MEDIA_PUBLISHED','MEDIA_UNPUBLISHED'))<>2 then raise exception 'FAIL: media audit'; end if;
end $$;

select 'PASS: scheduled publication window, staff-only scheduled visibility, independent media publication, public bucket scoping, content image guard and guarded unpublish; all fixtures rolled back' as result;
rollback;
