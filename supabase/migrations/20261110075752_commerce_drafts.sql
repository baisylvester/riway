-- Staff-only planning records. Nothing in checkout or the public catalogue reads
-- these definitions; draft/review do not authorize a price, discount or sale.
create table private.commerce_drafts (
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('package','promotion')),
 market text not null references public.markets(code),
 name text not null check(length(name) between 2 and 120),
 status text not null check(status in ('draft','review','archived')),
 definition jsonb not null check(jsonb_typeof(definition)='object' and octet_length(definition::text)<=16384),
 revision integer not null default 1 check(revision>=1),
 created_by uuid not null references public.app_users(id),
 updated_by uuid not null references public.app_users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index commerce_drafts_market_kind_idx on private.commerce_drafts(market,kind,updated_at desc,id);
create index commerce_drafts_created_by_idx on private.commerce_drafts(created_by);
create index commerce_drafts_updated_by_idx on private.commerce_drafts(updated_by);
alter table private.commerce_drafts enable row level security;
revoke all on private.commerce_drafts from public,anon,authenticated,service_role;
create policy commerce_drafts_internal_only on private.commerce_drafts for all to anon,authenticated using(false) with check(false);

create function private.commerce_draft_integer(v jsonb,minimum numeric,maximum numeric,nullable boolean default false)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare value numeric; begin
 if nullable and v='null'::jsonb then return true; end if;
 if v is null or jsonb_typeof(v) is distinct from 'number' then return false; end if;
 value:=(v#>>'{}')::numeric;
 return value=trunc(value) and value between minimum and maximum;
end $$;

create function private.validate_commerce_draft(k text,d jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare item jsonb; pid uuid; seen uuid[]:=array[]::uuid[];
 keys text[]; start_time timestamptz; end_time timestamptz;
 date_pattern text:='^(19[0-9]{2}|20[0-9]{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]{1,3})?Z$';
begin
 if k is null or k not in ('package','promotion') or d is null
 or jsonb_typeof(d) is distinct from 'object' or octet_length(d::text)>16384 then
  raise exception 'Invalid commerce draft definition';
 end if;
 if k='package' then
  keys:=array['components','retailMinor','memberMinor'];
  if not(d ?& keys) or d-keys<>'{}'::jsonb
  or jsonb_typeof(d->'components') is distinct from 'array' then
   raise exception 'Invalid package definition';
  end if;
  if jsonb_array_length(d->'components') not between 1 and 30
  or not private.commerce_draft_integer(d->'retailMinor',1,100000000,true)
  or not private.commerce_draft_integer(d->'memberMinor',1,100000000,true) then
   raise exception 'Invalid package definition';
  end if;
  for item in select value from jsonb_array_elements(d->'components') loop
   if jsonb_typeof(item) is distinct from 'object' then raise exception 'Invalid package component'; end if;
   if not(item ?& array['productId','quantity']) or item-array['productId','quantity']<>'{}'::jsonb
   or jsonb_typeof(item->'productId') is distinct from 'string'
   or item->>'productId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or not private.commerce_draft_integer(item->'quantity',1,1000) then
    raise exception 'Invalid package component';
   end if;
   pid:=(item->>'productId')::uuid;
   if pid=any(seen) or not exists(select 1 from public.products p where p.id=pid and p.status<>'archived' and p.category<>'Packages') then
    raise exception 'Package components must be distinct existing non-archived products, without nested packages';
   end if;
   seen:=array_append(seen,pid);
  end loop;
 else
  keys:=array['productIds','discountType','discountValue','minimumSubtotalMinor','maximumDiscountMinor','voucherCode','startsAt','endsAt','audience','usageLimit'];
  if not(d ?& keys) or d-keys<>'{}'::jsonb
  or jsonb_typeof(d->'productIds') is distinct from 'array'
  or jsonb_typeof(d->'discountType') is distinct from 'string'
  or d->>'discountType' not in ('percent','fixed')
  or jsonb_typeof(d->'audience') is distinct from 'string'
  or d->>'audience' not in ('all','retail','member') then
   raise exception 'Invalid promotion definition';
  end if;
  if jsonb_array_length(d->'productIds') not between 1 and 30
  or not private.commerce_draft_integer(d->'discountValue',1,case when d->>'discountType'='percent' then 10000 else 100000000 end)
  or not private.commerce_draft_integer(d->'minimumSubtotalMinor',0,100000000)
  or not private.commerce_draft_integer(d->'maximumDiscountMinor',1,100000000,true)
  or (d->>'discountType'='fixed' and d->'maximumDiscountMinor'<>'null'::jsonb)
  or not private.commerce_draft_integer(d->'usageLimit',1,1000000,true) then
   raise exception 'Invalid promotion amounts or limits';
  end if;
  if d->'voucherCode'<>'null'::jsonb and
   (jsonb_typeof(d->'voucherCode') is distinct from 'string' or d->>'voucherCode' !~ '^[A-Z0-9-]{3,40}$') then
   raise exception 'Invalid promotion voucher code';
  end if;
  if jsonb_typeof(d->'startsAt') is distinct from 'string' or jsonb_typeof(d->'endsAt') is distinct from 'string'
  or d->>'startsAt' !~ date_pattern or d->>'endsAt' !~ date_pattern then
   raise exception 'Invalid promotion UTC window';
  end if;
  begin
   start_time:=(d->>'startsAt')::timestamptz;
   end_time:=(d->>'endsAt')::timestamptz;
  exception when datetime_field_overflow or invalid_datetime_format then
   raise exception 'Invalid promotion UTC window';
  end;
  if start_time>=end_time then raise exception 'Promotion end must follow its start'; end if;
  for item in select value from jsonb_array_elements(d->'productIds') loop
   if jsonb_typeof(item) is distinct from 'string' or item#>>'{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Invalid promotion product';
   end if;
   pid:=(item#>>'{}')::uuid;
   if pid=any(seen) or not exists(select 1 from public.products p where p.id=pid and p.status<>'archived') then
    raise exception 'Promotion targets must be distinct existing non-archived products';
   end if;
   seen:=array_append(seen,pid);
  end loop;
 end if;
end $$;

create function private.commerce_draft_json(r private.commerce_drafts) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',r.id,'kind',r.kind,'market',r.market,
  'currency',case r.market when 'PH' then 'PHP' when 'SG' then 'SGD' when 'MY' then 'MYR' end,
  'name',r.name,'status',r.status,'definition',r.definition,'revision',r.revision,
  'createdBy',r.created_by,'updatedBy',r.updated_by,'createdAt',r.created_at,'updatedAt',r.updated_at);
$$;

create function private.staff_commerce_drafts(k text,page integer default 1) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare allowed text[]; drafts jsonb; more boolean; begin
 if k is null or k not in ('package','promotion') or page is null or page not between 1 and 1000 then
  raise exception 'Invalid commerce draft list request';
 end if;
 select array_agg(code order by array_position(array['PH','SG','MY'],code)) into allowed
 from public.markets where private.has_role(code,array['admin','compliance']);
 if coalesce(cardinality(allowed),0)=0 then raise exception 'Commerce draft access denied' using errcode='42501'; end if;
 select coalesce(jsonb_agg(private.commerce_draft_json(rows.item) order by (rows.item).updated_at desc,(rows.item).id),'[]'::jsonb)
 into drafts from (
  select c as item from private.commerce_drafts c where c.kind=k and c.market=any(allowed)
  order by c.updated_at desc,c.id limit 50 offset ((page-1)*50)
 ) rows;
 select exists(select 1 from private.commerce_drafts c where c.kind=k and c.market=any(allowed)
  order by c.updated_at desc,c.id limit 1 offset (page*50)) into more;
 return jsonb_build_object('drafts',drafts,'markets',allowed,'hasMore',more,'page',page);
end $$;

create function private.save_commerce_draft(draft_id uuid,k text,m text,n text,s text,d jsonb,expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.app_user_id(); stored private.commerce_drafts; cleaned_name text:=btrim(n,E' \t\n\r');
begin
 if m is null or m not in ('PH','SG','MY') or not private.has_role(m,array['admin','compliance']) then
  raise exception 'Commerce draft access denied' using errcode='42501';
 end if;
 if k is null or k not in ('package','promotion') or cleaned_name is null or length(cleaned_name) not between 2 and 120
 or s is null or s not in ('draft','review','archived') or expected_revision is null
 or expected_revision<0 or expected_revision>=2147483647 then raise exception 'Invalid commerce draft fields'; end if;
 perform private.validate_commerce_draft(k,d);
 if draft_id is null then
  if expected_revision<>0 then raise exception 'New commerce drafts require revision zero'; end if;
  insert into private.commerce_drafts(kind,market,name,status,definition,created_by,updated_by)
  values(k,m,cleaned_name,s,d,actor,actor) returning * into stored;
 else
  select * into stored from private.commerce_drafts c where c.id=draft_id for update;
  if not found or not private.has_role(stored.market,array['admin','compliance']) then raise exception 'Commerce draft access denied' using errcode='42501'; end if;
  if stored.kind<>k or stored.market<>m then raise exception 'Commerce draft kind and market cannot be changed'; end if;
  if stored.revision<>expected_revision then raise exception 'Commerce draft changed. Reload before saving.' using errcode='40001'; end if;
  update private.commerce_drafts c set name=cleaned_name,status=s,definition=d,
   revision=c.revision+1,updated_by=actor,updated_at=clock_timestamp()
  where c.id=draft_id returning * into stored;
 end if;
 insert into public.audit_logs(actor_id,action,entity,entity_id)
 values(actor,format('DRAFT_%s:%s:%s:%s',case when draft_id is null then 'CREATE' else 'UPDATE' end,k,m,stored.revision),'commerce_drafts',stored.id::text);
 return private.commerce_draft_json(stored);
end $$;

create function public.staff_commerce_drafts(k text,page integer default 1) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.staff_commerce_drafts(k,page); $$;
create function public.save_commerce_draft(draft_id uuid,k text,m text,n text,s text,d jsonb,expected_revision integer) returns jsonb
language sql security invoker set search_path='' as $$ select private.save_commerce_draft(draft_id,k,m,n,s,d,expected_revision); $$;

revoke all on function private.commerce_draft_integer(jsonb,numeric,numeric,boolean),private.validate_commerce_draft(text,jsonb),private.commerce_draft_json(private.commerce_drafts),
 private.staff_commerce_drafts(text,integer),private.save_commerce_draft(uuid,text,text,text,text,jsonb,integer),
 public.staff_commerce_drafts(text,integer),public.save_commerce_draft(uuid,text,text,text,text,jsonb,integer) from public,anon,authenticated,service_role;
grant execute on function private.staff_commerce_drafts(text,integer),private.save_commerce_draft(uuid,text,text,text,text,jsonb,integer),
 public.staff_commerce_drafts(text,integer),public.save_commerce_draft(uuid,text,text,text,text,jsonb,integer) to authenticated;
