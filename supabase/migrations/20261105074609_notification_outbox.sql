create table private.notification_jobs(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id),
 kind text not null check(kind in ('support_received','event_registered')),
 reference uuid not null, unique(kind,reference),
 status text not null default 'pending' check(status in ('pending','processing','sent','failed','suppressed')),
 recipient text, provider_message_id text, attempts integer not null default 0,
 lease uuid, lease_until timestamptz, next_attempt_at timestamptz not null default now(),
 created_at timestamptz not null default now(), last_error_code text
);
alter table private.notification_jobs enable row level security;
revoke all on private.notification_jobs from public,anon,authenticated;
create index notification_ready_idx on private.notification_jobs(next_attempt_at) where status in ('pending','processing');
create index notification_user_idx on private.notification_jobs(user_id);
create function private.enqueue_notification() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.notification_jobs(user_id,kind,reference)
 values(NEW.user_id,case when TG_TABLE_NAME='support_tickets' then 'support_received' else 'event_registered' end,NEW.id)
 on conflict(kind,reference) do nothing;
 return NEW;
end $$;
revoke all on function private.enqueue_notification() from public,anon,authenticated;
create trigger support_notification after insert on public.support_tickets for each row execute function private.enqueue_notification();
create trigger registration_notification after insert on public.event_registrations for each row execute function private.enqueue_notification();

create function private.claim_notifications() returns setof private.notification_jobs language plpgsql security definer set search_path='' as $$
begin
 -- A fixed retry window stays within Resend's 24h deduplication window.
 update private.notification_jobs set status='failed',last_error_code='expired'
 where status in ('pending','processing') and (created_at<now()-interval '23 hours' or (attempts>=6 and coalesce(lease_until,now())<=now()));
 return query update private.notification_jobs j set status='processing',attempts=attempts+1,lease=gen_random_uuid(),lease_until=now()+interval '5 minutes'
 where id in (select id from private.notification_jobs where attempts<6 and created_at>=now()-interval '23 hours'
  and ((status='pending' and next_attempt_at<=now()) or (status='processing' and lease_until<now()))
  order by next_attempt_at for update skip locked limit 5) returning j.*;
end $$;
revoke all on function private.claim_notifications() from public,anon,authenticated;
grant execute on function private.claim_notifications() to service_role;
create function public.claim_notifications() returns jsonb language sql security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(j)),'[]'::jsonb) from private.claim_notifications() j;
$$;
revoke all on function public.claim_notifications() from public,anon,authenticated;
grant execute on function public.claim_notifications() to service_role;

create function private.notification_contact(u uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('native_email',case when a.email_confirmed_at is not null then a.email end,
 'clerk_subject',c.subject,'clerk_issuer',c.issuer)
 from public.app_users p left join auth.users a on a.id=p.auth_user_id
 left join private.clerk_identities c on c.user_id=p.id and c.disabled_at is null where p.id=u;
$$;
revoke all on function private.notification_contact(uuid) from public,anon,authenticated;
grant execute on function private.notification_contact(uuid) to service_role;
create function public.notification_contact(u uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.notification_contact(u) $$;
revoke all on function public.notification_contact(uuid) from public,anon,authenticated;
grant execute on function public.notification_contact(uuid) to service_role;

create function private.prepare_notification(job uuid, token uuid, destination text) returns text language plpgsql security definer set search_path='' as $$
declare result text; begin
 if length(destination)>320 or destination !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid destination'; end if;
 update private.notification_jobs set recipient=coalesce(recipient,destination)
 where id=job and lease=token and lease_until>now() and status='processing' returning recipient into result;
 return result;
end $$;
revoke all on function private.prepare_notification(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.prepare_notification(uuid,uuid,text) to service_role;
create function public.prepare_notification(job uuid,token uuid,destination text) returns text language sql security invoker set search_path='' as $$ select private.prepare_notification(job,token,destination) $$;
revoke all on function public.prepare_notification(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.prepare_notification(uuid,uuid,text) to service_role;

create function private.finish_notification(job uuid,token uuid,result text,reference text default null) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if result not in ('sent','retry','failed','suppressed') then raise exception 'Invalid delivery result'; end if;
 update private.notification_jobs set
 status=case when result='retry' and attempts<6 then 'pending' when result='retry' then 'failed' else result end,
 provider_message_id=case when result='sent' then left(finish_notification.reference,200) else provider_message_id end,
 last_error_code=case when result in ('retry','failed') then 'provider_unavailable' else null end,
 next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,attempts)::integer)),lease_until=null,lease=null
 where id=job and lease=token and status='processing' and lease_until>now();
 return found;
end $$;
revoke all on function private.finish_notification(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function private.finish_notification(uuid,uuid,text,text) to service_role;
create function public.finish_notification(job uuid,token uuid,result text,reference text default null) returns boolean language sql security invoker set search_path='' as $$ select private.finish_notification(job,token,result,reference) $$;
revoke all on function public.finish_notification(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.finish_notification(uuid,uuid,text,text) to service_role;
