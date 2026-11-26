-- Locale support must not weaken publication/MFA/country isolation.
begin;
set local lock_timeout='5s';set local statement_timeout='45s';
do $$declare e uuid:=gen_random_uuid();c uuid:=gen_random_uuid();p uuid:=gen_random_uuid();begin
 insert into auth.users(id,email)values(e,'locale-editor-'||e||'@example.invalid'),(c,'locale-reviewer-'||c||'@example.invalid');
 insert into public.staff_roles(user_id,market,role)values(e,'PH','editor'),(c,'PH','compliance');
 insert into public.products(id,slug,name,category,status)values(p,'locale-qa-'||p,'Synthetic locale product','Nutrition','published');
 perform set_config('locale.editor',e::text,true);perform set_config('locale.reviewer',c::text,true);perform set_config('locale.product',p::text,true);
end $$;
set local role authenticated;
do $$declare affected integer;begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('locale.editor'),'role','authenticated','aal','aal2')::text,true);
 insert into public.product_market_content(product_id,market,locale,ingredients,status)values(current_setting('locale.product')::uuid,'PH','fil','Synthetic Filipino draft','review');
 begin update public.product_market_content set status='published',approval_reference='QA-LOCALE'where product_id=current_setting('locale.product')::uuid;raise exception 'FAIL: editor published translated claims';exception when raise_exception then if SQLERRM<>'Compliance approval required before publication'then raise;end if;end;
 begin insert into public.product_market_content(product_id,market,locale,status)values(current_setting('locale.product')::uuid,'SG','fil','draft');raise exception 'FAIL: cross-market translation write';exception when insufficient_privilege then null;end;
 begin insert into public.product_market_content(product_id,market,locale,status)values(current_setting('locale.product')::uuid,'PH','fil<script>','draft');raise exception 'FAIL: invalid locale';exception when check_violation then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('locale.reviewer'),'role','authenticated','aal','aal1')::text,true);
 begin update public.product_market_content set status='published',approval_reference='QA-LOCALE'where product_id=current_setting('locale.product')::uuid;get diagnostics affected=row_count;if affected<>0 then raise exception 'FAIL: translation published without MFA';end if;exception when insufficient_privilege then null;end;
end $$;
reset role;set local role anon;
do $$begin
 if exists(select 1 from public.product_market_content where product_id=current_setting('locale.product')::uuid)then raise exception 'FAIL: draft translation exposed';end if;
end $$;
reset role;set local role authenticated;
do $$begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('locale.reviewer'),'role','authenticated','aal','aal2')::text,true);
 if (public.search_library('PH','fil','','image',0,true)->'assets') is distinct from '[]'::jsonb then raise exception 'FAIL: three-letter library query';end if;
 begin perform public.search_library('PH','fil<script>','','image',0,true);raise exception 'FAIL: invalid library locale query';exception when invalid_parameter_value then null;end;
 begin perform public.search_library('SG','fil','','image',0,true);raise exception 'FAIL: cross-market translated library query';exception when insufficient_privilege then null;end;
 update public.product_market_content set status='published',approval_reference='QA-LOCALE'where product_id=current_setting('locale.product')::uuid and locale='fil';
 insert into public.product_market_content(product_id,market,locale,ingredients,status,approval_reference)values(current_setting('locale.product')::uuid,'PH','en','Synthetic independent English text','published','QA-ENGLISH');
 update public.product_market_content set ingredients='Synthetic updated Filipino text',approval_reference='QA-LOCALE-2'where product_id=current_setting('locale.product')::uuid and locale='fil';
end $$;
reset role;set local role anon;
do $$begin
 if(select count(*)from public.product_market_content where product_id=current_setting('locale.product')::uuid)<>2 then raise exception 'FAIL: independently approved locales not visible';end if;
 if(select ingredients from public.product_market_content where product_id=current_setting('locale.product')::uuid and locale='en')is distinct from 'Synthetic independent English text'then raise exception 'FAIL: translated edit overwrote original';end if;
end $$;
rollback;
