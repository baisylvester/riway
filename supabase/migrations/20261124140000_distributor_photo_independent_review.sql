-- A distributor who also holds a staff role must use an independent reviewer.
-- Keep the public invoker wrappers, role/market/MFA checks and grants intact.
create or replace function private.review_distributor_photo(p_id uuid,p_approve boolean,p_public_url text,p_reference text,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare s private.distributor_photo_submissions; d public.distributor_profiles; actor uuid:=private.app_user_id(); begin
 select * into s from private.distributor_photo_submissions where id=p_id for update;
 if not found then raise exception 'Photo review access denied' using errcode='42501'; end if;
 select * into d from public.distributor_profiles where user_id=s.user_id;
 if not private.has_role(d.market,array['admin','compliance']) or actor=s.user_id then
  raise exception 'Photo review access denied' using errcode='42501'; end if;
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

create or replace function private.set_distributor_photo(p_code text,p_url text,p_reference text) returns void
language plpgsql security definer set search_path='' as $$
declare d public.distributor_profiles; v_url text:=nullif(btrim(p_url),''); v_ref text:=nullif(btrim(p_reference),''); begin
 select * into d from public.distributor_profiles where code=p_code;
 if not found or not private.has_role(d.market,array['admin','compliance']) or d.user_id=private.app_user_id() then
  raise exception 'Distributor photo access denied' using errcode='42501'; end if;
 if (v_url is null)<>(v_ref is null) then raise exception 'A photo needs an approval reference'; end if;
 update public.distributor_profiles set photo_url=v_url,photo_reference=v_ref where user_id=d.user_id;
 insert into public.audit_logs(actor_id,action,entity,entity_id)
 values(private.app_user_id(),'DISTRIBUTOR_PHOTO:'||case when v_url is null then 'removed' else 'approved' end,'distributor_profiles',d.user_id::text);
end $$;

-- Excluding own submissions also lets the server action authorize before
-- copying a private submission into the public bucket.
create or replace function private.staff_photo_submissions() returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
 if not private.has_role(null,array['admin','compliance']) then raise exception 'Photo review access denied' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'code',d.code,'displayName',d.display_name,'market',d.market,
  'objectPath',s.object_path,'createdAt',s.created_at) order by s.created_at)
  from private.distributor_photo_submissions s join public.distributor_profiles d on d.user_id=s.user_id
  where s.status='pending' and s.user_id<>private.app_user_id() and private.has_role(d.market,array['admin','compliance'])),'[]'::jsonb);
end $$;
