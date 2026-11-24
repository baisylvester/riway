-- Email second step acceptance: only the server (service key) can mark a live
-- session of that user; the mark passes staff checks for that session only,
-- until it expires. Synthetic fixtures; rolls back.
begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
select set_config('request.jwt.claims','{}',true);
do $$ declare staff uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); s1 uuid:=gen_random_uuid(); s2 uuid:=gen_random_uuid(); begin
 insert into auth.users(id,email) select x,'email2fa-qa-'||x||'@example.invalid' from unnest(array[staff,other]) x;
 insert into public.staff_roles(user_id,market,role) values(staff,'PH','compliance'),(other,'PH','compliance');
 insert into auth.sessions(id,user_id) values(s1,staff),(s2,staff);
 perform set_config('e2.staff',staff::text,true); perform set_config('e2.other',other::text,true);
 perform set_config('e2.s1',s1::text,true); perform set_config('e2.s2',s2::text,true);
 if has_table_privilege('authenticated','private.email_second_factor_sessions','select,insert,update,delete')
 or has_table_privilege('service_role','private.email_second_factor_sessions','select,insert,update,delete')
 or has_function_privilege('authenticated','public.record_email_second_factor(uuid,uuid)','execute')
 or has_function_privilege('anon','public.record_email_second_factor(uuid,uuid)','execute')
 or has_function_privilege('anon','public.second_factor_verified()','execute') then raise exception 'FAIL: grants'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in ('record_email_second_factor','second_factor_verified') and p.prosecdef) then raise exception 'FAIL: exposed definer'; end if;
end $$;

-- Before the email step: a password-only session is not staff-verified.
set local role authenticated;
do $$ begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('e2.staff'),'role','authenticated','aal','aal1','session_id',current_setting('e2.s1'))::text,true);
 if public.second_factor_verified() or private.has_role('PH',array['compliance']) then raise exception 'FAIL: aal1 passed before email step'; end if;
end $$;
reset role;

set local role service_role;
do $$ begin
 begin perform public.record_email_second_factor(current_setting('e2.staff')::uuid,gen_random_uuid()); raise exception 'FAIL: unknown session recorded';
 exception when raise_exception then if SQLERRM<>'Unknown session' then raise; end if; end;
 begin perform public.record_email_second_factor(current_setting('e2.other')::uuid,current_setting('e2.s1')::uuid); raise exception 'FAIL: another user''s session recorded';
 exception when raise_exception then if SQLERRM<>'Unknown session' then raise; end if; end;
 if public.record_email_second_factor(current_setting('e2.staff')::uuid,current_setting('e2.s1')::uuid)<now()+interval '11 hours' then raise exception 'FAIL: expiry'; end if;
end $$;
reset role;

set local role authenticated;
do $$ begin
 -- The verified session passes; the same user's other session and another user claiming it do not.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('e2.staff'),'role','authenticated','aal','aal1','session_id',current_setting('e2.s1'))::text,true);
 if not public.second_factor_verified() or not private.has_role('PH',array['compliance']) then raise exception 'FAIL: email-verified session refused'; end if;
 if private.has_role('SG',array['compliance']) then raise exception 'FAIL: email step widened market access'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('e2.staff'),'role','authenticated','aal','aal1','session_id',current_setting('e2.s2'))::text,true);
 if public.second_factor_verified() then raise exception 'FAIL: other session passed'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('e2.other'),'role','authenticated','aal','aal1','session_id',current_setting('e2.s1'))::text,true);
 if public.second_factor_verified() then raise exception 'FAIL: borrowed session id passed'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('e2.staff'),'role','authenticated','aal','aal1','session_id','not-a-uuid')::text,true);
 if public.second_factor_verified() then raise exception 'FAIL: malformed session id passed'; end if;
 -- Authenticator level still passes without the email step.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('e2.other'),'role','authenticated','aal','aal2','session_id',current_setting('e2.s2'))::text,true);
 if not private.has_role('PH',array['compliance']) then raise exception 'FAIL: authenticator no longer accepted'; end if;
end $$;
reset role;

-- Expiry ends access.
update private.email_second_factor_sessions set expires_at=now()-interval '1 second' where session_id=current_setting('e2.s1')::uuid;
set local role authenticated;
do $$ begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('e2.staff'),'role','authenticated','aal','aal1','session_id',current_setting('e2.s1'))::text,true);
 if public.second_factor_verified() then raise exception 'FAIL: expired email step passed'; end if;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.audit_logs where action='EMAIL_SECOND_FACTOR_VERIFIED' and entity_id=current_setting('e2.s1')) then raise exception 'FAIL: audit'; end if;
end $$;
rollback;
