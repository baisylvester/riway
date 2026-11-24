-- G25: authenticated privacy-request intake and manual case handling.
-- This does not erase data, revoke sessions, export data or invent a retention
-- policy. Fulfilment takes place through RIWAY's approved verification/process.
create table private.privacy_requests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.app_users(id),
 market text not null references public.markets(code),
 kind text not null check(kind in ('access','correction','erasure','restriction')),
 details text not null check(length(btrim(details)) between 20 and 2000),
 status text not null default 'submitted' check(status in ('submitted','in_review','needs_information','completed','declined','withdrawn')),
 revision integer not null default 0 check(revision>=0),
 verified_by uuid references public.app_users(id),
 verified_at timestamptz,
 verification_reference text check(length(btrim(verification_reference)) between 3 and 120),
 resolution_reference text check(length(btrim(resolution_reference)) between 3 and 120),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 check((verified_by is null)=(verified_at is null) and (verified_at is null)=(verification_reference is null)),
 check(status<>'completed' or (verified_at is not null and resolution_reference is not null)),
 check(status<>'declined' or resolution_reference is not null)
);
create index privacy_requests_owner_idx on private.privacy_requests(user_id,created_at desc,id);
create index privacy_requests_market_idx on private.privacy_requests(market,created_at desc,id);
create index privacy_requests_verifier_idx on private.privacy_requests(verified_by);
create unique index privacy_requests_one_open on private.privacy_requests(user_id,market,kind)
 where status in ('submitted','in_review','needs_information');

create table private.privacy_request_events (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references private.privacy_requests(id),
 actor_id uuid not null references public.app_users(id),
 revision integer not null,
 by_staff boolean not null,
 status text not null,
 message text not null check(length(btrim(message)) between 1 and 2000),
 created_at timestamptz not null default clock_timestamp(),
 unique(request_id,revision)
);
create index privacy_events_actor_idx on private.privacy_request_events(actor_id);
alter table private.privacy_requests enable row level security;
alter table private.privacy_request_events enable row level security;
revoke all on private.privacy_requests,private.privacy_request_events from public,anon,authenticated,service_role;
create policy privacy_requests_internal on private.privacy_requests for all to anon,authenticated using(false) with check(false);
create policy privacy_events_internal on private.privacy_request_events for all to anon,authenticated using(false) with check(false);

create function private.create_privacy_request(p_market text,p_kind text,p_details text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.app_user_id(); existing private.privacy_requests; result uuid; body text:=btrim(p_details); begin
 if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_market is null or p_market not in ('PH','SG','MY') or p_kind is null or p_kind not in ('access','correction','erasure','restriction')
  or body is null or length(body) not between 20 and 2000 or body ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' then
  raise exception 'Invalid privacy request' using errcode='22023'; end if;
 -- Serialize intake per owner so duplicate submissions do not create two cases.
 perform pg_advisory_xact_lock(hashtextextended(actor::text,7525));
 select * into existing from private.privacy_requests where user_id=actor and market=p_market and kind=p_kind
  and status in ('submitted','in_review','needs_information');
 if found then
  if existing.details=body then return existing.id; end if;
  raise exception 'An open request of this type already exists. Add a message to it.' using errcode='23505';
 end if;
 perform private.check_rate('privacy_request',5,3600);
 insert into private.privacy_requests(user_id,market,kind,details) values(actor,p_market,p_kind,body) returning id into result;
 insert into private.privacy_request_events(request_id,actor_id,revision,by_staff,status,message)
 values(result,actor,0,false,'submitted',body);
 insert into public.audit_logs(actor_id,action,entity,entity_id) values(actor,'PRIVACY_REQUEST_SUBMITTED','privacy_requests',result::text);
 return result;
end $$;

create function private.list_privacy_requests(p_staff boolean,p_market text,p_closed boolean,p_page integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.app_user_id(); result jsonb; begin
 if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_page is null or p_page not between 0 and 1000000 or p_staff is null or p_closed is null then raise exception 'Invalid page' using errcode='22023'; end if;
 if p_staff and (p_market is null or not private.has_role(p_market,array['admin','compliance'])) then
  raise exception 'Privacy staff access required' using errcode='42501'; end if;
 with visible as (
  select r.* from private.privacy_requests r where
   case when p_staff then r.market=p_market and r.user_id<>actor
    and ((r.status in ('completed','declined','withdrawn'))=p_closed)
   else r.user_id=actor end
 ), page as (select * from visible order by created_at desc,id desc limit 25 offset p_page*25)
 select jsonb_build_object('total',(select count(*) from visible),'page',p_page,'requests',coalesce((select jsonb_agg(
  jsonb_build_object('id',id,'market',market,'kind',kind,'status',status,'revision',revision,'createdAt',created_at,'updatedAt',updated_at)
  order by created_at desc,id desc) from page),'[]'::jsonb)) into result;
 return result;
end $$;

create function private.get_privacy_request(p_id uuid,p_staff boolean,p_page integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.app_user_id(); r private.privacy_requests; begin
 if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_staff is null or p_page is null or p_page not between 0 and 1000000 then raise exception 'Invalid page' using errcode='22023'; end if;
 select * into r from private.privacy_requests where id=p_id;
 if not found or not (case when p_staff then r.user_id<>actor and private.has_role(r.market,array['admin','compliance']) else r.user_id=actor end) then
  raise exception 'Privacy request unavailable' using errcode='42501'; end if;
 return jsonb_build_object('id',r.id,'market',r.market,'kind',r.kind,'status',r.status,'revision',r.revision,
  'createdAt',r.created_at,'updatedAt',r.updated_at,'details',r.details,'identityVerified',r.verified_at is not null,
  'totalEvents',(select count(*) from private.privacy_request_events where request_id=r.id),'page',p_page,
  'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'byStaff',e.by_staff,'status',e.status,'message',e.message,'createdAt',e.created_at)
   order by e.revision desc) from (select * from private.privacy_request_events where request_id=r.id order by revision desc limit 25 offset p_page*25) e),'[]'::jsonb));
end $$;

create function private.update_privacy_request(p_id uuid,p_revision integer,p_operation text,p_status text,p_message text,p_verification text,p_reference text) returns integer
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.app_user_id(); r private.privacy_requests; new_status text; body text:=btrim(p_message);
 verification text:=nullif(btrim(p_verification),''); reference text:=nullif(btrim(p_reference),''); staff boolean:=p_operation='review'; begin
 if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_operation is null or p_operation not in ('message','withdraw','review') or p_revision is null then raise exception 'Invalid operation' using errcode='22023'; end if;
 select * into r from private.privacy_requests where id=p_id for update;
 if not found or not (case when staff then r.user_id<>actor and private.has_role(r.market,array['admin','compliance']) else r.user_id=actor end) then
  raise exception 'Privacy request unavailable' using errcode='42501'; end if;
 if r.revision<>p_revision then raise exception 'This request changed. Reload before continuing.' using errcode='40001'; end if;
 if r.status in ('completed','declined','withdrawn') then raise exception 'This request is closed' using errcode='22023'; end if;
 if p_operation='withdraw' then
  new_status:='withdrawn'; body:='Request withdrawn by the account holder.';
 else
  if body is null or length(body) not between 10 and 2000 or body ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' then raise exception 'Enter a message of 10–2000 characters' using errcode='22023'; end if;
  if staff then
   if p_status is null or not (
    (r.status='submitted' and p_status in ('in_review','needs_information','declined')) or
    (r.status='in_review' and p_status in ('in_review','needs_information','completed','declined')) or
    (r.status='needs_information' and p_status in ('in_review','needs_information','declined'))
   ) then raise exception 'Invalid status transition' using errcode='22023'; end if;
   if (verification is not null and (length(verification) not between 3 and 120 or verification ~ '[[:cntrl:]]'))
    or (reference is not null and (length(reference) not between 3 and 120 or reference ~ '[[:cntrl:]]')) then
    raise exception 'Invalid case reference' using errcode='22023'; end if;
   if p_status='completed' and r.verified_at is null and verification is null then raise exception 'Record identity verification before completing the request' using errcode='22023'; end if;
   if p_status in ('completed','declined') and reference is null then raise exception 'A resolution reference is required' using errcode='22023'; end if;
   new_status:=p_status;
  else
   perform private.check_rate('privacy_message',20,3600);
   new_status:=case when r.status='needs_information' then 'submitted' else r.status end;
  end if;
 end if;
 update private.privacy_requests set status=new_status,revision=revision+1,updated_at=clock_timestamp(),
  verified_by=case when staff and verification is not null and verified_at is null then actor else verified_by end,
  verified_at=case when staff and verification is not null then coalesce(verified_at,clock_timestamp()) else verified_at end,
  verification_reference=case when staff and verification is not null then coalesce(verification_reference,verification) else verification_reference end,
  resolution_reference=case when staff then coalesce(reference,resolution_reference) else resolution_reference end
 where id=r.id;
 insert into private.privacy_request_events(request_id,actor_id,revision,by_staff,status,message)
 values(r.id,actor,r.revision+1,staff,new_status,body);
 insert into public.audit_logs(actor_id,action,entity,entity_id) values(actor,'PRIVACY_REQUEST_'||upper(p_operation)||':'||new_status,'privacy_requests',r.id::text);
 return r.revision+1;
end $$;

-- Public RPCs are invoker wrappers; all authorization is repeated by private
-- implementations. No table writes or broad service-role RPC grants are added.
create function public.create_privacy_request(p_market text,p_kind text,p_details text) returns uuid language sql security invoker set search_path='' as $$ select private.create_privacy_request(p_market,p_kind,p_details) $$;
create function public.list_privacy_requests(p_staff boolean default false,p_market text default null,p_closed boolean default false,p_page integer default 0) returns jsonb language sql stable security invoker set search_path='' as $$ select private.list_privacy_requests(p_staff,p_market,p_closed,p_page) $$;
create function public.get_privacy_request(p_id uuid,p_staff boolean default false,p_page integer default 0) returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_privacy_request(p_id,p_staff,p_page) $$;
create function public.update_privacy_request(p_id uuid,p_revision integer,p_operation text,p_status text default null,p_message text default null,p_verification text default null,p_reference text default null) returns integer language sql security invoker set search_path='' as $$ select private.update_privacy_request(p_id,p_revision,p_operation,p_status,p_message,p_verification,p_reference) $$;

revoke all on function private.create_privacy_request(text,text,text),public.create_privacy_request(text,text,text),
 private.list_privacy_requests(boolean,text,boolean,integer),public.list_privacy_requests(boolean,text,boolean,integer),
 private.get_privacy_request(uuid,boolean,integer),public.get_privacy_request(uuid,boolean,integer),
 private.update_privacy_request(uuid,integer,text,text,text,text,text),public.update_privacy_request(uuid,integer,text,text,text,text,text)
 from public,anon,authenticated,service_role;
grant execute on function private.create_privacy_request(text,text,text),public.create_privacy_request(text,text,text),
 private.list_privacy_requests(boolean,text,boolean,integer),public.list_privacy_requests(boolean,text,boolean,integer),
 private.get_privacy_request(uuid,boolean,integer),public.get_privacy_request(uuid,boolean,integer),
 private.update_privacy_request(uuid,integer,text,text,text,text,text),public.update_privacy_request(uuid,integer,text,text,text,text,text)
 to authenticated;
