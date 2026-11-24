-- CMS scheduled publication and reviewed public editorial media.
--  * content_entries gain an optional publish_at / unpublish_at window. An
--    approved (published) entry is public only inside its window; the database
--    read policy enforces this, so no scheduler is needed. Only market
--    admin/compliance can change a published entry (existing publication
--    trigger), so editors cannot move an approved schedule.
--  * media_assets can be published by market admin/compliance with an approval
--    reference. The publisher must not be the uploader. Published copies live
--    in the public editorial-public bucket at <market>/<asset id>.<ext>.
--  * content images must be a published editorial image or a bundled /design
--    asset; unpublishing media used by published content is refused.
-- Additive: new columns, bucket, policies and functions; the content read
-- policy is replaced with a stricter version.

alter table public.content_entries add column publish_at timestamptz, add column unpublish_at timestamptz;
alter table public.content_entries add constraint content_entries_schedule_check
 check(publish_at is null or unpublish_at is null or unpublish_at>publish_at);

drop policy content_read on public.content_entries;
create policy content_read on public.content_entries for select to anon,authenticated using(
 (status='published' and (publish_at is null or publish_at<=now()) and (unpublish_at is null or unpublish_at>now()))
 or private.has_role(market));

-- Public editorial media -----------------------------------------------------------
alter table public.media_assets
 add column public_url text check(public_url is null or length(public_url)<=500),
 add column approval_reference text check(approval_reference is null or length(approval_reference) between 3 and 120),
 add column published_by uuid references auth.users(id),
 add column published_at timestamptz;
alter table public.media_assets add constraint media_assets_publication_check
 check((public_url is null)=(published_at is null) and (public_url is null)=(approval_reference is null) and (public_url is null)=(published_by is null));
create index media_publisher_idx on public.media_assets(published_by);
create index media_public_url_idx on public.media_assets(public_url) where public_url is not null;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('editorial-public','editorial-public',true,5242880,array['image/png','image/jpeg','image/webp']);
create policy editorial_public_publish on storage.objects for insert to authenticated with check(
 bucket_id='editorial-public' and private.has_role((storage.foldername(name))[1],array['admin','compliance']));
create policy editorial_public_read on storage.objects for select to authenticated using(
 bucket_id='editorial-public' and private.has_role((storage.foldername(name))[1],array['admin','compliance']));
create policy editorial_public_remove on storage.objects for delete to authenticated using(
 bucket_id='editorial-public' and private.has_role((storage.foldername(name))[1],array['admin','compliance']));

create function private.media_extension(p_mime text) returns text language sql immutable set search_path='' as $$
 select case p_mime when 'image/png' then 'png' when 'image/jpeg' then 'jpg' when 'image/webp' then 'webp' end
$$;
revoke all on function private.media_extension(text) from public,anon,authenticated,service_role;

create function private.publish_media_asset(p_id uuid,p_public_url text,p_reference text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.media_assets; actor uuid:=private.app_user_id(); v_ref text:=btrim(coalesce(p_reference,'')); begin
 select * into a from public.media_assets where id=p_id for update;
 if not found or not private.has_role(a.market,array['admin','compliance']) or a.uploaded_by=actor then
  raise exception 'Media publication access denied' using errcode='42501'; end if;
 if a.storage_provider<>'supabase' then raise exception 'Only Supabase-stored media can be published'; end if;
 if a.public_url is not null then raise exception 'This media is already published'; end if;
 if length(v_ref) not between 3 and 120 then raise exception 'An approval reference is required to publish'; end if;
 if p_public_url is null or length(p_public_url)>500 or p_public_url !~ ('^https://[a-z0-9.-]+(:[0-9]+)?/storage/v1/object/public/editorial-public/'
  ||a.market||'/'||a.id::text||'[.]'||private.media_extension(a.mime_type)||'$') then
  raise exception 'Invalid published media location'; end if;
 update public.media_assets set public_url=p_public_url,approval_reference=v_ref,published_by=actor,published_at=clock_timestamp() where id=p_id;
 insert into public.audit_logs(actor_id,action,entity,entity_id) values(actor,'MEDIA_PUBLISHED','media_assets',p_id::text);
end $$;

-- Returns the object path to remove from the public bucket.
create function private.unpublish_media_asset(p_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare a public.media_assets; actor uuid:=private.app_user_id(); begin
 select * into a from public.media_assets where id=p_id for update;
 if not found or not private.has_role(a.market,array['admin','compliance']) then
  raise exception 'Media publication access denied' using errcode='42501'; end if;
 if a.public_url is null then raise exception 'This media is not published'; end if;
 if exists(select 1 from public.content_entries where image_url=a.public_url and status in ('review','published')) then
  raise exception 'Remove this image from content in review or published first'; end if;
 update public.media_assets set public_url=null,approval_reference=null,published_by=null,published_at=null where id=p_id;
 insert into public.audit_logs(actor_id,action,entity,entity_id) values(actor,'MEDIA_UNPUBLISHED','media_assets',p_id::text);
 return a.market||'/'||a.id::text||'.'||private.media_extension(a.mime_type);
end $$;

-- Content images: a published editorial image of the entry's market (or any
-- market for global entries) or a bundled site asset.
create function private.guard_content_image() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if NEW.image_url is null then return NEW; end if;
 if TG_OP='UPDATE' and NEW.image_url is not distinct from OLD.image_url and NEW.market is not distinct from OLD.market then return NEW; end if;
 if NEW.image_url ~ '^/design/([A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+[.](png|jpg|jpeg|webp)$' then return NEW; end if;
 if not exists(select 1 from public.media_assets where public_url=NEW.image_url and (NEW.market is null or market=NEW.market)) then
  raise exception 'Choose a published editorial image for this market'; end if;
 return NEW;
end $$;
revoke all on function private.guard_content_image() from public,anon,authenticated,service_role;
create trigger content_image_guard before insert or update of image_url,market on public.content_entries
 for each row execute function private.guard_content_image();

-- Wrappers and grants ---------------------------------------------------------------
revoke all on function private.publish_media_asset(uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function private.unpublish_media_asset(uuid) from public,anon,authenticated,service_role;
grant execute on function private.publish_media_asset(uuid,text,text) to authenticated;
grant execute on function private.unpublish_media_asset(uuid) to authenticated;
create function public.publish_media_asset(p_id uuid,p_public_url text,p_reference text) returns void
 language sql security invoker set search_path='' as $$ select private.publish_media_asset(p_id,p_public_url,p_reference) $$;
create function public.unpublish_media_asset(p_id uuid) returns text
 language sql security invoker set search_path='' as $$ select private.unpublish_media_asset(p_id) $$;
revoke all on function public.publish_media_asset(uuid,text,text) from public,anon,service_role;
revoke all on function public.unpublish_media_asset(uuid) from public,anon,service_role;
grant execute on function public.publish_media_asset(uuid,text,text) to authenticated;
grant execute on function public.unpublish_media_asset(uuid) to authenticated;
