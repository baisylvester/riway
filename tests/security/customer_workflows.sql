-- Customer storage and event registration. All synthetic data rolls back.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
select set_config('request.jwt.claims','{}',true);
do $$ declare u uuid:=gen_random_uuid(); other_u uuid:=gen_random_uuid(); future_e uuid; past_e uuid; draft_e uuid; begin
 perform set_config('riway_qa.customer',u::text,true);
 perform set_config('riway_qa.other_customer',other_u::text,true);
 insert into auth.users(id,email) values(u,'riway-live-audit-'||u::text||'@example.invalid'),(other_u,'riway-live-audit-'||other_u::text||'@example.invalid');
 insert into public.profiles(id,full_name) values(other_u,'Other temporary customer');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',other_u,'role','authenticated','aal','aal1')::text,true);
 insert into public.addresses(user_id,full_name,phone,line1,city,postal_code,country) values(other_u,'Other temporary customer','0000000000','Other temporary address','Manila','1000','PH');
 perform set_config('request.jwt.claims','{}',true);
 insert into public.content_entries(slug,kind,title,status,market,starts_at) values('audit-future-'||gen_random_uuid()::text,'event','Temporary future audit event','published','PH',now()+interval '1 day') returning id into future_e;
 insert into public.content_entries(slug,kind,title,status,market,starts_at) values('audit-past-'||gen_random_uuid()::text,'event','Temporary past audit event','published','PH',now()-interval '1 day') returning id into past_e;
 insert into public.content_entries(slug,kind,title,status,market,starts_at) values('audit-draft-'||gen_random_uuid()::text,'event','Temporary draft audit event','draft','PH',now()+interval '1 day') returning id into draft_e;
 perform set_config('riway_qa.future_event',future_e::text,true);
 perform set_config('riway_qa.past_event',past_e::text,true);
 perform set_config('riway_qa.draft_event',draft_e::text,true);
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('riway_qa.customer'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
do $$ declare u uuid:=current_setting('riway_qa.customer')::uuid; aid uuid; pid uuid; event_id uuid:=current_setting('riway_qa.future_event')::uuid; begin
 insert into public.profiles(id,full_name,phone,marketing_consent) values(u,'Temporary audit customer','0000000000',false);
 update public.profiles set full_name='Updated temporary audit customer',marketing_consent=true where id=u;
 if (select full_name from public.profiles where id=u)<>'Updated temporary audit customer' then raise exception 'FAIL: profile save'; end if;
 if exists(select 1 from public.profiles where id<>u) then raise exception 'FAIL: profile isolation'; end if;
 insert into public.addresses(user_id,full_name,phone,line1,city,postal_code,country) values(u,'Temporary audit customer','0000000000','Temporary audit address','Manila','1000','PH') returning id into aid;
 if (select count(*) from public.addresses)<>1 then raise exception 'FAIL: address isolation'; end if;
 update public.addresses set city='Quezon City' where id=aid;
 if (select city from public.addresses where id=aid)<>'Quezon City' then raise exception 'FAIL: address update'; end if;
 delete from public.addresses where id=aid;
 if exists(select 1 from public.addresses) then raise exception 'FAIL: address delete'; end if;
 select id into pid from public.products where slug='purtier-placenta';
 insert into public.carts(user_id,items) values(u,jsonb_build_array(jsonb_build_object('productId',pid,'quantity',2)));
 update public.carts set items=jsonb_build_array(jsonb_build_object('productId',pid,'quantity',3)) where user_id=u;
 if (select (items->0->>'quantity')::int from public.carts where user_id=u)<>3 then raise exception 'FAIL: saved cart persistence'; end if;
 insert into public.event_registrations(user_id,event_id) values(u,event_id);
 if (select count(*) from public.event_registrations where user_id=u)<>1 then raise exception 'FAIL: future event registration'; end if;
 begin
  insert into public.event_registrations(user_id,event_id) values(u,event_id);
  raise exception 'FAIL: duplicate registration';
 exception when unique_violation then null; end;
 begin
  insert into public.event_registrations(user_id,event_id) values(u,current_setting('riway_qa.past_event')::uuid);
  raise exception 'FAIL: past event registration';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.event_registrations(user_id,event_id) values(u,current_setting('riway_qa.draft_event')::uuid);
  raise exception 'FAIL: draft event registration';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.notification_jobs where user_id=current_setting('riway_qa.customer')::uuid and kind='event_registered')<>1 then raise exception 'FAIL: event acknowledgement queue'; end if;
end $$;
rollback;
select 'PASS: profile save/update/consent, profile isolation, address create/update/delete/isolation, saved cart persistence, future-event registration, duplicate/past/draft rejection and transactional event notification; all fixtures rolled back' as result;
