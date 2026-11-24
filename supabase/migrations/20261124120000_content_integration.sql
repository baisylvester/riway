-- Content integration (audit G14, G15-G18, A04, G05 remainder).
--
-- No RIWAY copy is written here. These objects let staff enter and publish
-- RIWAY-approved content; pages keep their current placeholder notices until a
-- compliance-approved entry exists.
--  * Per-market (and per-locale) product content: ingredients, usage, label
--    notes, regulatory statement and a video link. Editors draft; only market
--    admin/compliance with MFA publish, with an approval reference.
--  * Corporate, membership, support and legal pages reuse content_entries
--    (kind 'page') through slug conventions handled in application code.
--  * Find a Distributor: opt-in only. A verified distributor chooses to be
--    listed and may add a city; the public sees code, display name, market,
--    city and approved photo, never contact details or downline.
--  * Distributor photo self-upload: the distributor uploads to a private
--    bucket under their own folder; market admin/compliance review it and the
--    approved copy is published from a separate public bucket.

-- Product content -----------------------------------------------------------
create table public.product_market_content (
 product_id uuid not null references public.products(id) on delete cascade,
 market text not null references public.markets(code),
 locale text not null default 'en' check(locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
 ingredients text not null default '' check(length(ingredients)<=4000),
 usage text not null default '' check(length(usage)<=4000),
 label_notes text not null default '' check(length(label_notes)<=2000),
 regulatory_statement text not null default '' check(length(regulatory_statement)<=2000),
 video_url text check(video_url is null or (length(video_url)<=300 and video_url ~ '^https://(www[.]youtube[.]com/watch[?]v=|youtu[.]be/|vimeo[.]com/)[A-Za-z0-9_-]+$')),
 status text not null default 'draft' check(status in ('draft','review','published')),
 approval_reference text check(approval_reference is null or length(approval_reference) between 3 and 120),
 approved_by uuid references public.app_users(id),
 approved_at timestamptz,
 updated_at timestamptz not null default clock_timestamp(),
 primary key(product_id,market,locale),
 check(status<>'published' or (approval_reference is not null and approved_at is not null))
);
create index product_market_content_market_idx on public.product_market_content(market);
create index product_market_content_approver_idx on public.product_market_content(approved_by);
alter table public.product_market_content enable row level security;
revoke all on public.product_market_content from public,anon,authenticated,service_role;
grant select on public.product_market_content to anon,authenticated;
grant insert,update on public.product_market_content to authenticated;
create policy product_content_read on public.product_market_content for select to anon,authenticated
 using(status='published' or private.has_role(market));
create policy product_content_insert on public.product_market_content for insert to authenticated
 with check(private.has_role(market,array['admin','editor','compliance']));
create policy product_content_update on public.product_market_content for update to authenticated
 using(private.has_role(market,array['admin','editor','compliance'])) with check(private.has_role(market,array['admin','editor','compliance']));

create function private.guard_product_content() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 NEW.updated_at:=clock_timestamp();
 if NEW.status='published' then
  if not private.has_role(NEW.market,array['admin','compliance']) then
   raise exception 'Compliance approval required before publication';
  end if;
  if nullif(btrim(coalesce(NEW.approval_reference,'')),'') is null then raise exception 'An approval reference is required to publish'; end if;
  NEW.approved_by:=private.app_user_id(); NEW.approved_at:=clock_timestamp();
 else
  NEW.approved_by:=null; NEW.approved_at:=null;
 end if;
 insert into public.audit_logs(actor_id,action,entity,entity_id)
 values(private.app_user_id(),'PRODUCT_CONTENT_'||upper(NEW.status)||':'||NEW.market||':'||NEW.locale,'product_market_content',NEW.product_id::text);
 return NEW;
end $$;
revoke all on function private.guard_product_content() from public,anon,authenticated,service_role;
create trigger product_content_guard before insert or update on public.product_market_content
 for each row execute function private.guard_product_content();

-- Find a Distributor (opt-in) -----------------------------------------------
create table private.distributor_directory (
 user_id uuid primary key references public.distributor_profiles(user_id) on delete cascade,
 city text check(city is null or (length(city) between 2 and 80 and city ~ '^[[:alpha:][:space:].''-]+$')),
 listed_at timestamptz not null default clock_timestamp()
);
alter table private.distributor_directory enable row level security;
revoke all on private.distributor_directory from public,anon,authenticated,service_role;
create policy distributor_directory_internal_only on private.distributor_directory for all to anon,authenticated using(false) with check(false);

create function private.my_distributor_listing() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare d public.distributor_profiles; l private.distributor_directory; begin
 d:=private.my_verified_distributor();
 if d.user_id is null then raise exception 'Verified distributor access required' using errcode='42501'; end if;
 select * into l from private.distributor_directory where user_id=d.user_id;
 return jsonb_build_object('userId',d.user_id,'listed',l.user_id is not null,'city',l.city,'photoUrl',d.photo_url,
  'pendingPhoto',exists(select 1 from private.distributor_photo_submissions s where s.user_id=d.user_id and s.status='pending'));
end $$;

create function private.set_distributor_listing(p_listed boolean,p_city text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.distributor_profiles; v_city text:=nullif(btrim(p_city),''); begin
 d:=private.my_verified_distributor();
 if d.user_id is null or p_listed is null then raise exception 'Verified distributor access required' using errcode='42501'; end if;
 if p_listed then
  insert into private.distributor_directory(user_id,city) values(d.user_id,v_city)
  on conflict(user_id) do update set city=excluded.city;
 else
  delete from private.distributor_directory where user_id=d.user_id;
 end if;
 insert into public.audit_logs(actor_id,action,entity,entity_id)
 values(d.user_id,'DISTRIBUTOR_LISTING:'||case when p_listed then 'ON' else 'OFF' end,'distributor_directory',d.user_id::text);
 return private.my_distributor_listing();
end $$;

create function private.find_distributors(p_market text,p_city text) returns table(code text,display_name text,market text,city text,photo_url text)
language sql stable security definer set search_path='' as $$
 select d.code,d.display_name,d.market,l.city,d.photo_url
 from private.distributor_directory l join public.distributor_profiles d on d.user_id=l.user_id
 where d.active and d.verified_at is not null and d.market=p_market
  and (nullif(btrim(p_city),'') is null or l.city ilike '%'||replace(replace(replace(btrim(left(p_city,80)),'\','\\'),'%','\%'),'_','\_')||'%')
 order by l.city nulls last,d.display_name limit 50;
$$;

-- Distributor photo self-upload ----------------------------------------------
create table private.distributor_photo_submissions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.distributor_profiles(user_id) on delete cascade,
 object_path text not null unique check(object_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.](png|jpg|webp)$'),
 status text not null default 'pending' check(status in ('pending','approved','rejected','withdrawn')),
 reviewed_by uuid references public.app_users(id),
 reviewed_at timestamptz,
 note text check(note is null or length(note)<=300),
 created_at timestamptz not null default clock_timestamp()
);
create unique index distributor_photo_one_pending on private.distributor_photo_submissions(user_id) where status='pending';
create index distributor_photo_reviewer_idx on private.distributor_photo_submissions(reviewed_by);
alter table private.distributor_photo_submissions enable row level security;
revoke all on private.distributor_photo_submissions from public,anon,authenticated,service_role;
create policy distributor_photo_submissions_internal_only on private.distributor_photo_submissions for all to anon,authenticated using(false) with check(false);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('distributor-photo-submissions','distributor-photo-submissions',false,3145728,array['image/png','image/jpeg','image/webp']),
 ('distributor-photos','distributor-photos',true,3145728,array['image/png','image/jpeg','image/webp']);

-- Submissions: a verified distributor writes only inside their own folder;
-- market admin/compliance can read them for review.
create function private.photo_submission_reviewable(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.distributor_profiles d where d.user_id::text=(storage.foldername(p_name))[1]
  and private.has_role(d.market,array['admin','compliance']));
$$;
create policy distributor_photo_upload on storage.objects for insert to authenticated with check(
 bucket_id='distributor-photo-submissions' and (storage.foldername(name))[1]=(private.my_verified_distributor()).user_id::text);
create policy distributor_photo_review_read on storage.objects for select to authenticated using(
 bucket_id='distributor-photo-submissions' and ((storage.foldername(name))[1]=(private.my_verified_distributor()).user_id::text or private.photo_submission_reviewable(name)));
create policy distributor_photo_own_cleanup on storage.objects for delete to authenticated using(
 bucket_id='distributor-photo-submissions' and (storage.foldername(name))[1]=(private.my_verified_distributor()).user_id::text);
-- Published copies: market admin/compliance write under the market folder.
create policy distributor_photo_publish on storage.objects for insert to authenticated with check(
 bucket_id='distributor-photos' and private.has_role((storage.foldername(name))[1],array['admin','compliance']));

create function private.submit_distributor_photo(p_path text) returns uuid
language plpgsql security definer set search_path='' as $$
declare d public.distributor_profiles; result uuid; begin
 d:=private.my_verified_distributor();
 if d.user_id is null then raise exception 'Verified distributor access required' using errcode='42501'; end if;
 if p_path is null or split_part(p_path,'/',1)<>d.user_id::text then raise exception 'Invalid photo location'; end if;
 update private.distributor_photo_submissions set status='withdrawn' where user_id=d.user_id and status='pending';
 insert into private.distributor_photo_submissions(user_id,object_path) values(d.user_id,p_path) returning id into result;
 insert into public.audit_logs(actor_id,action,entity,entity_id) values(d.user_id,'DISTRIBUTOR_PHOTO_SUBMITTED','distributor_photo_submissions',result::text);
 return result;
end $$;

create function private.staff_photo_submissions() returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
 if not private.has_role(null,array['admin','compliance']) then raise exception 'Photo review access denied' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'code',d.code,'displayName',d.display_name,'market',d.market,
  'objectPath',s.object_path,'createdAt',s.created_at) order by s.created_at)
  from private.distributor_photo_submissions s join public.distributor_profiles d on d.user_id=s.user_id
  where s.status='pending' and private.has_role(d.market,array['admin','compliance'])),'[]'::jsonb);
end $$;

-- Review: approve with the public URL of the published copy, or reject.
create function private.review_distributor_photo(p_id uuid,p_approve boolean,p_public_url text,p_reference text,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare s private.distributor_photo_submissions; d public.distributor_profiles; actor uuid:=private.app_user_id(); begin
 select * into s from private.distributor_photo_submissions where id=p_id for update;
 if not found then raise exception 'Photo review access denied' using errcode='42501'; end if;
 select * into d from public.distributor_profiles where user_id=s.user_id;
 if not private.has_role(d.market,array['admin','compliance']) then raise exception 'Photo review access denied' using errcode='42501'; end if;
 if s.status<>'pending' then raise exception 'This photo was already reviewed'; end if;
 if p_approve then
  if p_public_url is null or p_public_url !~ ('/storage/v1/object/public/distributor-photos/'||d.market||'/[0-9a-f-]{36}[.](png|jpg|webp)$') then
   raise exception 'Invalid published photo location'; end if;
  update public.distributor_profiles set photo_url=p_public_url,photo_reference=btrim(p_reference) where user_id=d.user_id;
 end if;
 update private.distributor_photo_submissions set status=case when p_approve then 'approved' else 'rejected' end,
  reviewed_by=actor,reviewed_at=clock_timestamp(),note=nullif(btrim(p_note),'') where id=p_id;
 insert into public.audit_logs(actor_id,action,entity,entity_id)
 values(actor,'DISTRIBUTOR_PHOTO_'||case when p_approve then 'APPROVED' else 'REJECTED' end,'distributor_photo_submissions',p_id::text);
end $$;

-- Approved photos may also live in the public distributor-photos bucket.
alter table public.distributor_profiles drop constraint distributor_profiles_photo_url_check;
alter table public.distributor_profiles add constraint distributor_profiles_photo_url_check check(photo_url is null or (length(photo_url)<=500 and (
 photo_url ~ '^/images/[a-zA-Z0-9._-]+$' or photo_url ~ '^https://static[.]wixstatic[.]com/[A-Za-z0-9._~/%-]+$'
 or photo_url ~ '^https://[a-z0-9]{20}[.]supabase[.]co/storage/v1/object/public/distributor-photos/(PH|SG|MY)/[0-9a-f-]{36}[.](png|jpg|webp)$')));

-- Wrappers and grants -----------------------------------------------------------
create function public.my_distributor_listing() returns jsonb language sql stable security invoker set search_path='' as $$ select private.my_distributor_listing() $$;
create function public.set_distributor_listing(p_listed boolean,p_city text) returns jsonb language sql security invoker set search_path='' as $$ select private.set_distributor_listing(p_listed,p_city) $$;
create function public.find_distributors(p_market text,p_city text) returns table(code text,display_name text,market text,city text,photo_url text)
 language sql stable security invoker set search_path='' as $$ select * from private.find_distributors(p_market,p_city) $$;
create function public.submit_distributor_photo(p_path text) returns uuid language sql security invoker set search_path='' as $$ select private.submit_distributor_photo(p_path) $$;
create function public.staff_photo_submissions() returns jsonb language sql stable security invoker set search_path='' as $$ select private.staff_photo_submissions() $$;
create function public.review_distributor_photo(p_id uuid,p_approve boolean,p_public_url text,p_reference text,p_note text) returns void
 language sql security invoker set search_path='' as $$ select private.review_distributor_photo(p_id,p_approve,p_public_url,p_reference,p_note) $$;

revoke all on function private.my_distributor_listing(),public.my_distributor_listing(),
 private.set_distributor_listing(boolean,text),public.set_distributor_listing(boolean,text),
 private.find_distributors(text,text),public.find_distributors(text,text),
 private.submit_distributor_photo(text),public.submit_distributor_photo(text),
 private.staff_photo_submissions(),public.staff_photo_submissions(),
 private.review_distributor_photo(uuid,boolean,text,text,text),public.review_distributor_photo(uuid,boolean,text,text,text),
 private.photo_submission_reviewable(text)
 from public,anon,authenticated,service_role;
grant execute on function private.find_distributors(text,text),public.find_distributors(text,text) to anon,authenticated;
grant execute on function private.my_distributor_listing(),public.my_distributor_listing(),
 private.set_distributor_listing(boolean,text),public.set_distributor_listing(boolean,text),
 private.submit_distributor_photo(text),public.submit_distributor_photo(text),
 private.staff_photo_submissions(),public.staff_photo_submissions(),
 private.review_distributor_photo(uuid,boolean,text,text,text),public.review_distributor_photo(uuid,boolean,text,text,text),
 private.photo_submission_reviewable(text),private.my_verified_distributor() to authenticated;
