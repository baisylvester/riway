-- Transactional integration test. Approval flags and every fixture roll back.
begin;
insert into auth.users(id,email) values
 ('20000000-0000-4000-8000-000000000001','checkout-test@example.invalid'),
 ('20000000-0000-4000-8000-000000000002','sponsor-test@example.invalid');
insert into public.distributor_profiles(user_id,external_member_id,code,display_name,active,verified_at,market) values
 ('20000000-0000-4000-8000-000000000002','TEST-MEMBER','TEST-SPONSOR','Test sponsor',true,now(),'PH');
insert into public.sponsor_attributions(user_id,distributor_id) values('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002');
insert into public.products(id,slug,name,category,status) values('20000000-0000-4000-8000-000000000003','checkout-test-product','Test product','Nutrition','published');
insert into public.product_offers(product_id,market,currency,retail_minor,member_minor,regulatory_approved,approval_reference,max_quantity) values('20000000-0000-4000-8000-000000000003','PH','PHP',10000,8000,true,'TEST-APPROVAL',6);
insert into public.inventory(product_id,market,on_hand) values('20000000-0000-4000-8000-000000000003','PH',10);
update public.markets set online_sales_approved=true,policy_reference='TEST-POLICY',payments_ready=true where code='PH';
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
do $$ declare oid uuid; retry uuid; lines jsonb:='[{"productId":"20000000-0000-4000-8000-000000000003","quantity":2}]'; address jsonb:='{"full_name":"Test Customer","phone":"123456789","line1":"123 Test Street","city":"Manila","postal_code":"1000","country":"PH"}'; begin
 oid:=public.create_order('PH',lines,address,'20000000-0000-4000-8000-000000000004','2026-11-draft');
 retry:=public.create_order('PH',lines,address,'20000000-0000-4000-8000-000000000004','2026-11-draft');
 if oid<>retry then raise exception 'FAIL: duplicate order'; end if;
 if (select total_minor from public.orders where id=oid)<>20000 then raise exception 'FAIL: server price calculation'; end if;
 if (select count(*) from public.order_items where order_id=oid)<>1 then raise exception 'FAIL: line items'; end if;
 begin
 perform public.create_order('PH','[{"productId":"20000000-0000-4000-8000-000000000003","quantity":3}]',address,'20000000-0000-4000-8000-000000000004','2026-11-draft');
 raise exception 'FAIL: conflicting idempotency payload';
 exception when raise_exception then if SQLERRM<>'Idempotency key reused with different data' then raise; end if; end;
 begin
 perform public.create_order('PH',lines||lines,address,gen_random_uuid(),'2026-11-draft');
 raise exception 'FAIL: duplicate product accepted';
 exception when raise_exception then if SQLERRM<>'Duplicate products' then raise; end if; end;
 begin
 perform public.create_order('PH','[{"productId":"20000000-0000-4000-8000-000000000003","quantity":7}]',address,gen_random_uuid(),'2026-11-draft');
 raise exception 'FAIL: market quantity limit';
 exception when raise_exception then if SQLERRM<>'Product unavailable in selected market' then raise; end if; end;
 begin
 perform public.create_order('PH',lines,'{"country":"PH"}',gen_random_uuid(),'2026-11-draft');
 raise exception 'FAIL: invalid delivery accepted';
 exception when raise_exception then if SQLERRM<>'Invalid delivery address' then raise; end if; end;
end $$;
reset role;
do $$ begin
 if (select reserved from public.inventory where product_id='20000000-0000-4000-8000-000000000003' and market='PH')<>2 then raise exception 'FAIL: reservations after retries or failed transaction'; end if;
end $$;
update public.inventory_reservations set expires_at=now()-interval '1 minute' where product_id='20000000-0000-4000-8000-000000000003';
select public.release_expired_reservations();
do $$ begin
 if (select reserved from public.inventory where product_id='20000000-0000-4000-8000-000000000003' and market='PH')<>0 then raise exception 'FAIL: expired reservation not released'; end if;
 if (select count(*) from public.orders where user_id='20000000-0000-4000-8000-000000000001' and status='cancelled')<>1 then raise exception 'FAIL: expired order not cancelled'; end if;
end $$;
rollback;
select 'PASS: authoritative pricing, atomic stock reservation, idempotency replay/conflict, duplicate prevention, quantity limit, invalid address rollback, reservation expiry; fixtures and approval flags rolled back' as result;
