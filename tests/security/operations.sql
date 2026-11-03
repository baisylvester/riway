begin;
insert into auth.users(id,email) values
 ('30000000-0000-4000-8000-000000000001','ops-customer@example.invalid'),
 ('30000000-0000-4000-8000-000000000002','ops-distributor@example.invalid'),
 ('30000000-0000-4000-8000-000000000003','ops-other-distributor@example.invalid'),
 ('30000000-0000-4000-8000-000000000004','ops-staff@example.invalid');
insert into public.distributor_profiles(user_id,external_member_id,code,display_name,market,active,verified_at) values
 ('30000000-0000-4000-8000-000000000002','OPS-D1','OPS-D1','Test distributor','PH',true,now()),
 ('30000000-0000-4000-8000-000000000003','OPS-D2','OPS-D2','Other distributor','PH',true,now());
insert into public.staff_roles(user_id,market,role) values('30000000-0000-4000-8000-000000000004','PH','operations');
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
do $$ declare n integer; begin
 if (select count(*) from public.lookup_distributor('OPS-D1'))<>1 then raise exception 'FAIL: verified lookup'; end if;
 perform public.claim_referral('OPS-D1');
 perform public.claim_referral('OPS-D2');
 if (select distributor_id from public.sponsor_attributions where user_id=auth.uid())<>'30000000-0000-4000-8000-000000000002'::uuid then raise exception 'FAIL: sponsor overwritten'; end if;
 for n in 1..5 loop
 insert into public.support_tickets(user_id,market,subject,message) values(auth.uid(),'PH','Test support request','A disposable integration test support request.');
 end loop;
 begin
 insert into public.support_tickets(user_id,market,subject,message) values(auth.uid(),'PH','Rate limited request','A disposable integration test support request.');
 raise exception 'FAIL: rate limit bypass';
 exception when raise_exception then if SQLERRM<>'Too many requests. Please try later.' then raise; end if; end;
 if has_table_privilege('authenticated','public.media_assets','UPDATE') then raise exception 'FAIL: media metadata freely mutable'; end if;
 if exists(select 1 from public.media_assets) then raise exception 'FAIL: customer can see editorial assets'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
do $$ declare pid uuid; begin
 select id into pid from public.products where slug='purtier-placenta';
 perform public.adjust_inventory(pid,'PH',10,'Disposable stock test');
 if (select on_hand from public.inventory where product_id=pid and market='PH')<>10 then raise exception 'FAIL: stock adjustment'; end if;
 begin
 perform public.adjust_inventory(pid,'PH',-11,'Invalid stock reduction');
 raise exception 'FAIL: negative stock accepted';
 exception when raise_exception then if SQLERRM<>'Stock cannot be reduced below reserved quantity' then raise; end if; end;
 update public.support_tickets set status='resolved' where user_id='30000000-0000-4000-8000-000000000001';
 if exists(select 1 from public.support_tickets where user_id='30000000-0000-4000-8000-000000000001' and status<>'resolved') then raise exception 'FAIL: support resolution'; end if;
end $$;
reset role;
rollback;
select 'PASS: verified lookup, immutable sponsor attribution, per-user support rate limit, private media, stock adjustment, negative-stock denial and support resolution; all fixtures rolled back' as result;
