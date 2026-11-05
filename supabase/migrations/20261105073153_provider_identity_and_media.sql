-- Review and replay in staging before enabling Clerk. No issuer is enabled by default.
create table public.app_users (
 id uuid primary key default gen_random_uuid(),
 auth_user_id uuid unique references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
alter table public.app_users enable row level security;
revoke all on public.app_users from public, anon, authenticated;
grant select on public.app_users to service_role;
insert into public.app_users(id, auth_user_id) select id,id from auth.users;

create table private.clerk_issuers (issuer text primary key check(issuer ~ '^https://[^/]+$'));
create table private.clerk_identities (
 issuer text not null references private.clerk_issuers(issuer),
 subject text not null check(subject ~ '^user_[A-Za-z0-9]+$'),
 user_id uuid not null references public.app_users(id), disabled_at timestamptz,
 primary key(issuer,subject), unique(issuer,user_id)
);
create index clerk_identity_user_idx on private.clerk_identities(user_id);
create table private.clerk_deleted_subjects(issuer text not null references private.clerk_issuers(issuer), subject text not null, primary key(issuer,subject));
revoke all on private.clerk_deleted_subjects from public,anon,authenticated;
revoke all on private.clerk_issuers, private.clerk_identities from public,anon,authenticated;

create function private.app_user_id() returns uuid language plpgsql stable security definer set search_path='' as $$
declare claims jsonb := auth.jwt(); v_subject text := claims->>'sub'; result uuid;
begin
 if v_subject ~ '^user_[A-Za-z0-9]+$' then
  select user_id into result from private.clerk_identities
   where issuer=claims->>'iss' and subject=v_subject and disabled_at is null;
  return result;
 end if;
 -- Only native UUID subjects can reach auth.uid(); Clerk's string IDs never do.
 if v_subject ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 and (claims->>'iss' is null or claims->>'iss' in (
  'https://skiimthwadramxdzhgoy.supabase.co/auth/v1', 'http://127.0.0.1:54321/auth/v1', 'http://localhost:54321/auth/v1'
 )) then
  select id into result from public.app_users where auth_user_id=v_subject::uuid;
 end if;
 return result;
end $$;
revoke all on function private.app_user_id() from public;
grant execute on function private.app_user_id() to anon,authenticated;

create function private.register_native_identity() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.app_users(id,auth_user_id) values(NEW.id,NEW.id); return NEW; end $$;
revoke all on function private.register_native_identity() from public;
create trigger register_app_identity after insert on auth.users for each row execute function private.register_native_identity();

-- Preserve every existing UUID and FK deletion rule while permitting Clerk identities.
do $$ declare row record; definition text; begin
 for row in select c.conrelid::regclass as tbl,c.conname,pg_get_constraintdef(c.oid) as definition
  from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
  where c.contype='f' and c.confrelid='auth.users'::regclass and n.nspname='public' and t.relname<>'app_users'
 loop
  definition := replace(row.definition,'REFERENCES auth.users(id)','REFERENCES public.app_users(id)');
  if definition=row.definition then raise exception 'Unexpected identity FK definition'; end if;
  execute format('alter table %s drop constraint %I',row.tbl,row.conname);
  execute format('alter table %s add constraint %I %s',row.tbl,row.conname,definition);
 end loop;
end $$;

-- Replace native-only identity calls, preserving the existing policy scopes and grants.
do $$ declare row record; definition text; begin
 for row in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('private','public') and p.prokind='f' and p.proname<>'app_user_id'
  and p.prosrc like '%auth.uid()%'
 loop
  definition := replace(pg_get_functiondef(row.oid),'auth.uid()','private.app_user_id()');
  execute definition;
 end loop;
 for row in select p.polname,p.polrelid::regclass as tbl,pg_get_expr(p.polqual,p.polrelid) as predicate,
  pg_get_expr(p.polwithcheck,p.polrelid) as check_expr from pg_policy p
  join pg_class t on t.oid=p.polrelid join pg_namespace n on n.oid=t.relnamespace
  where n.nspname in ('public','storage') and
  (pg_get_expr(p.polqual,p.polrelid) like '%auth.uid()%' or pg_get_expr(p.polwithcheck,p.polrelid) like '%auth.uid()%')
 loop
  definition := format('alter policy %I on %s',row.polname,row.tbl);
  if row.predicate is not null then definition:=definition||' using ('||replace(row.predicate,'auth.uid()','private.app_user_id()')||')'; end if;
  if row.check_expr is not null then definition:=definition||' with check ('||replace(row.check_expr,'auth.uid()','private.app_user_id()')||')'; end if;
  execute definition;
 end loop;
end $$;

create function private.mfa_verified() returns boolean language plpgsql stable security definer set search_path='' as $$
declare claims jsonb:=auth.jwt(); age text:=claims->'fva'->>1;
begin
 if private.app_user_id() is null then return false; end if;
 if claims->>'sub' ~ '^user_' then
  if age is null or age !~ '^[0-9]{1,4}$' then return false; end if;
  return age::integer between 0 and 15;
 end if;
 return coalesce(claims->>'aal'='aal2',false);
end $$;
revoke all on function private.mfa_verified() from public;
grant execute on function private.mfa_verified() to authenticated,anon;
create or replace function private.has_role(m text, allowed text[] default array['admin','operations','editor','compliance'])
returns boolean language sql stable security definer set search_path='' as $$
 select private.mfa_verified() and exists(select 1 from public.staff_roles
  where user_id=(select private.app_user_id()) and (m is null or market=m) and role=any(allowed));
$$;

create function private.ensure_clerk_profile() returns uuid language plpgsql security definer set search_path='' as $$
declare claims jsonb:=auth.jwt(); v_issuer text:=claims->>'iss'; v_subject text:=claims->>'sub'; result uuid;
begin
 if not exists(select 1 from private.clerk_issuers i where i.issuer=v_issuer)
 or v_subject is null or v_subject !~ '^user_[A-Za-z0-9]+$' then raise exception 'Untrusted identity'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_issuer||':'||v_subject,0));
 if exists(select 1 from private.clerk_deleted_subjects d where d.issuer=v_issuer and d.subject=v_subject)
 or exists(select 1 from private.clerk_identities i where i.issuer=v_issuer and i.subject=v_subject and disabled_at is not null) then raise exception 'Identity disabled'; end if;
 select user_id into result from private.clerk_identities i where i.issuer=v_issuer and i.subject=v_subject;
 if result is null then
  insert into public.app_users default values returning id into result;
  insert into private.clerk_identities(issuer,subject,user_id) values(v_issuer,v_subject,result);
 end if;
 insert into public.profiles(id) values(result) on conflict(id) do nothing;
 return result;
end $$;
revoke all on function private.ensure_clerk_profile() from public;
grant execute on function private.ensure_clerk_profile() to authenticated;
create function public.ensure_clerk_profile() returns uuid language sql security invoker set search_path='' as $$ select private.ensure_clerk_profile() $$;
revoke all on function public.ensure_clerk_profile() from public,anon;
grant execute on function public.ensure_clerk_profile() to authenticated;

create function private.disable_clerk_identity(issuer text, subject text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from private.clerk_issuers i where i.issuer=disable_clerk_identity.issuer) or subject !~ '^user_[A-Za-z0-9]+$' then raise exception 'Untrusted identity'; end if;
 perform pg_advisory_xact_lock(hashtextextended(issuer||':'||subject,0));
 insert into private.clerk_deleted_subjects values(issuer,subject) on conflict do nothing;
 update private.clerk_identities i set disabled_at=coalesce(disabled_at,now()) where i.issuer=disable_clerk_identity.issuer and i.subject=disable_clerk_identity.subject;
end $$;
revoke all on function private.disable_clerk_identity(text,text) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.disable_clerk_identity(text,text) to service_role;
create function public.disable_clerk_identity(issuer text,subject text) returns void language sql security invoker set search_path='' as $$ select private.disable_clerk_identity(issuer,subject) $$;
revoke all on function public.disable_clerk_identity(text,text) from public,anon,authenticated;
grant execute on function public.disable_clerk_identity(text,text) to service_role;

alter table public.media_assets add column storage_provider text not null default 'supabase' check(storage_provider in ('supabase','r2'));
create or replace function private.can_upload_media(m text) returns boolean language sql stable security invoker set search_path='' as $$
 select private.has_role(m,array['admin','editor','compliance']);
$$;
revoke all on function private.can_upload_media(text) from public;
grant execute on function private.can_upload_media(text) to authenticated;
create function public.can_upload_media(m text) returns boolean language sql stable security invoker set search_path='' as $$ select private.can_upload_media(m) $$;
revoke all on function public.can_upload_media(text) from public,anon;
grant execute on function public.can_upload_media(text) to authenticated;
-- Storage tracks the JWT subject as its owner, rather than the local UUID mapping.
alter policy editorial_cleanup on storage.objects using(bucket_id='editorial-media'
 and owner_id=(select auth.jwt()->>'sub') and private.has_role((storage.foldername(name))[1],array['admin','editor','compliance']));
