-- Hosted regression suite. Every QA identity, role, store and movement rolls back.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$
declare a uuid:=gen_random_uuid(); o uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); x uuid:=gen_random_uuid();
begin
 perform set_config('riway_qa.admin',a::text,true);
 perform set_config('riway_qa.owner',o::text,true);
 perform set_config('riway_qa.viewer',v::text,true);
 perform set_config('riway_qa.other',x::text,true);
 insert into auth.users(id,email) select id,'riway-live-audit-'||id::text||'@example.invalid' from unnest(array[a,o,v,x]) id;
 insert into private.platform_admins(user_id) values(a);
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('riway_qa.admin'),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
do $$ declare t uuid; t2 uuid; begin
 if not public.is_platform_admin() then raise exception 'FAIL: super admin denied'; end if;
 t:=public.create_tenant('RIWAY audit temporary store',current_setting('riway_qa.owner')::uuid);
 t2:=public.create_tenant('RIWAY audit other temporary store',current_setting('riway_qa.other')::uuid);
 perform set_config('riway_qa.tenant',t::text,true);
 perform set_config('riway_qa.other_tenant',t2::text,true);
 if (select count(*) from public.tenants where id in(t,t2))<>2 then raise exception 'FAIL: super admin oversight'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('riway_qa.owner'),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
do $$
declare t uuid:=current_setting('riway_qa.tenant')::uuid; l uuid; p uuid; key uuid:=gen_random_uuid(); b jsonb; retry jsonb;
begin
 perform public.setup_tenant_inventory(t,'location','{"name":"Audit warehouse","market":"PH"}'::jsonb);
 perform public.setup_tenant_inventory(t,'product',jsonb_build_object('product_id',(select id from public.products where slug='purtier-placenta'),'sku','AUDIT-001'));
 perform public.setup_tenant_inventory(t,'member',jsonb_build_object('user_id',current_setting('riway_qa.viewer'),'role','viewer'));
 select id into l from public.tenant_locations where tenant_id=t;
 select id into p from public.tenant_products where tenant_id=t;
 perform set_config('riway_qa.location',l::text,true);
 perform set_config('riway_qa.product',p::text,true);
 b:=public.mutate_tenant_stock(t,l,p,'receive',10,'Temporary audit opening stock',key);
 retry:=public.mutate_tenant_stock(t,l,p,'receive',10,'Temporary audit opening stock',key);
 if b<>retry then raise exception 'FAIL: idempotent stock replay'; end if;
 begin
  perform public.mutate_tenant_stock(t,l,p,'receive',11,'Temporary audit opening stock',key);
  raise exception 'FAIL: changed idempotency payload accepted';
 exception when raise_exception then if SQLERRM<>'Idempotency conflict' then raise; end if; end;
 perform public.mutate_tenant_stock(t,l,p,'reserve',4,'Temporary audit reserve',gen_random_uuid());
 perform public.mutate_tenant_stock(t,l,p,'release',1,'Temporary audit release',gen_random_uuid());
 perform public.mutate_tenant_stock(t,l,p,'allocate',2,'Temporary audit allocation',gen_random_uuid());
 perform public.mutate_tenant_stock(t,l,p,'fulfill',1,'Temporary audit fulfillment',gen_random_uuid());
 perform public.mutate_tenant_stock(t,l,p,'damage',1,'Temporary audit damage',gen_random_uuid());
 perform public.mutate_tenant_stock(t,l,p,'restore',1,'Temporary audit restoration',gen_random_uuid());
 b:=public.mutate_tenant_stock(t,l,p,'adjust',-1,'Temporary audit adjustment',gen_random_uuid());
 if (b->>'on_hand')::int<>8 or (b->>'reserved')::int<>1 or (b->>'allocated')::int<>1 or (b->>'damaged')::int<>0 then raise exception 'FAIL: movement balances'; end if;
 if (select count(*) from public.tenant_stock_ledger where tenant_id=t)<>8 then raise exception 'FAIL: duplicate or missing ledger entry'; end if;
 begin
  perform public.mutate_tenant_stock(t,l,p,'reserve',7,'Temporary audit oversell',gen_random_uuid());
  raise exception 'FAIL: oversell accepted';
 exception when check_violation then null; end;
 perform public.set_tenant_stock_threshold(t,l,p,6);
 if (select low_stock_threshold from public.tenant_stock where tenant_id=t)<>6 then raise exception 'FAIL: threshold not saved'; end if;
 if has_table_privilege('authenticated','public.tenant_stock_ledger','UPDATE') then raise exception 'FAIL: journal editable'; end if;
 begin
  perform public.setup_tenant_inventory(t,'access',jsonb_build_object('user_id',current_setting('riway_qa.owner'),'role','revoke'));
  raise exception 'FAIL: last owner removed';
 exception when raise_exception then if SQLERRM<>'A store must retain an owner' then raise; end if; end;
 begin
  perform public.setup_tenant_inventory(t,'access',jsonb_build_object('user_id',current_setting('riway_qa.other'),'role','viewer'));
  raise exception 'FAIL: missing-member update reported success';
 exception when no_data_found then null; end;
 begin
  perform public.claim_notifications();
  raise exception 'FAIL: browser claimed notification queue';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('riway_qa.viewer'),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
do $$ begin
 if (select count(*) from public.tenant_stock where tenant_id=current_setting('riway_qa.tenant')::uuid)<>1 then raise exception 'FAIL: viewer cannot read assigned stock'; end if;
 begin
  perform public.mutate_tenant_stock(current_setting('riway_qa.tenant')::uuid,current_setting('riway_qa.location')::uuid,current_setting('riway_qa.product')::uuid,'receive',1,'Forbidden viewer movement',gen_random_uuid());
  raise exception 'FAIL: viewer changed stock';
 exception when raise_exception then if SQLERRM<>'Inventory access required' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('riway_qa.other'),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.tenant_stock where tenant_id=current_setting('riway_qa.tenant')::uuid) then raise exception 'FAIL: cross-tenant stock disclosed'; end if;
 if exists(select 1 from public.tenants where id=current_setting('riway_qa.tenant')::uuid) then raise exception 'FAIL: cross-tenant store disclosed'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('riway_qa.owner'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.tenants where id=current_setting('riway_qa.tenant')::uuid) then raise exception 'FAIL: owner bypassed MFA'; end if;
end $$;
reset role;
set local role service_role;
do $$ declare jobs jsonb; j jsonb; t uuid:=current_setting('riway_qa.tenant')::uuid; begin
 perform public.queue_low_inventory_reports(current_date);
 if public.queue_low_inventory_reports(current_date)<>0 then raise exception 'FAIL: duplicate daily reports'; end if;
 jobs:=public.claim_notifications();
 for j in select value from jsonb_array_elements(jobs) loop
  if j->>'tenant_id'=t::text then
   if j->>'first_attempt_at' is null then raise exception 'FAIL: retry window not initialized'; end if;
   if public.finish_notification((j->>'id')::uuid,gen_random_uuid(),'sent','forged') then raise exception 'FAIL: forged lease accepted'; end if;
   if not public.notification_authorized((j->>'id')::uuid,(j->>'lease')::uuid) then raise exception 'FAIL: active owner notification suppressed'; end if;
  end if;
 end loop;
end $$;
reset role;
rollback;
select 'PASS: tenant creation/oversight, eight stock movements, idempotency, oversell rejection, low-stock thresholds, immutable journal, last-owner protection, missing-member errors, viewer permissions, tenant isolation, MFA, notification deduplication and lease security; all fixtures rolled back' as result;
