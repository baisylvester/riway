-- Minimal Supabase SQL interfaces for isolated PostgreSQL migration/concurrency tests.
-- This is never applied to the hosted Supabase project.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema storage;
grant usage on schema auth,storage,public to anon,authenticated,service_role;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text);
alter table storage.objects enable row level security;
grant select,insert,delete on storage.objects to authenticated;
create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
alter default privileges in schema public grant all on tables to service_role;
