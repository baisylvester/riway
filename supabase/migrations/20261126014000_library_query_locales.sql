-- Keep query validation aligned with the independently reviewed content locale
-- constraints. Existing market, distributor and MFA checks remain unchanged.
create or replace function private.search_library(p_market text,p_locale text,p_search text,p_type text,p_page integer,p_staff boolean) returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
 if p_market is null or p_market not in ('PH','SG','MY') or p_page is null or p_page not between 0 and 10000 or p_staff is null
  or length(coalesce(p_search,''))>120 or (p_type is not null and p_type not in ('image','video','document'))
  or (p_locale is not null and p_locale !~ '^[a-z]{2,3}(-[A-Z]{2})?$') then raise exception 'Invalid library query' using errcode='22023'; end if;
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
