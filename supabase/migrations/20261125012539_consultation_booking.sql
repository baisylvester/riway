-- Optional enhancement C. Availability is explicitly offered by verified distributors.
-- No meeting provider, commercial policy, medical consultation or payment is implied.
create table private.consultation_slots (
 id uuid primary key default gen_random_uuid(),
 distributor_id uuid not null references public.distributor_profiles(user_id),
 starts_at timestamptz not null, ends_at timestamptz not null,
 timezone text not null, active boolean not null default true,
 created_at timestamptz not null default clock_timestamp(),
 check(ends_at>starts_at and ends_at<=starts_at+interval '4 hours')
);
create index consultation_slots_owner_idx on private.consultation_slots(distributor_id,starts_at);
create table private.consultation_bookings (
 id uuid primary key default gen_random_uuid(),
 slot_id uuid not null references private.consultation_slots(id),
 user_id uuid not null references public.app_users(id),
 distributor_id uuid not null references public.distributor_profiles(user_id),
 timezone text not null, status text not null default 'booked' check(status in ('booked','cancelled')),
 revision integer not null default 0, created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(), check(user_id<>distributor_id)
);
create unique index consultation_one_booking on private.consultation_bookings(slot_id) where status='booked';
create index consultation_booking_user_idx on private.consultation_bookings(user_id,created_at desc);
create index consultation_booking_distributor_idx on private.consultation_bookings(distributor_id,created_at desc);
create table private.consultation_events (
 id uuid primary key default gen_random_uuid(), booking_id uuid not null references private.consultation_bookings(id),
 revision integer not null, kind text not null check(kind in ('update','reminder')),
 unique(booking_id,revision,kind)
);
alter table private.consultation_slots enable row level security;
alter table private.consultation_bookings enable row level security;
alter table private.consultation_events enable row level security;
revoke all on private.consultation_slots,private.consultation_bookings,private.consultation_events from public,anon,authenticated,service_role;
create policy consultation_slots_internal on private.consultation_slots for all using(false) with check(false);
create policy consultation_bookings_internal on private.consultation_bookings for all using(false) with check(false);
create policy consultation_events_internal on private.consultation_events for all using(false) with check(false);

create function private.consultation_timezone(z text) returns boolean language sql stable set search_path='' as $$
 select z is not null and length(z)<=80 and exists(select 1 from pg_timezone_names where name=z)
$$;

create function private.save_consultation_slot(p_id uuid,p_start timestamptz,p_end timestamptz,p_timezone text,p_active boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare d public.distributor_profiles; s private.consultation_slots; result uuid; begin
 d:=private.my_verified_distributor();
 if d.user_id is null then raise exception 'Verified distributor required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(d.user_id::text,6026));
 if p_id is not null then
  select * into s from private.consultation_slots where id=p_id for update;
  if not found or s.distributor_id<>d.user_id then raise exception 'Availability unavailable' using errcode='42501'; end if;
  if exists(select 1 from private.consultation_bookings where slot_id=s.id and status='booked') then
   raise exception 'Cancel the booking before changing its availability' using errcode='22023'; end if;
 end if;
 if p_start is null or p_end is null or p_active is null or p_start<=clock_timestamp() or p_start>clock_timestamp()+interval '365 days'
  or p_end<=p_start or p_end>p_start+interval '4 hours' or not private.consultation_timezone(p_timezone) then
  raise exception 'Invalid availability or timezone' using errcode='22023'; end if;
 if p_active and exists(select 1 from private.consultation_slots where distributor_id=d.user_id and active
  and id is distinct from p_id and starts_at<p_end and ends_at>p_start) then raise exception 'Availability overlaps' using errcode='23P01'; end if;
 if p_id is null then
  perform private.check_rate('consultation_slot',30,3600);
  insert into private.consultation_slots(distributor_id,starts_at,ends_at,timezone,active) values(d.user_id,p_start,p_end,p_timezone,p_active) returning id into result;
 else
  update private.consultation_slots set starts_at=p_start,ends_at=p_end,timezone=p_timezone,active=p_active where id=s.id returning id into result;
 end if;
 insert into public.audit_logs(actor_id,action,entity,entity_id) values(d.user_id,'CONSULTATION_AVAILABILITY','consultation_slots',result::text);
 return result;
end $$;

create function private.consultation_notice(b private.consultation_bookings,k text) returns void
language plpgsql security definer set search_path='' as $$
declare e uuid; s private.consultation_slots; begin
 insert into private.consultation_events(booking_id,revision,kind) values(b.id,b.revision,k)
  on conflict do nothing returning id into e;
 if e is null then return; end if;
 select * into s from private.consultation_slots where id=b.slot_id;
 insert into private.notification_jobs(user_id,kind,reference,context)
 select u,'consultation_'||k,e,jsonb_build_object('bookingId',b.id,'revision',b.revision,'status',b.status,'startsAt',s.starts_at,'timezone',b.timezone)
 from unnest(array[b.user_id,b.distributor_id]) u on conflict(kind,reference,user_id) do nothing;
end $$;

create function private.change_consultation(p_booking uuid,p_slot uuid,p_revision integer,p_timezone text,p_cancel boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.app_user_id(); b private.consultation_bookings; s private.consultation_slots; other uuid; begin
 if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_cancel is null or p_revision is null or not private.consultation_timezone(p_timezone) then raise exception 'Invalid booking' using errcode='22023'; end if;
 -- All operations for an existing booking lock its distributor first, then its
 -- customer. Sorted locks for all participants prevent cross-distributor races.
 if p_booking is not null then
  select * into b from private.consultation_bookings where id=p_booking;
  if not found or actor not in (b.user_id,b.distributor_id) then raise exception 'Booking unavailable' using errcode='42501'; end if;
  if actor=b.distributor_id and not p_cancel then raise exception 'Only the customer can reschedule' using errcode='42501'; end if;
  other:=b.user_id;
 else
  if p_cancel then raise exception 'Booking required' using errcode='22023'; end if;
  other:=actor;
 end if;
 if not p_cancel then
  select * into s from private.consultation_slots where id=p_slot;
  if not found then raise exception 'Availability unavailable' using errcode='22023'; end if;
  if p_booking is not null and s.distributor_id<>b.distributor_id then raise exception 'Choose the same distributor' using errcode='22023'; end if;
 end if;
 -- Same namespace as slot edits. Lock participant UUIDs in a global order.
 perform pg_advisory_xact_lock(hashtextextended(x::text,6026)) from (
  select distinct x from unnest(array[other,coalesce(b.distributor_id,s.distributor_id)]) x order by x
 ) locks;
 if p_booking is not null then
  select * into b from private.consultation_bookings where id=p_booking for update;
  if b.revision<>p_revision then raise exception 'Booking changed; reload' using errcode='40001'; end if;
  if b.status='cancelled' and p_cancel then return b.id; end if;
  if b.status<>'booked' then raise exception 'Booking is closed' using errcode='22023'; end if;
  if (select starts_at from private.consultation_slots where id=b.slot_id)<=clock_timestamp() then raise exception 'The consultation has already started' using errcode='22023'; end if;
 end if;
 if p_cancel then
  update private.consultation_bookings set status='cancelled',revision=revision+1,updated_at=clock_timestamp() where id=b.id returning * into b;
 else
  select * into s from private.consultation_slots where id=p_slot for update;
  if not s.active or s.starts_at<=clock_timestamp() or s.distributor_id=actor or not exists(
   select 1 from public.distributor_profiles where user_id=s.distributor_id and active and verified_at is not null
  ) then raise exception 'Availability unavailable' using errcode='22023'; end if;
  if p_booking is null then
   select * into b from private.consultation_bookings where user_id=actor and slot_id=s.id and status='booked';
   if found then return b.id; end if;
  end if;
  if exists(select 1 from private.consultation_bookings q join private.consultation_slots t on t.id=q.slot_id
   where q.status='booked' and q.id is distinct from p_booking and t.starts_at<s.ends_at and t.ends_at>s.starts_at
   and (q.user_id=other or q.distributor_id=other or q.user_id=s.distributor_id or q.distributor_id=s.distributor_id)) then
   raise exception 'This time is no longer available' using errcode='23P01'; end if;
  if p_booking is null then
   perform private.check_rate('consultation_booking',10,3600);
   insert into private.consultation_bookings(slot_id,user_id,distributor_id,timezone) values(s.id,actor,s.distributor_id,p_timezone) returning * into b;
  else
   update private.consultation_bookings set slot_id=s.id,timezone=p_timezone,revision=revision+1,updated_at=clock_timestamp() where id=b.id returning * into b;
  end if;
 end if;
 perform private.consultation_notice(b,'update');
 insert into public.audit_logs(actor_id,action,entity,entity_id) values(actor,'CONSULTATION_'||upper(b.status),'consultation_bookings',b.id::text);
 return b.id;
end $$;

create function private.consultations(p_code text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.app_user_id(); d public.distributor_profiles; begin
 if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_code is null then d:=private.my_verified_distributor();
 else select * into d from public.distributor_profiles where code=p_code and active and verified_at is not null; end if;
 return jsonb_build_object('distributorCode',d.code,'distributorName',d.display_name,'ownAvailability',d.user_id=actor,
 'slots',coalesce((select jsonb_agg(to_jsonb(t)) from (
  select s.id,s.starts_at as "startsAt",s.ends_at as "endsAt",s.timezone,s.active,
   exists(select 1 from private.consultation_bookings b where b.slot_id=s.id and b.status='booked') as booked
  from private.consultation_slots s where s.distributor_id=d.user_id and s.starts_at>now()
   and (d.user_id=actor or (s.active and not exists(select 1 from private.consultation_bookings b where b.slot_id=s.id and b.status='booked')))
  order by s.starts_at limit 100
 ) t),'[]'::jsonb),
 'bookings',coalesce((select jsonb_agg(to_jsonb(t)) from (
  select b.id,b.revision,b.status,b.timezone,s.starts_at as "startsAt",s.ends_at as "endsAt",profile.code as "distributorCode",profile.display_name as "distributorName",b.user_id=actor as "isCustomer"
  from private.consultation_bookings b join private.consultation_slots s on s.id=b.slot_id join public.distributor_profiles profile on profile.user_id=b.distributor_id
  where actor in (b.user_id,b.distributor_id) order by b.created_at desc limit 100
 ) t),'[]'::jsonb));
end $$;

alter table private.notification_jobs drop constraint notification_jobs_kind_check;
alter table private.notification_jobs add constraint notification_jobs_kind_check check(kind in
 ('support_received','event_registered','inventory_alert','store_owner_onboarding','low_inventory_report','membership_requested','membership_confirmed',
 'order_shipped','order_delivered','sales_report','order_confirmed','corporate_low_stock','consultation_update','consultation_reminder'));
alter function private.notification_authorized(uuid,uuid) rename to notification_authorized_before_consultations;
create function private.notification_authorized(job uuid,token uuid) returns boolean language sql stable security definer set search_path='' as $$
 select case when (select j.kind from private.notification_jobs j where j.id=job) in ('consultation_update','consultation_reminder') then
 exists(select 1 from private.notification_jobs j join private.consultation_events e on e.id=j.reference
 join private.consultation_bookings b on b.id=e.booking_id join private.consultation_slots s on s.id=b.slot_id
 where j.id=job and j.lease=token and j.status='processing' and j.lease_until>now() and b.revision=e.revision
 and j.user_id in (b.user_id,b.distributor_id) and (j.user_id=b.user_id or exists(select 1 from public.distributor_profiles d where d.user_id=j.user_id and d.active and d.verified_at is not null))
 and (e.kind='update' or (b.status='booked' and s.starts_at>now())))
 else private.notification_authorized_before_consultations(job,token) end
$$;
create function private.queue_consultation_reminders() returns integer language plpgsql security definer set search_path='' as $$
declare b private.consultation_bookings; total integer:=0; begin
 for b in select q.* from private.consultation_bookings q join private.consultation_slots s on s.id=q.slot_id
 where q.status='booked' and s.starts_at>now() and s.starts_at<=now()+interval '24 hours'
 and not exists(select 1 from private.consultation_events e where e.booking_id=q.id and e.revision=q.revision and e.kind='reminder')
 order by s.starts_at limit 100 for update of q skip locked loop
  perform private.consultation_notice(b,'reminder'); total:=total+1;
 end loop;
 return total;
end $$;

create function public.save_consultation_slot(p_id uuid,p_start timestamptz,p_end timestamptz,p_timezone text,p_active boolean) returns uuid language sql security invoker set search_path='' as $$ select private.save_consultation_slot(p_id,p_start,p_end,p_timezone,p_active) $$;
create function public.change_consultation(p_booking uuid,p_slot uuid,p_revision integer,p_timezone text,p_cancel boolean) returns uuid language sql security invoker set search_path='' as $$ select private.change_consultation(p_booking,p_slot,p_revision,p_timezone,p_cancel) $$;
create function public.consultations(p_code text) returns jsonb language sql stable security invoker set search_path='' as $$ select private.consultations(p_code) $$;
create function public.queue_consultation_reminders() returns integer language sql security invoker set search_path='' as $$ select private.queue_consultation_reminders() $$;
revoke all on function private.consultation_timezone(text),private.consultation_notice(private.consultation_bookings,text),
 private.save_consultation_slot(uuid,timestamptz,timestamptz,text,boolean),public.save_consultation_slot(uuid,timestamptz,timestamptz,text,boolean),
 private.change_consultation(uuid,uuid,integer,text,boolean),public.change_consultation(uuid,uuid,integer,text,boolean),
 private.consultations(text),public.consultations(text),private.queue_consultation_reminders(),public.queue_consultation_reminders(),
 private.notification_authorized(uuid,uuid),private.notification_authorized_before_consultations(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.save_consultation_slot(uuid,timestamptz,timestamptz,text,boolean),public.save_consultation_slot(uuid,timestamptz,timestamptz,text,boolean),
 private.change_consultation(uuid,uuid,integer,text,boolean),public.change_consultation(uuid,uuid,integer,text,boolean),private.consultations(text),public.consultations(text) to authenticated;
grant execute on function private.notification_authorized(uuid,uuid),private.queue_consultation_reminders(),public.queue_consultation_reminders() to service_role;
