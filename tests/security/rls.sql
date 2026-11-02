-- Run with a privileged SQL connection. All fixtures roll back, including auth users.
begin;
insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000001','riway-test-a@example.invalid'),
 ('10000000-0000-4000-8000-000000000002','riway-test-b@example.invalid'),
 ('10000000-0000-4000-8000-000000000003','riway-test-editor@example.invalid');
insert into public.profiles(id,full_name) values
 ('10000000-0000-4000-8000-000000000001','Test A'),('10000000-0000-4000-8000-000000000002','Test B');
insert into public.staff_roles(user_id,market,role) values('10000000-0000-4000-8000-000000000003','PH','editor');
insert into public.content_entries(slug,kind,title,status,market) values('test-private-draft','story','Private draft','draft','PH');

set local role anon;
do $$ begin
 if (select count(*) from public.products where status<>'published')<>0 then raise exception 'FAIL: anon can read drafts'; end if;
 if (select count(*) from public.content_entries where slug='test-private-draft')<>0 then raise exception 'FAIL: anon can read private content'; end if;
 if has_table_privilege('anon','public.profiles','SELECT') then raise exception 'FAIL: anon has profile privileges'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
do $$ begin
 if (select count(*) from public.profiles)<>1 then raise exception 'FAIL: customer isolation'; end if;
 if (select full_name from public.profiles limit 1)<>'Test A' then raise exception 'FAIL: wrong profile'; end if;
 if exists(select 1 from public.inventory) then raise exception 'FAIL: customer sees stock'; end if;
 if exists(select 1 from public.content_entries where slug='test-private-draft') then raise exception 'FAIL: customer sees drafts'; end if;
 begin
 insert into public.staff_roles(user_id,market,role) values(auth.uid(),'PH','admin');
 raise exception 'FAIL: role escalation succeeded';
 exception when insufficient_privilege then null; end;
 begin
 update public.profiles set full_name='Hacked' where id='10000000-0000-4000-8000-000000000002';
 if found then raise exception 'FAIL: cross-customer write'; end if;
 end;
 begin
 perform public.adjust_inventory((select id from public.products limit 1),'PH',10,'Unauthorized test');
 raise exception 'FAIL: customer adjusted inventory';
 exception when raise_exception then if SQLERRM<>'Access denied' then raise; end if; end;
 begin
 perform public.create_order('PH',jsonb_build_array(jsonb_build_object('productId',(select id from public.products limit 1),'quantity',1)),jsonb_build_object('country','PH'),gen_random_uuid(),'2026-11-draft');
 raise exception 'FAIL: unapproved market checkout';
 exception when raise_exception then if SQLERRM<>'Online sales not approved' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
do $$ begin
 if private.has_role('PH') then raise exception 'FAIL: staff without MFA authorized'; end if;
 if exists(select 1 from public.content_entries where slug='test-private-draft') then raise exception 'FAIL: staff without MFA sees drafts'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
do $$ begin
 if not private.has_role('PH') then raise exception 'FAIL: verified staff denied'; end if;
 if private.has_role('SG') then raise exception 'FAIL: staff country scope bypass'; end if;
 if (select count(*) from public.content_entries where slug='test-private-draft')<>1 then raise exception 'FAIL: verified editor cannot read draft'; end if;
 insert into public.content_entries(slug,kind,title,status,market) values('test-editor-draft','story','Editor draft','draft','PH');
 begin
 update public.content_entries set status='published' where slug='test-editor-draft';
 raise exception 'FAIL: editor bypassed compliance';
 exception when raise_exception then if SQLERRM<>'Compliance approval required before publication' then raise; end if; end;
 begin
 insert into public.content_entries(slug,kind,title,status,market) values('test-foreign-draft','story','Foreign draft','draft','SG');
 raise exception 'FAIL: editor wrote foreign market';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: anonymous restrictions, owner isolation, escalation denial, MFA, country scope, editorial approval, market checkout gate; all fixtures rolled back' as result;
