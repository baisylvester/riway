begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
select set_config('request.jwt.claims','{}',true);
do $$ declare label text; u uuid; begin
 foreach label in array array['owner','other','admin','compliance','sg','editor','operations'] loop
  u:=gen_random_uuid();
  insert into auth.users(id,email) values(u,'privacy-qa-'||u||'@example.invalid');
  perform set_config('privacy_qa.'||label,u::text,true);
  if label not in ('owner','other') then
   insert into public.staff_roles(user_id,market,role) values(u,case when label='sg' then 'SG' else 'PH' end,case when label='sg' then 'admin' else label end);
  end if;
 end loop;
 if has_table_privilege('authenticated','private.privacy_requests','select') or has_table_privilege('authenticated','private.privacy_request_events','insert')
  or has_table_privilege('service_role','private.privacy_requests','update') or has_function_privilege('anon','public.create_privacy_request(text,text,text)','execute') then raise exception 'FAIL: privacy grants'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
  ('create_privacy_request','list_privacy_requests','get_privacy_request','update_privacy_request') and p.prosecdef) then raise exception 'FAIL: exposed definer'; end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname in ('privacy_requests','privacy_request_events') and not c.relrowsecurity) then raise exception 'FAIL: missing RLS'; end if;
end $$;
set local role authenticated;
do $$ declare id uuid; q jsonb; begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('privacy_qa.owner'),'role','authenticated','aal','aal1')::text,true);
 id:=public.create_privacy_request('PH','access','Please provide a copy of my account data.');
 perform set_config('privacy_qa.request',id::text,true);
 if public.create_privacy_request('PH','access','Please provide a copy of my account data.')<>id then raise exception 'FAIL: duplicate intake'; end if;
 begin perform public.create_privacy_request('PH','access','A different open request for the same data.'); raise exception 'FAIL: duplicate open case'; exception when unique_violation then null; end;
 begin perform public.create_privacy_request(null,'access','Please provide a copy of my account data.'); raise exception 'FAIL: null market'; exception when invalid_parameter_value then null; end;
 begin perform public.create_privacy_request('US','access','Please provide a copy of my account data.'); raise exception 'FAIL: unsupported market'; exception when invalid_parameter_value then null; end;
 begin perform public.create_privacy_request('PH','unknown','Please provide a copy of my account data.'); raise exception 'FAIL: unsupported kind'; exception when invalid_parameter_value then null; end;
 begin perform public.create_privacy_request('SG','access','short'); raise exception 'FAIL: short details'; exception when invalid_parameter_value then null; end;
 begin perform public.create_privacy_request('SG','access',repeat('a',2001)); raise exception 'FAIL: long details'; exception when invalid_parameter_value then null; end;
 begin perform public.create_privacy_request('SG','access','Please provide a copy'||chr(1)||' of my account data.'); raise exception 'FAIL: control chars'; exception when invalid_parameter_value then null; end;
 q:=public.list_privacy_requests();
 if q->>'total'<>'1' or q->'requests'->0->>'id'<>id::text then raise exception 'FAIL: owner history'; end if;
 if public.get_privacy_request(id)->>'details'<>'Please provide a copy of my account data.' then raise exception 'FAIL: own case'; end if;
 begin perform public.list_privacy_requests(false,null,false,-1); raise exception 'FAIL: negative page'; exception when invalid_parameter_value then null; end;
 begin perform public.get_privacy_request(id,false,1000001); raise exception 'FAIL: excessive page'; exception when invalid_parameter_value then null; end;
 begin perform public.update_privacy_request(id,0,'review','in_review','Forged staff update',null,null); raise exception 'FAIL: customer review'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims','{}',true);
 begin perform public.list_privacy_requests(); raise exception 'FAIL: anonymous identity'; exception when insufficient_privilege then null; end;
end $$;
do $$ declare label text; id uuid:=current_setting('privacy_qa.request')::uuid; begin
 foreach label in array array['other','sg','editor','operations'] loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('privacy_qa.'||label),'role','authenticated','aal','aal2','user_metadata',jsonb_build_object('role','admin'))::text,true);
  begin perform public.get_privacy_request(id); raise exception 'FAIL: foreign owner read (%)',label; exception when insufficient_privilege then null; end;
  begin perform public.get_privacy_request(id,true); raise exception 'FAIL: unauthorized staff read (%)',label; exception when insufficient_privilege then null; end;
  begin perform public.update_privacy_request(id,0,'review','in_review','Unauthorized staff review',null,null); raise exception 'FAIL: unauthorized review (%)',label; exception when insufficient_privilege then null; end;
  begin perform public.update_privacy_request(id,0,'withdraw'); raise exception 'FAIL: foreign withdrawal (%)',label; exception when insufficient_privilege then null; end;
  begin perform public.list_privacy_requests(true,'PH'); raise exception 'FAIL: unauthorized queue (%)',label; exception when insufficient_privilege then null; end;
 end loop;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('privacy_qa.admin'),'role','authenticated','aal','aal1')::text,true);
 begin perform public.get_privacy_request(id,true); raise exception 'FAIL: unverified staff read'; exception when insufficient_privilege then null; end;
 begin perform public.update_privacy_request(id,0,'review','in_review','No second-step verification',null,null); raise exception 'FAIL: unverified review'; exception when insufficient_privilege then null; end;
end $$;
do $$ declare id uuid:=current_setting('privacy_qa.request')::uuid; own_id uuid; q jsonb; begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('privacy_qa.admin'),'role','authenticated','aal','aal2')::text,true);
 own_id:=public.create_privacy_request('PH','correction','Please correct my own account details.');
 if public.get_privacy_request(own_id)->>'id'<>own_id::text then raise exception 'FAIL: staff own access'; end if;
 begin perform public.update_privacy_request(own_id,0,'review','in_review','Self review should be refused',null,null); raise exception 'FAIL: own review'; exception when insufficient_privilege then null; end;
 q:=public.list_privacy_requests(true,'PH');
 if q->>'total'<>'1' or q->'requests'->0->>'id'<>id::text then raise exception 'FAIL: scoped queue or self exclusion'; end if;
 begin perform public.update_privacy_request(id,0,'review','completed','Completed before review','VERIFY-1','CASE-1'); raise exception 'FAIL: skip review'; exception when invalid_parameter_value then null; end;
 if public.update_privacy_request(id,0,'review','in_review','We are reviewing your request.',null,null)<>1 then raise exception 'FAIL: revision'; end if;
 begin perform public.update_privacy_request(id,0,'review','needs_information','Stale update must not overwrite',null,null); raise exception 'FAIL: stale write'; exception when serialization_failure then null; end;
 begin perform public.update_privacy_request(id,1,'review','completed','Manual fulfilment complete.',null,'CASE-1'); raise exception 'FAIL: no identity verification'; exception when invalid_parameter_value then null; end;
 begin perform public.update_privacy_request(id,1,'review','completed','Manual fulfilment complete.','VERIFY-1',null); raise exception 'FAIL: no resolution reference'; exception when invalid_parameter_value then null; end;
 begin perform public.update_privacy_request(id,1,'review','completed','Manual fulfilment complete.',chr(1)||'VERIFY-1','CASE-1'); raise exception 'FAIL: bad reference'; exception when invalid_parameter_value then null; end;
 perform public.update_privacy_request(id,1,'review','needs_information','Please clarify the date range for your request.',null,null);
end $$;
do $$ declare id uuid:=current_setting('privacy_qa.request')::uuid; q jsonb; begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('privacy_qa.owner'),'role','authenticated','aal','aal1')::text,true);
 perform public.update_privacy_request(id,2,'message','completed','Please include all of my orders.','FORGED-VERIFY','FORGED-CASE');
 q:=public.get_privacy_request(id);
 if q->>'status'<>'submitted' or (q->>'identityVerified')::boolean then raise exception 'FAIL: customer forged review fields'; end if;
end $$;
do $$ declare id uuid:=current_setting('privacy_qa.request')::uuid; q jsonb; begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('privacy_qa.compliance'),'role','authenticated','aal','aal2')::text,true);
 perform public.update_privacy_request(id,3,'review','in_review','We are processing the approved date range.','VERIFY-1',null);
 perform public.update_privacy_request(id,4,'review','completed','Your request has been fulfilled through our approved process.',null,'CASE-1');
 q:=public.get_privacy_request(id,true);
 if q->>'status'<>'completed' or not (q->>'identityVerified')::boolean or q->>'totalEvents'<>'6' then raise exception 'FAIL: completed case or events'; end if;
 if q::text like '%VERIFY-1%' or q::text like '%CASE-1%' or q ? 'user_id' or q::text like '%actor_id%' then raise exception 'FAIL: internal reference exposure'; end if;
 if public.list_privacy_requests(true,'PH',false)->>'total'<>'1' or public.list_privacy_requests(true,'PH',true)->>'total'<>'1' then raise exception 'FAIL: closed queue'; end if;
 begin perform public.update_privacy_request(id,5,'review','in_review','Reopening completed request',null,null); raise exception 'FAIL: reopen closed case'; exception when invalid_parameter_value then null; end;
end $$;
do $$ declare id uuid:=current_setting('privacy_qa.request')::uuid; other_id uuid; begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('privacy_qa.owner'),'role','authenticated','aal','aal1')::text,true);
 begin perform public.update_privacy_request(id,5,'message',null,'Cannot append to a closed request'); raise exception 'FAIL: closed message'; exception when invalid_parameter_value then null; end;
 other_id:=public.create_privacy_request('PH','restriction','Please restrict processing of my account data.');
 perform public.update_privacy_request(other_id,0,'withdraw');
 if public.get_privacy_request(other_id)->>'status'<>'withdrawn' then raise exception 'FAIL: withdrawal'; end if;
 if public.create_privacy_request('PH','restriction','Please restrict processing of my account data.')=other_id then raise exception 'FAIL: new case after withdrawal'; end if;
end $$;
reset role;
do $$ declare u uuid:=current_setting('privacy_qa.other')::uuid; id uuid; begin
 -- More than one page of requests and conversation, without production data.
 for n in 1..28 loop
  insert into private.privacy_requests as r(user_id,market,kind,details,status) values(u,'SG','access','Pagination fixture for account data.','withdrawn') returning r.id into id;
 end loop;
 perform set_config('privacy_qa.paged',id::text,true);
 for n in 0..27 loop
  insert into private.privacy_request_events(request_id,actor_id,revision,by_staff,status,message) values(id,u,n,false,'withdrawn','Pagination message '||n);
 end loop;
 if exists(select 1 from private.privacy_requests r where r.id=current_setting('privacy_qa.request')::uuid and (verification_reference<>'VERIFY-1' or resolution_reference<>'CASE-1')) then raise exception 'FAIL: stored provenance'; end if;
 if exists(select 1 from public.audit_logs where entity='privacy_requests' and actor_id in (current_setting('privacy_qa.owner')::uuid,current_setting('privacy_qa.admin')::uuid,current_setting('privacy_qa.compliance')::uuid) and (action like '%VERIFY-1%' or action like '%CASE-1%')) then raise exception 'FAIL: sensitive audit content'; end if;
end $$;
set local role authenticated;
do $$ declare q jsonb; first_id text; id uuid:=current_setting('privacy_qa.paged')::uuid; begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('privacy_qa.other'),'role','authenticated','aal','aal1')::text,true);
 q:=public.list_privacy_requests(false,null,false,0); first_id:=q->'requests'->0->>'id';
 if q->>'total'<>'28' or jsonb_array_length(q->'requests')<>25 then raise exception 'FAIL: list page size'; end if;
 q:=public.list_privacy_requests(false,null,false,1);
 if jsonb_array_length(q->'requests')<>3 or exists(select 1 from jsonb_array_elements(q->'requests') r where r->>'id'=first_id) then raise exception 'FAIL: list page overlap'; end if;
 q:=public.get_privacy_request(id,false,0);
 if q->>'totalEvents'<>'28' or jsonb_array_length(q->'events')<>25 then raise exception 'FAIL: conversation page size'; end if;
 if jsonb_array_length(public.get_privacy_request(id,false,1)->'events')<>3 then raise exception 'FAIL: conversation next page'; end if;
 -- Five accepted requests per hour; no writes survive a refused sixth intake.
 for n in 1..5 loop perform public.create_privacy_request(case when n<5 then 'MY' else 'PH' end,(array['access','correction','erasure','restriction','access'])[n],'Please review my account privacy request.'); end loop;
 begin perform public.create_privacy_request('PH','correction','Please review my account privacy request.'); raise exception 'FAIL: intake throttle'; exception when raise_exception then if SQLERRM like 'FAIL:%' then raise; end if; end;
end $$;
rollback;
