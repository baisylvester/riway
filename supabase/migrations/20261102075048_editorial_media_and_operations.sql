create table public.media_assets (
 id uuid primary key default gen_random_uuid(), market text not null references public.markets(code),
 object_path text not null unique, file_name text not null check(length(file_name) between 1 and 200),
 mime_type text not null check(mime_type in ('image/png','image/jpeg','image/webp')),
 size_bytes integer not null check(size_bytes between 1 and 5242880),
 uploaded_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create index media_market_idx on public.media_assets(market);
create index media_uploader_idx on public.media_assets(uploaded_by);
alter table public.media_assets enable row level security;
revoke all on public.media_assets from anon,authenticated;
grant select,insert on public.media_assets to authenticated;
create policy media_read on public.media_assets for select to authenticated using(private.has_role(market));
create policy media_insert on public.media_assets for insert to authenticated with check(private.has_role(market,array['admin','editor','compliance']) and uploaded_by=(select auth.uid()) and split_part(object_path,'/',1)=market);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('editorial-media','editorial-media',false,5242880,array['image/png','image/jpeg','image/webp']);
create policy editorial_upload on storage.objects for insert to authenticated with check(bucket_id='editorial-media' and private.has_role((storage.foldername(name))[1],array['admin','editor','compliance']));
create policy editorial_read on storage.objects for select to authenticated using(bucket_id='editorial-media' and private.has_role((storage.foldername(name))[1]));
create policy editorial_cleanup on storage.objects for delete to authenticated using(bucket_id='editorial-media' and owner_id=(select auth.uid())::text and private.has_role((storage.foldername(name))[1],array['admin','editor','compliance']));
create trigger media_audit after insert on public.media_assets for each row execute function private.audit_change();
