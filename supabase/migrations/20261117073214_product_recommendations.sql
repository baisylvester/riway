-- Cross-sell v1. Product staff curate up to four "pairs well with" products for
-- each product; nothing is recommended automatically. Rows are readable only
-- when both products are readable under products RLS (published for the
-- public), and are written only through set_product_recommendations, which
-- replaces a product's list atomically and records an audit entry. Upsell to
-- approved packages uses the existing package compositions and needs no table.
create table public.product_recommendations (
 product_id uuid not null references public.products(id) on delete cascade,
 recommended_id uuid not null references public.products(id) on delete cascade,
 position smallint not null check(position between 0 and 3),
 created_by uuid references public.app_users(id),
 created_at timestamptz not null default clock_timestamp(),
 primary key(product_id,recommended_id),
 unique(product_id,position),
 check(product_id<>recommended_id)
);
create index product_recommendations_recommended_idx on public.product_recommendations(recommended_id);
create index product_recommendations_creator_idx on public.product_recommendations(created_by);
alter table public.product_recommendations enable row level security;
revoke all on public.product_recommendations from public,anon,authenticated,service_role;
grant select on public.product_recommendations to anon,authenticated;
create policy product_recommendations_read on public.product_recommendations for select to anon,authenticated
 using(exists(select 1 from public.products p where p.id=product_id) and exists(select 1 from public.products p where p.id=recommended_id));

create function private.set_product_recommendations(p_product uuid,p_recommended uuid[]) returns uuid[]
language plpgsql security definer set search_path='' as $$
declare picks uuid[]:=coalesce(p_recommended,'{}'); i integer; begin
 if not private.has_role(null,array['admin','editor','compliance']) then
  raise exception 'Product recommendation access denied' using errcode='42501';
 end if;
 if not exists(select 1 from public.products where id=p_product) then raise exception 'Product not found'; end if;
 if cardinality(picks)>4 then raise exception 'Choose up to four recommended products'; end if;
 if array_position(picks,null) is not null or (select count(distinct x) from unnest(picks) x)<>cardinality(picks) then
  raise exception 'Each recommended product can be chosen once';
 end if;
 if p_product=any(picks) then raise exception 'A product cannot recommend itself'; end if;
 if (select count(*) from public.products where id=any(picks))<>cardinality(picks) then raise exception 'Recommended product not found'; end if;
 -- Serialise edits of one product's list.
 perform 1 from public.products where id=p_product for update;
 delete from public.product_recommendations where product_id=p_product;
 for i in 1..cardinality(picks) loop
  insert into public.product_recommendations(product_id,recommended_id,position,created_by)
  values(p_product,picks[i],i-1,private.app_user_id());
 end loop;
 insert into public.audit_logs(actor_id,action,entity,entity_id)
 values(private.app_user_id(),'PRODUCT_RECOMMENDATIONS:'||cardinality(picks),'products',p_product::text);
 return picks;
end $$;
create function public.set_product_recommendations(p_product uuid,p_recommended uuid[]) returns uuid[]
language sql security invoker set search_path='' as $$ select private.set_product_recommendations(p_product,p_recommended); $$;

revoke all on function private.set_product_recommendations(uuid,uuid[]),public.set_product_recommendations(uuid,uuid[])
 from public,anon,authenticated,service_role;
grant execute on function private.set_product_recommendations(uuid,uuid[]),public.set_product_recommendations(uuid,uuid[]) to authenticated;
