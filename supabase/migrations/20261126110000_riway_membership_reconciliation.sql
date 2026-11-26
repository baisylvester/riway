-- Staff record facts read in RIWAY before releasing a verified paid enrolment.
-- This is local evidence, not a replacement for a RIWAY API acknowledgement.
create table private.riway_membership_verifications (
 enrollment_id uuid primary key references private.membership_enrollments(id),
 member_id text not null,
 sponsor_member_id text not null,
 market text not null references public.markets(code),
 tier_code text not null,
 reference text not null,
 recorded_by uuid not null references public.app_users(id),
 recorded_at timestamptz not null default clock_timestamp()
);
alter table private.riway_membership_verifications enable row level security;
revoke all on private.riway_membership_verifications from public,anon,authenticated,service_role;

create function private.require_riway_membership_verification() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if NEW.status='confirmed' and OLD.status is distinct from NEW.status
 and not exists (
  select 1 from private.riway_membership_verifications v
  where v.enrollment_id=NEW.id and v.member_id=NEW.external_member_id
  and v.reference=NEW.confirmation_reference and v.recorded_by=NEW.confirmed_by
 ) then
  raise exception 'Record the verified RIWAY market, sponsor and tier first' using errcode='22023';
 end if;
 return NEW;
end $$;
create trigger require_riway_membership_verification before update of status on private.membership_enrollments
 for each row execute function private.require_riway_membership_verification();

create function private.confirm_riway_membership(
 p_enrollment uuid,p_member text,p_sponsor text,p_market text,p_tier text,p_reference text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 e private.membership_enrollments;
 v private.riway_membership_verifications;
 member_id text:=btrim(p_member);
 sponsor_id text:=btrim(p_sponsor);
 reference_id text:=btrim(p_reference);
 actor uuid:=private.app_user_id();
 confirmed jsonb;
begin
 select * into e from private.membership_enrollments where id=p_enrollment;
 if not found or not private.has_role(e.market,array['admin','compliance']) then
  raise exception 'Membership confirmation access denied' using errcode='42501';
 end if;
 if member_id is null or length(member_id) not between 2 and 128 or member_id ~ '[[:cntrl:]]'
 or sponsor_id is null or length(sponsor_id) not between 1 and 128 or sponsor_id ~ '[[:cntrl:]]'
 or reference_id is null or length(reference_id) not between 5 and 200 or reference_id ~ '[[:cntrl:]]'
 or member_id=sponsor_id then
  raise exception 'Invalid RIWAY verification evidence' using errcode='22023';
 end if;
 if sponsor_id is distinct from e.sponsor_member_id
 or p_market is distinct from e.market or p_tier is distinct from (e.rule_snapshot->>'tierCode') then
  raise exception 'RIWAY market, sponsor or tier differs from the qualifying purchase' using errcode='23514';
 end if;
 -- Serializes with settlement/refund before the existing per-member lock.
 perform 1 from public.orders where id=e.order_id for update;
 select * into v from private.riway_membership_verifications where enrollment_id=e.id;
 if found then
  if (v.member_id,v.sponsor_member_id,v.market,v.tier_code,v.reference)
     is distinct from (member_id,sponsor_id,p_market,p_tier,reference_id) then
   raise exception 'Membership was already confirmed with different data' using errcode='40001';
  end if;
  return private.confirm_membership_enrollment(e.id,member_id,reference_id);
 end if;
 select * into e from private.membership_enrollments where id=p_enrollment;
 if e.status<>'pending_verification' then
  raise exception 'A paid enrolment awaiting RIWAY confirmation is required' using errcode='22023';
 end if;
 if exists(select 1 from public.orders where id=e.order_id and refunded_minor>0) then
  raise exception 'A refunded purchase requires RIWAY review before confirmation' using errcode='23514';
 end if;
 if exists(select 1 from public.distributor_profiles d where d.external_member_id=member_id and d.user_id<>e.user_id)
 or exists(select 1 from public.distributor_profiles d where d.user_id=e.user_id and d.external_member_id<>member_id) then
  raise exception 'RIWAY member ID conflicts with a distributor record' using errcode='23505';
 end if;
 insert into private.riway_membership_verifications(enrollment_id,member_id,sponsor_member_id,market,tier_code,reference,recorded_by)
 values(e.id,member_id,sponsor_id,p_market,p_tier,reference_id,actor);
 confirmed:=private.confirm_membership_enrollment(e.id,member_id,reference_id);

 -- A never-attempted paid event can acquire its verified member ID once.
 -- Historic mismatches and attempted payloads remain unchanged for review.
 update private.compensation_volume_events
 set payload=jsonb_set(payload,'{customerMemberId}',to_jsonb(member_id))
 where order_id=e.order_id and event_type='order_paid' and status='pending' and attempts=0
 and payload->>'sponsorMemberId'=sponsor_id and payload->'customerMemberId'='null'::jsonb;
 return confirmed;
end $$;

create function public.confirm_riway_membership(
 p_enrollment uuid,p_member text,p_sponsor text,p_market text,p_tier text,p_reference text
) returns jsonb
language sql security invoker set search_path='' as $$
 select private.confirm_riway_membership(p_enrollment,p_member,p_sponsor,p_market,p_tier,p_reference)
$$;
revoke all on function private.require_riway_membership_verification(),
 private.confirm_riway_membership(uuid,text,text,text,text,text),
 public.confirm_riway_membership(uuid,text,text,text,text,text)
 from public,anon,authenticated,service_role;
grant execute on function private.confirm_riway_membership(uuid,text,text,text,text,text),
 public.confirm_riway_membership(uuid,text,text,text,text,text) to authenticated;

-- Preserve IDs from the original paid snapshot across directory changes.
alter function private.compensation_payload(uuid,text) rename to compensation_payload_before_riway_reconciliation;
create function private.compensation_payload(p_order uuid,p_event text) returns jsonb
language sql stable security definer set search_path='' as $$
 select case p_event
 when 'order_reversed' then (
  select jsonb_set(p.payload,'{eventType}','"order_reversed"'::jsonb)
  from private.compensation_volume_events p where p.order_id=p_order and p.event_type='order_paid'
 )
 else private.compensation_payload_before_riway_reconciliation(p_order,p_event)
  || coalesce((
   select jsonb_build_object('sponsorMemberId',e.sponsor_member_id,
    'customerMemberId',case when e.status='confirmed' then e.external_member_id end)
   from private.membership_enrollments e where e.order_id=p_order
  ),'{}'::jsonb)
 end;
$$;
revoke all on function private.compensation_payload(uuid,text) from public,anon,authenticated,service_role;

create or replace function private.enqueue_compensation_event() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if NEW.payment_status='paid' and NEW.status in ('paid','fulfilling','shipped','delivered')
 and (OLD.payment_status is distinct from 'paid' or OLD.status not in ('paid','fulfilling','shipped','delivered')) then
  if NEW.sponsor_id is not null then
   insert into private.compensation_volume_events(order_id,event_type,external_reference,market,payload)
   values(NEW.id,'order_paid','riway-web:order:'||NEW.id||':paid',NEW.market,private.compensation_payload(NEW.id,'order_paid'))
   on conflict do nothing;
  end if;
 elsif (NEW.payment_status='refunded' and OLD.payment_status is distinct from 'refunded')
 or (NEW.status in ('cancelled','refunded') and OLD.status is distinct from NEW.status and OLD.payment_status='paid') then
  insert into private.compensation_volume_events(order_id,event_type,external_reference,market,payload)
  select NEW.id,'order_reversed','riway-web:order:'||NEW.id||':reversed',NEW.market,
   jsonb_set(p.payload,'{eventType}','"order_reversed"'::jsonb)
  from private.compensation_volume_events p where p.order_id=NEW.id and p.event_type='order_paid'
  on conflict do nothing;
 end if;
 return NEW;
end $$;

create function private.compensation_hold_reason(e private.compensation_volume_events)
returns text language plpgsql stable security definer set search_path='' as $$
declare
 original private.compensation_volume_events;
 enrolment private.membership_enrollments;
begin
 if e.event_type='order_reversed' then
  select * into original from private.compensation_volume_events
   where order_id=e.order_id and event_type='order_paid';
  if not found or original.status<>'acknowledged' then return 'original_volume_unacknowledged'; end if;
  if (e.payload-'eventType') is distinct from (original.payload-'eventType') then
   return 'original_snapshot_mismatch';
  end if;
  return null;
 end if;
 if nullif(btrim(e.payload->>'sponsorMemberId'),'') is null then return 'sponsor_identity_missing'; end if;
 if exists(select 1 from public.orders o where o.id=e.order_id and o.payment_status='paid'
  and o.status not in ('paid','fulfilling','shipped','delivered')) then return 'payment_under_review'; end if;
 select * into enrolment from private.membership_enrollments where order_id=e.order_id;
 if found then
  if enrolment.status<>'confirmed' then return 'membership_unconfirmed'; end if;
  if (e.payload->>'sponsorMemberId',e.payload->>'customerMemberId')
  is distinct from (enrolment.sponsor_member_id,enrolment.external_member_id) then return 'membership_snapshot_mismatch'; end if;
 end if;
 return null;
end $$;
revoke all on function private.compensation_hold_reason(private.compensation_volume_events)
 from public,anon,authenticated,service_role;

create or replace function private.claim_compensation_events(p_limit integer)
returns setof private.compensation_volume_events
language plpgsql security definer set search_path='' as $$
begin
 if p_limit is null or p_limit not between 1 and 25 then raise exception 'Invalid claim size'; end if;
 update private.compensation_volume_events set status='failed',last_error_code='retry_budget_exhausted',lease=null,lease_until=null
 where status='processing' and attempts>=10 and lease_until<=clock_timestamp();
 return query update private.compensation_volume_events e set status='processing',attempts=e.attempts+1,
  lease=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'
 where e.id in (
  select c.id from private.compensation_volume_events c
  where c.attempts<10 and ((c.status='pending' and c.next_attempt_at<=clock_timestamp())
   or (c.status='processing' and c.lease_until<=clock_timestamp()))
  and private.compensation_hold_reason(c) is null
  order by c.next_attempt_at,c.created_at,c.id for update skip locked limit p_limit
 )
 returning e.*;
end $$;

create or replace function private.staff_compensation_sync() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare allowed text[];
begin
 select array_agg(code) into allowed from public.markets
 where private.has_role(code,array['admin','operations']);
 if coalesce(cardinality(allowed),0)=0 then
  raise exception 'Compensation sync access denied' using errcode='42501';
 end if;
 return (
  with scoped as materialized (
   select e.id,e.order_id,e.market,e.event_type,e.status,e.attempts,e.last_error_code,e.created_at,e.next_attempt_at,
    case when e.status='pending' then private.compensation_hold_reason(e) end as hold
   from private.compensation_volume_events e where e.market=any(allowed)
  ), attention as (
   select * from scoped where status='failed' or hold is not null
   or (status in ('pending','processing') and created_at<now()-interval '1 hour')
   order by created_at desc,id limit 50
  )
  select jsonb_build_object(
   'counts',(select jsonb_object_agg(s,(select count(*) from scoped where status=s))
    from unnest(array['pending','processing','acknowledged','failed']) s),
   'held',(select count(*) from scoped where hold is not null),
   'stalePending',(select count(*) from scoped where status in ('pending','processing')
     and hold is null and created_at<now()-interval '1 hour'),
   'attention',(select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'orderId',order_id,'market',market,'eventType',event_type,'status',status,'attempts',attempts,
    'lastErrorCode',last_error_code,'holdReason',hold,'createdAt',created_at,'nextAttemptAt',next_attempt_at
   ) order by created_at desc,id),'[]'::jsonb) from attention)
  )
 );
end $$;

create or replace function private.enqueue_missing_compensation_events(p_since timestamptz) returns integer
language plpgsql security definer set search_path='' as $$
declare total integer;
begin
 if p_since is null or p_since < clock_timestamp()-interval '31 days' then
  raise exception 'Backfill window must be within 31 days';
 end if;
 insert into private.compensation_volume_events(order_id,event_type,external_reference,market,payload)
 select o.id,'order_paid','riway-web:order:'||o.id||':paid',o.market,private.compensation_payload(o.id,'order_paid')
 from public.orders o where o.created_at>=p_since and o.sponsor_id is not null
 and o.payment_status='paid' and o.status in ('paid','fulfilling','shipped','delivered')
 and not exists(select 1 from private.compensation_volume_events e where e.order_id=o.id and e.event_type='order_paid')
 on conflict do nothing;
 get diagnostics total=row_count;
 insert into private.compensation_volume_events(order_id,event_type,external_reference,market,payload)
 select o.id,'order_reversed','riway-web:order:'||o.id||':reversed',o.market,private.compensation_payload(o.id,'order_reversed')
 from public.orders o where (o.payment_status='refunded' or o.status in ('cancelled','refunded')) and o.created_at>=p_since
 and exists(select 1 from private.compensation_volume_events e where e.order_id=o.id and e.event_type='order_paid')
 and not exists(select 1 from private.compensation_volume_events e where e.order_id=o.id and e.event_type='order_reversed')
 on conflict do nothing;
 return total;
end $$;
