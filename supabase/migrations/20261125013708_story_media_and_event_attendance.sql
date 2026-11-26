-- Optional A reuses the independently reviewed, versioned media library.
-- Source films/documents remain RIWAY-supplied; no testimonials are seeded.
alter table public.content_entries add column story_asset_id uuid references private.library_assets(id);
create index story_asset_idx on public.content_entries(story_asset_id) where story_asset_id is not null;
create function private.story_media_available(asset uuid,m text) returns boolean
language sql stable security definer set search_path='' as $$
 select asset is null or exists(select 1 from private.library_assets a join private.library_versions v on v.asset_id=a.id and v.version=a.live_version
 where a.id=asset and (a.market is null or a.market=m) and length(btrim(v.disclaimer))>=10)
$$;
create function private.guard_story_media() returns trigger language plpgsql set search_path='' as $$ begin
 if NEW.story_asset_id is not null and (NEW.kind<>'story' or NEW.market is null or
  (NEW.status in ('review','published') and not private.story_media_available(NEW.story_asset_id,NEW.market))) then
  raise exception 'Choose live reviewed story media with an approved disclaimer for this market' using errcode='22023'; end if;
 return NEW;
end $$;
create trigger story_media_guard before insert or update on public.content_entries for each row execute function private.guard_story_media();
drop policy content_read on public.content_entries;
create policy content_read on public.content_entries for select to anon,authenticated using(
 (status='published' and (publish_at is null or publish_at<=now()) and (unpublish_at is null or unpublish_at>now())
 and private.story_media_available(story_asset_id,market)) or private.has_role(market));

-- Optional D, non-financial part: capacity, self-cancellation, scoped attendee
-- management and idempotent check-in. Paid ticketing is a separate payment path.
create table private.event_admission_rules (
 event_id uuid primary key references public.content_entries(id),
 capacity integer not null check(capacity between 1 and 100000),
 approval_reference text not null check(length(btrim(approval_reference)) between 3 and 120),
 revision integer not null default 0,updated_by uuid not null references public.app_users(id)
);
create index event_admission_updater_idx on private.event_admission_rules(updated_by);
alter table private.event_admission_rules enable row level security;
revoke all on private.event_admission_rules from public,anon,authenticated,service_role;
create policy event_rules_internal on private.event_admission_rules for all using(false) with check(false);
alter table public.event_registrations add column status text not null default 'registered' check(status in ('registered','cancelled')),
 add column checked_in_at timestamptz, add column checked_in_by uuid references public.app_users(id),
 add column revision integer not null default 0;
create index event_checkin_actor_idx on public.event_registrations(checked_in_by) where checked_in_by is not null;
create function private.guard_event_admission() returns trigger language plpgsql security definer set search_path='' as $$
declare e public.content_entries; cap integer; begin
 if TG_OP='INSERT' then
  NEW.status:='registered';NEW.checked_in_at:=null;NEW.checked_in_by:=null;NEW.revision:=0;
 end if;
 select * into e from public.content_entries where id=NEW.event_id for update;
 if TG_OP='INSERT' or (TG_OP='UPDATE' and OLD.status='cancelled' and NEW.status='registered') then
  if not found or e.kind<>'event' or e.status<>'published' or e.starts_at is null or e.starts_at<=clock_timestamp()
   or e.publish_at>now() or e.unpublish_at<=now() then raise exception 'Registration is closed' using errcode='42501'; end if;
  select capacity into cap from private.event_admission_rules where event_id=e.id;
  if cap is not null and (select count(*) from public.event_registrations where event_id=e.id and status='registered')>=cap then
   raise exception 'This event is full' using errcode='23514'; end if;
 end if;
 return NEW;
end $$;
create trigger event_admission_guard before insert or update of status on public.event_registrations for each row execute function private.guard_event_admission();
create function private.save_event_admission(p_event uuid,p_capacity integer,p_revision integer,p_reference text) returns void
language plpgsql security definer set search_path='' as $$
declare e public.content_entries; r private.event_admission_rules; begin
 select * into e from public.content_entries where id=p_event for update;
 if not found or e.kind<>'event' or not private.has_role(e.market,array['admin','compliance']) then raise exception 'Event approval denied' using errcode='42501'; end if;
 select * into r from private.event_admission_rules where event_id=e.id;
 if p_revision is null or p_revision<>coalesce(r.revision,0) then raise exception 'Event rules changed; reload' using errcode='40001'; end if;
 if p_capacity is null or p_capacity<(select count(*) from public.event_registrations where event_id=e.id and status='registered') then raise exception 'Capacity is below confirmed attendance' using errcode='22023'; end if;
 insert into private.event_admission_rules(event_id,capacity,approval_reference,updated_by) values(e.id,p_capacity,btrim(p_reference),private.app_user_id())
 on conflict(event_id) do update set capacity=excluded.capacity,approval_reference=excluded.approval_reference,revision=private.event_admission_rules.revision+1,updated_by=excluded.updated_by;
 insert into public.audit_logs(actor_id,action,entity,entity_id) values(private.app_user_id(),'EVENT_ADMISSION_RULES','content_entries',e.id::text);
end $$;
create function private.event_attendance(p_event uuid,p_staff boolean,p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.app_user_id(); e public.content_entries; r private.event_admission_rules; begin
 if p_page is null or p_page not between 0 and 1000000 then raise exception 'Invalid page' using errcode='22023';end if;
 if actor is null or p_staff is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select * into e from public.content_entries where id=p_event;
 if not found or e.kind<>'event' or (p_staff and not private.has_role(e.market,array['admin','operations','compliance'])) then raise exception 'Event unavailable' using errcode='42501'; end if;
 if not p_staff and not (e.status='published' and (e.publish_at is null or e.publish_at<=now()) and (e.unpublish_at is null or e.unpublish_at>now()))
  and not exists(select 1 from public.event_registrations where event_id=e.id and user_id=actor) then
  raise exception 'Event unavailable' using errcode='42501'; end if;
 select * into r from private.event_admission_rules where event_id=e.id;
 return jsonb_build_object('eventId',e.id,'title',e.title,'startsAt',e.starts_at,'capacity',r.capacity,'rulesRevision',coalesce(r.revision,0),
 'registered',(select count(*) from public.event_registrations where event_id=e.id and status='registered'),
 'page',p_page,'total',(select count(*)from public.event_registrations where event_id=e.id and(p_staff or user_id=actor)),
 'attendees',coalesce((select jsonb_agg(to_jsonb(t)) from (select a.id,a.status,a.revision,a.checked_in_at as "checkedInAt",a.created_at as "createdAt",
  case when p_staff then coalesce(p.full_name,'Attendee') else 'Your registration' end as name
  from public.event_registrations a left join public.profiles p on p.id=a.user_id where a.event_id=e.id and (p_staff or a.user_id=actor)
  order by a.created_at,a.id limit 25 offset p_page*25) t),'[]'::jsonb));
end $$;
create function private.change_event_attendance(p_id uuid,p_revision integer,p_check_in boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.app_user_id(); a public.event_registrations; e public.content_entries; begin
 select * into a from public.event_registrations where id=p_id;
 select * into e from public.content_entries where id=a.event_id for update;
 if actor is null or a.id is null or p_check_in is null or not(case when p_check_in then private.has_role(e.market,array['admin','operations']) else actor=a.user_id or private.has_role(e.market,array['admin','operations']) end) then
  raise exception 'Registration access denied' using errcode='42501'; end if;
 select * into a from public.event_registrations where id=p_id for update;
 if p_revision is null or a.revision<>p_revision then raise exception 'Registration changed; reload' using errcode='40001'; end if;
 if p_check_in then
  if a.status<>'registered' or e.status<>'published' or e.starts_at is null then raise exception 'Registration is not valid for admission' using errcode='22023'; end if;
  if a.checked_in_at is not null then return; end if;
  update public.event_registrations set checked_in_at=clock_timestamp(),checked_in_by=actor,revision=revision+1 where id=a.id;
 else
  if a.status='cancelled' then return; end if;
  if a.checked_in_at is not null or e.starts_at<=clock_timestamp() then raise exception 'Contact support for a started or attended event' using errcode='22023'; end if;
  update public.event_registrations set status='cancelled',revision=revision+1 where id=a.id;
 end if;
 insert into public.audit_logs(actor_id,action,entity,entity_id) values(actor,case when p_check_in then 'EVENT_CHECKED_IN' else 'EVENT_CANCELLED' end,'event_registrations',a.id::text);
end $$;
create function public.save_event_admission(p_event uuid,p_capacity integer,p_revision integer,p_reference text) returns void language sql security invoker set search_path='' as $$ select private.save_event_admission(p_event,p_capacity,p_revision,p_reference) $$;
create function public.event_attendance(p_event uuid,p_staff boolean,p_page integer default 0) returns jsonb language sql stable security invoker set search_path='' as $$ select private.event_attendance(p_event,p_staff,p_page) $$;
create function public.change_event_attendance(p_id uuid,p_revision integer,p_check_in boolean) returns void language sql security invoker set search_path='' as $$ select private.change_event_attendance(p_id,p_revision,p_check_in) $$;
revoke all on function private.story_media_available(uuid,text),private.guard_story_media(),private.guard_event_admission(),
 private.save_event_admission(uuid,integer,integer,text),public.save_event_admission(uuid,integer,integer,text),
 private.event_attendance(uuid,boolean,integer),public.event_attendance(uuid,boolean,integer),private.change_event_attendance(uuid,integer,boolean),public.change_event_attendance(uuid,integer,boolean) from public,anon,authenticated,service_role;
grant execute on function private.story_media_available(uuid,text) to anon,authenticated;
grant execute on function private.save_event_admission(uuid,integer,integer,text),public.save_event_admission(uuid,integer,integer,text),
 private.event_attendance(uuid,boolean,integer),public.event_attendance(uuid,boolean,integer),private.change_event_attendance(uuid,integer,boolean),public.change_event_attendance(uuid,integer,boolean) to authenticated;

alter function private.notification_authorized(uuid,uuid) rename to notification_authorized_before_event_admission;
create function private.notification_authorized(job uuid,token uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.notification_authorized_before_event_admission(job,token)
 and (not exists(select 1 from private.notification_jobs j where j.id=job and j.kind='event_registered') or exists(
  select 1 from private.notification_jobs j join public.event_registrations a on a.id=j.reference
  where j.id=job and a.user_id=j.user_id and a.status='registered'))
$$;
revoke all on function private.notification_authorized(uuid,uuid),private.notification_authorized_before_event_admission(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.notification_authorized(uuid,uuid) to service_role;
