-- Optional E: immutable revisions, independent publication, campaign/language
-- filtering, stable sharing links and immediate withdrawal in application reads.
create table private.library_assets (
 id uuid primary key default gen_random_uuid(), market text references public.markets(code),
 created_by uuid not null references public.app_users(id),
 live_version integer, revision integer not null default 0,
 created_at timestamptz not null default clock_timestamp()
);
create table private.library_versions (
 asset_id uuid not null references private.library_assets(id), version integer not null,
 title text not null check(length(btrim(title)) between 3 and 120),
 description text not null default '' check(length(description)<=2000),
 campaign text not null default '' check(length(campaign)<=120),
 locale text not null check(locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
 media_type text not null check(media_type in ('image','video','document')),
 url text not null check(length(url)<=500 and url !~ '(^|/)[.]{1,2}(/|$)' and (url ~ '^/(images|design)/[A-Za-z0-9._~/-]+$' or url ~ '^https://(static[.]wixstatic[.]com|www[.]riway[.]com|riway[.]com|www[.]youtube[.]com|youtu[.]be|vimeo[.]com)/[A-Za-z0-9._~/%?=&-]+$')),
 transcript text not null default '' check(length(transcript)<=20000),
 disclaimer text not null default '' check(length(disclaimer)<=2000),
 created_by uuid not null references public.app_users(id),
 created_at timestamptz not null default clock_timestamp(),
 primary key(asset_id,version),check(media_type<>'video' or length(btrim(transcript))>=10)
);
create index library_versions_creator_idx on private.library_versions(created_by);
create table private.library_reviews (
 asset_id uuid not null, version integer not null, reviewer_id uuid not null references public.app_users(id),
 approval_reference text not null check(length(btrim(approval_reference)) between 3 and 120),
 reviewed_at timestamptz not null default clock_timestamp(),
 primary key(asset_id,version),foreign key(asset_id,version) references private.library_versions(asset_id,version)
);
create index library_assets_market_idx on private.library_assets(market);
create index library_assets_creator_idx on private.library_assets(created_by);
create index library_reviews_reviewer_idx on private.library_reviews(reviewer_id);
alter table private.library_assets enable row level security;
alter table private.library_versions enable row level security;
alter table private.library_reviews enable row level security;
revoke all on private.library_assets,private.library_versions,private.library_reviews from public,anon,authenticated,service_role;
create policy library_assets_internal on private.library_assets for all using(false) with check(false);
create policy library_versions_internal on private.library_versions for all using(false) with check(false);
create policy library_reviews_internal on private.library_reviews for all using(false) with check(false);

create function private.save_library_version(p_id uuid,p_revision integer,p_market text,p_content jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare a private.library_assets; actor uuid:=private.app_user_id(); begin
 if not private.has_role(p_market,array['admin','editor','compliance']) then raise exception 'Library access denied' using errcode='42501'; end if;
 if p_content is null or jsonb_typeof(p_content)<>'object' or p_revision is null then raise exception 'Invalid revision' using errcode='22023'; end if;
 -- Market is immutable: a regional editor cannot widen distribution later.
 if p_id is null then
  if p_revision<>0 then raise exception 'Invalid revision' using errcode='22023'; end if;
  insert into private.library_assets(market,created_by) values(p_market,actor) returning * into a;
 else
  select * into a from private.library_assets where id=p_id for update;
  if not found or not private.has_role(a.market,array['admin','editor','compliance']) or a.market is distinct from p_market then
   raise exception 'Library access denied' using errcode='42501'; end if;
  if a.revision<>p_revision then raise exception 'Asset changed; reload' using errcode='40001'; end if;
 end if;
 insert into private.library_versions(asset_id,version,title,description,campaign,locale,media_type,url,transcript,disclaimer,created_by)
 values(a.id,a.revision+1,btrim(p_content->>'title'),coalesce(p_content->>'description',''),coalesce(p_content->>'campaign',''),
 p_content->>'locale',p_content->>'mediaType',btrim(p_content->>'url'),coalesce(p_content->>'transcript',''),coalesce(p_content->>'disclaimer',''),actor);
 update private.library_assets set revision=revision+1 where id=a.id;
 insert into public.audit_logs(actor_id,action,entity,entity_id) values(actor,'LIBRARY_DRAFT_VERSION','library_assets',a.id::text);
 return a.id;
end $$;
create function private.review_library_version(p_id uuid,p_revision integer,p_reference text,p_withdraw boolean) returns void
language plpgsql security definer set search_path='' as $$
declare a private.library_assets; v private.library_versions; actor uuid:=private.app_user_id(); begin
 select * into a from private.library_assets where id=p_id for update;
 if not found or not private.has_role(a.market,array['admin','compliance']) then raise exception 'Library review denied' using errcode='42501'; end if;
 if p_revision is null or a.revision<>p_revision then raise exception 'Asset changed; reload' using errcode='40001'; end if;
 if p_withdraw is null or p_reference is null or length(btrim(p_reference)) not between 3 and 120 then raise exception 'Review reference required' using errcode='22023'; end if;
 if p_withdraw then
  update private.library_assets set live_version=null where id=a.id;
 else
  select * into v from private.library_versions where asset_id=a.id and version=a.revision;
  if v.created_by=actor then raise exception 'Another reviewer must approve this version' using errcode='42501'; end if;
  insert into private.library_reviews(asset_id,version,reviewer_id,approval_reference) values(a.id,a.revision,actor,btrim(p_reference)) on conflict do nothing;
  update private.library_assets set live_version=a.revision where id=a.id;
 end if;
 insert into public.audit_logs(actor_id,action,entity,entity_id) values(actor,case when p_withdraw then 'LIBRARY_WITHDRAWN:' else 'LIBRARY_PUBLISHED:' end||btrim(p_reference),'library_assets',a.id::text);
end $$;

create function private.search_library(p_market text,p_locale text,p_search text,p_type text,p_page integer,p_staff boolean) returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
 if p_market is null or p_market not in ('PH','SG','MY') or p_page is null or p_page not between 0 and 10000 or p_staff is null
  or length(coalesce(p_search,''))>120 or (p_type is not null and p_type not in ('image','video','document'))
  or (p_locale is not null and p_locale !~ '^[a-z]{2}(-[A-Z]{2})?$') then raise exception 'Invalid library query' using errcode='22023'; end if;
 if p_staff then
  if not private.has_role(p_market,array['admin','editor','compliance']) then raise exception 'Library access denied' using errcode='42501'; end if;
 else
  if (private.my_verified_distributor()).user_id is null then raise exception 'Verified distributor required' using errcode='42501'; end if;
  if (private.my_verified_distributor()).market<>p_market then raise exception 'Library market denied' using errcode='42501'; end if;
 end if;
 return (with visible as (
  select a.id,a.market,a.revision,a.live_version as "liveVersion",v.version,v.title,v.description,v.campaign,v.locale,v.media_type as "mediaType",v.url,v.transcript,v.disclaimer
  from private.library_assets a join private.library_versions v on v.asset_id=a.id and v.version=case when p_staff then a.revision else a.live_version end
  where (a.market=p_market or a.market is null) and (p_locale is null or v.locale=p_locale) and (p_type is null or v.media_type=p_type)
   and (coalesce(p_search,'')='' or position(lower(p_search) in lower(v.title||' '||v.description||' '||v.campaign))>0)
 ), page as (select * from visible order by title,id limit 25 offset p_page*25)
 select jsonb_build_object('total',(select count(*) from visible),'page',p_page,'assets',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb)));
end $$;

create function private.shared_library_asset(p_id uuid,p_market text) returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 if p_market is null or p_market not in ('PH','SG','MY') then raise exception 'Invalid market' using errcode='22023'; end if;
 return (select jsonb_build_object('id',a.id,'market',a.market,'version',v.version,'title',v.title,'description',v.description,'campaign',v.campaign,
 'locale',v.locale,'mediaType',v.media_type,'url',v.url,'transcript',v.transcript,'disclaimer',v.disclaimer)
 from private.library_assets a join private.library_versions v on v.asset_id=a.id and v.version=a.live_version
 where a.id=p_id and (a.market=p_market or a.market is null));
end $$;

create function public.save_library_version(p_id uuid,p_revision integer,p_market text,p_content jsonb) returns uuid language sql security invoker set search_path='' as $$ select private.save_library_version(p_id,p_revision,p_market,p_content) $$;
create function public.review_library_version(p_id uuid,p_revision integer,p_reference text,p_withdraw boolean) returns void language sql security invoker set search_path='' as $$ select private.review_library_version(p_id,p_revision,p_reference,p_withdraw) $$;
create function public.search_library(p_market text,p_locale text,p_search text,p_type text,p_page integer,p_staff boolean) returns jsonb language sql stable security invoker set search_path='' as $$ select private.search_library(p_market,p_locale,p_search,p_type,p_page,p_staff) $$;
create function public.shared_library_asset(p_id uuid,p_market text) returns jsonb language sql stable security invoker set search_path='' as $$ select private.shared_library_asset(p_id,p_market) $$;
revoke all on function private.save_library_version(uuid,integer,text,jsonb),public.save_library_version(uuid,integer,text,jsonb),
 private.review_library_version(uuid,integer,text,boolean),public.review_library_version(uuid,integer,text,boolean),
 private.search_library(text,text,text,text,integer,boolean),public.search_library(text,text,text,text,integer,boolean),
 private.shared_library_asset(uuid,text),public.shared_library_asset(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.save_library_version(uuid,integer,text,jsonb),public.save_library_version(uuid,integer,text,jsonb),
 private.review_library_version(uuid,integer,text,boolean),public.review_library_version(uuid,integer,text,boolean),
 private.search_library(text,text,text,text,integer,boolean),public.search_library(text,text,text,text,integer,boolean) to authenticated;
grant execute on function private.shared_library_asset(uuid,text),public.shared_library_asset(uuid,text) to anon,authenticated;
