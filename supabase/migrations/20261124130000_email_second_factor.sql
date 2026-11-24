-- Email code as the staff second sign-in step (user decision, 24 November 2026).
--
-- Staff permission checks call private.mfa_verified(). Until now a native
-- (Supabase) session passed only at authenticator level aal2. A session now
-- also passes when its owner proved control of the account email with a
-- one-time code within the last 12 hours. The code is sent and checked by
-- Supabase Auth on the server; only after a successful check does the server,
-- with the service key, record the caller's current session here. Existing
-- authenticators still pass, so no one is locked out. Clerk sessions are
-- unchanged. Trade-off accepted by the owner: inbox access plus password is
-- enough to reach staff tools.

create table private.email_second_factor_sessions (
 session_id uuid primary key,
 user_id uuid not null references public.app_users(id) on delete cascade,
 verified_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null
);
create index email_second_factor_user_idx on private.email_second_factor_sessions(user_id);
alter table private.email_second_factor_sessions enable row level security;
revoke all on private.email_second_factor_sessions from public,anon,authenticated,service_role;
create policy email_second_factor_internal_only on private.email_second_factor_sessions for all to anon,authenticated using(false) with check(false);

create or replace function private.mfa_verified() returns boolean language plpgsql stable security definer set search_path='' as $$
declare claims jsonb:=auth.jwt(); age text:=claims->'fva'->>1; sid text:=claims->>'session_id';
begin
 if private.app_user_id() is null then return false; end if;
 if claims->>'sub' ~ '^user_' then
  if age is null or age !~ '^[0-9]{1,4}$' then return false; end if;
  return age::integer between 0 and 15;
 end if;
 if coalesce(claims->>'aal'='aal2',false) then return true; end if;
 return sid ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and exists(
  select 1 from private.email_second_factor_sessions s
  where s.session_id=sid::uuid and s.user_id=private.app_user_id() and s.expires_at>clock_timestamp());
end $$;

-- Service key only, called by the server after Supabase Auth accepted the
-- emailed code for this user. The session must be a live session of that user.
create function private.record_email_second_factor(p_user uuid,p_session uuid) returns timestamptz
language plpgsql security definer set search_path='' as $$
declare v_expires timestamptz:=clock_timestamp()+interval '12 hours'; begin
 if p_user is null or p_session is null or not exists(select 1 from auth.sessions s where s.id=p_session and s.user_id=p_user) then
  raise exception 'Unknown session';
 end if;
 insert into private.email_second_factor_sessions(session_id,user_id,expires_at) values(p_session,p_user,v_expires)
 on conflict(session_id) do update set verified_at=clock_timestamp(),expires_at=excluded.expires_at
  where private.email_second_factor_sessions.user_id=excluded.user_id;
 delete from private.email_second_factor_sessions where expires_at<clock_timestamp()-interval '1 day';
 insert into public.audit_logs(actor_id,action,entity,entity_id) values(p_user,'EMAIL_SECOND_FACTOR_VERIFIED','auth.sessions',p_session::text);
 return v_expires;
end $$;

-- The caller's own second-step state, for the app's staff gate.
create function public.second_factor_verified() returns boolean
language sql stable security invoker set search_path='' as $$ select private.mfa_verified() $$;
create function public.record_email_second_factor(p_user uuid,p_session uuid) returns timestamptz
language sql security invoker set search_path='' as $$ select private.record_email_second_factor(p_user,p_session) $$;

revoke all on function private.record_email_second_factor(uuid,uuid),public.record_email_second_factor(uuid,uuid),
 public.second_factor_verified() from public,anon,authenticated,service_role;
grant execute on function private.record_email_second_factor(uuid,uuid),public.record_email_second_factor(uuid,uuid) to service_role;
grant execute on function public.second_factor_verified() to authenticated;
