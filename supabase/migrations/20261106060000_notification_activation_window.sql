-- Start the retry safety window on the first claim, not while delivery is disabled.
alter table private.notification_jobs add column first_attempt_at timestamptz;

-- Existing attempted jobs retain the conservative original deadline. They may
-- already have reached the provider, so migration must not extend their window.
update private.notification_jobs set first_attempt_at=created_at where attempts>0;

-- The previous worker expired unattempted jobs solely because of their age.
-- No provider request can have been issued for an attempts=0 job.
update private.notification_jobs
set status='pending',last_error_code=null,next_attempt_at=now()
where status='failed' and last_error_code='expired' and attempts=0;

create or replace function private.claim_notifications()
returns setof private.notification_jobs language plpgsql security definer set search_path='' as $$
begin
 update private.notification_jobs set status='failed',last_error_code='expired'
 where status in ('pending','processing')
  and (lease_until is null or lease_until<=now())
  and (first_attempt_at<now()-interval '23 hours' or attempts>=6);

 return query update private.notification_jobs j
 set status='processing',attempts=attempts+1,lease=gen_random_uuid(),
  lease_until=now()+interval '5 minutes',first_attempt_at=coalesce(first_attempt_at,now())
 where id in (
  select id from private.notification_jobs
  where attempts<6 and (first_attempt_at is null or first_attempt_at>=now()-interval '23 hours')
   and ((status='pending' and next_attempt_at<=now()) or (status='processing' and lease_until<now()))
  order by next_attempt_at,id for update skip locked limit 5
 ) returning j.*;
end $$;

revoke all on function private.claim_notifications() from public,anon,authenticated;
grant execute on function private.claim_notifications() to service_role;
