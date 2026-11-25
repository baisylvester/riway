begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
select set_config('request.jwt.claims','{}',true);
do $$ declare u uuid; k text; begin
 foreach k in array array['distributor','distributor2','customer','customer2','editor','reviewer','sgreviewer'] loop
  u:=gen_random_uuid(); insert into auth.users(id,email,email_confirmed_at) values(u,'optional-qa-'||u||'@example.invalid',now());
  perform set_config('opt.'||k,u::text,true);
 end loop;
 insert into public.distributor_profiles(user_id,code,display_name,market,external_member_id,verified_at,active)
 values(current_setting('opt.distributor')::uuid,'Q'||replace(current_setting('opt.distributor'),'-',''),'QA Distributor','PH','QA-'||current_setting('opt.distributor'),now(),true),
 (current_setting('opt.distributor2')::uuid,'Q'||replace(current_setting('opt.distributor2'),'-',''),'QA Distributor 2','PH','QA-'||current_setting('opt.distributor2'),now(),true);
 insert into public.staff_roles(user_id,market,role) values(current_setting('opt.editor')::uuid,'PH','editor'),(current_setting('opt.reviewer')::uuid,'PH','compliance'),(current_setting('opt.sgreviewer')::uuid,'SG','compliance');
end $$;
set local role authenticated;
do $$ declare s uuid; s2 uuid; b uuid; result jsonb; a uuid; event uuid; token uuid; begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('opt.customer'),'role','authenticated','aal','aal1')::text,true);
 begin perform public.save_consultation_slot(null,now()+interval '2 days',now()+interval '2 days 1 hour','Asia/Manila',true);raise exception 'FAIL: customer availability';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('opt.distributor'),'role','authenticated','aal','aal1')::text,true);
 s:=public.save_consultation_slot(null,now()+interval '2 days',now()+interval '2 days 1 hour','Asia/Manila',true);
 perform set_config('opt.slot',s::text,true);
 s2:=public.save_consultation_slot(null,now()+interval '3 days',now()+interval '3 days 1 hour','Asia/Manila',true);
 perform set_config('opt.slot2',s2::text,true);
 begin perform public.save_consultation_slot(null,now()+interval '2 days 30 minutes',now()+interval '2 days 2 hours','Asia/Manila',true);raise exception 'FAIL: overlapping availability';exception when exclusion_violation then null;end;
 begin perform public.save_consultation_slot(null,now()+interval '4 days',now()+interval '4 days 1 hour','Invalid/Zone',true);raise exception 'FAIL: timezone';exception when invalid_parameter_value then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('opt.customer'),'role','authenticated','aal','aal1')::text,true);
 b:=public.change_consultation(null,s,0,'Asia/Singapore',false);perform set_config('opt.booking',b::text,true);
 if public.change_consultation(null,s,0,'Asia/Singapore',false)<>b then raise exception 'FAIL: duplicate booking';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('opt.customer2'),'role','authenticated','aal','aal1')::text,true);
 begin perform public.change_consultation(null,s,0,'UTC',false);raise exception 'FAIL: double booking';exception when exclusion_violation then null;end;
 begin perform public.change_consultation(b,s2,0,'UTC',false);raise exception 'FAIL: other customer reschedule';exception when insufficient_privilege then null;end;
 if jsonb_array_length(public.consultations(null)->'bookings')<>0 then raise exception 'FAIL: booking disclosure';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('opt.distributor'),'role','authenticated','aal','aal1')::text,true);
 begin perform public.save_consultation_slot(s,now()+interval '4 days',now()+interval '4 days 1 hour','UTC',true);raise exception 'FAIL: booked slot changed';exception when invalid_parameter_value then null;end;
 begin perform public.change_consultation(b,s2,0,'UTC',false);raise exception 'FAIL: distributor rescheduled customer';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('opt.customer'),'role','authenticated','aal','aal1')::text,true);
 perform public.change_consultation(b,s2,0,'UTC',false);
 begin perform public.change_consultation(b,s,0,'UTC',false);raise exception 'FAIL: stale booking edit';exception when serialization_failure then null;end;
 if (public.consultations(null)->'bookings'->0->>'revision')::int<>1 then raise exception 'FAIL: revision';end if;
 perform public.change_consultation(b,null,1,'UTC',true);
 -- Library editor drafts, independent reviewer publishes; unrelated accounts
 -- cannot write/read staff drafts, and distributor sees only live own market.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('opt.editor'),'role','authenticated','aal','aal2')::text,true);
 a:=public.save_library_version(null,0,'PH',jsonb_build_object('title','QA Campaign','locale','en','mediaType','video','url','https://vimeo.com/123456','transcript','Accessible approved QA transcript.','campaign','QA summer'));
 perform set_config('opt.asset',a::text,true);
 begin perform public.review_library_version(a,1,'QA-APPROVAL',false);raise exception 'FAIL: editor published';exception when insufficient_privilege then null;end;
 if public.shared_library_asset(a,'PH') is not null then raise exception 'FAIL: draft public';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('opt.sgreviewer'),'role','authenticated','aal','aal2')::text,true);
 begin perform public.review_library_version(a,1,'QA-APPROVAL',false);raise exception 'FAIL: cross market review';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('opt.reviewer'),'role','authenticated','aal','aal1')::text,true);
 begin perform public.review_library_version(a,1,'QA-APPROVAL',false);raise exception 'FAIL: review without MFA';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('opt.reviewer'),'role','authenticated','aal','aal2')::text,true);
 perform public.review_library_version(a,1,'QA-APPROVAL',false);
 if public.shared_library_asset(a,'SG') is not null then raise exception 'FAIL: cross market shared asset';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('opt.distributor'),'role','authenticated','aal','aal1')::text,true);
 result:=public.search_library('PH','en','summer','video',0,false);
 if not exists(select 1 from jsonb_array_elements(result->'assets') r where r->>'id'=a::text) then raise exception 'FAIL: library search';end if;
 begin perform public.search_library('SG',null,null,null,0,false);raise exception 'FAIL: distributor market escape';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('opt.reviewer'),'role','authenticated','aal','aal2')::text,true);
 perform public.save_library_version(a,1,'PH',jsonb_build_object('title','QA Revised Campaign','locale','en','mediaType','image','url','/images/test.png'));
 if public.shared_library_asset(a,'PH')->>'title'<>'QA Campaign' then raise exception 'FAIL: draft replaced live';end if;
 begin perform public.review_library_version(a,2,'QA-SELF',false);raise exception 'FAIL: self review';exception when insufficient_privilege then null;end;
 perform public.review_library_version(a,2,'QA-WITHDRAW',true);
 if public.shared_library_asset(a,'PH') is not null then raise exception 'FAIL: withdrawn link still live';end if;
 begin perform public.save_library_version(a,1,'PH',jsonb_build_object('title','Stale','locale','en','mediaType','image','url','/images/test.png'));raise exception 'FAIL: stale asset edit';exception when serialization_failure then null;end;
end $$;
reset role;
do $$ declare s uuid; b uuid:=current_setting('opt.booking')::uuid; j record; begin
 -- Reminders deduplicate and cancelled/rescheduled updates are suppressed at
 -- delivery time, preserving the existing worker's leases and idempotency.
 update private.consultation_slots set starts_at=now()+interval '12 hours',ends_at=now()+interval '13 hours' where id=current_setting('opt.slot2')::uuid;
 update private.consultation_bookings set status='booked' where id=b;
 perform public.queue_consultation_reminders();perform public.queue_consultation_reminders();
 if (select count(*) from private.consultation_events where booking_id=b and revision=2 and kind='reminder')<>1 then raise exception 'FAIL: reminder dedup';end if;
 for j in select * from private.notification_jobs where reference in (select id from private.consultation_events where booking_id=b) loop
  update private.notification_jobs set status='processing',lease=gen_random_uuid(),lease_until=now()+interval '5 minutes' where id=j.id returning * into j;
  if public.notification_authorized(j.id,j.lease)<>(j.context->>'revision'='2') then raise exception 'FAIL: outdated notice authorization';end if;
 end loop;
 update private.consultation_bookings set status='cancelled' where id=b;
 if exists(select 1 from private.notification_jobs where kind='consultation_reminder' and user_id=current_setting('opt.customer')::uuid and public.notification_authorized(id,lease)) then raise exception 'FAIL: cancelled reminder';end if;
 if has_function_privilege('anon','public.change_consultation(uuid,uuid,integer,text,boolean)','execute') then raise exception 'FAIL: anonymous booking grant';end if;
 if has_table_privilege('authenticated','private.consultation_bookings','select') then raise exception 'FAIL: direct booking read';end if;
 if has_table_privilege('authenticated','private.library_versions','update') then raise exception 'FAIL: immutable library revision';end if;
end $$;
rollback;
