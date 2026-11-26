-- Reuse the existing export's ownership, rate and audit checks for every
-- download. Explicit projections exclude internal reviews and sponsor IDs.
alter function private.export_my_data() rename to export_my_data_without_replenishment;
revoke all on function private.export_my_data_without_replenishment() from public,anon,authenticated,service_role;

create function private.export_my_data()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 document jsonb:=private.export_my_data_without_replenishment();
 actor uuid:=private.app_user_id();
 records jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',s.id,'market',s.market,'productId',s.product_id,'sourceOrderId',s.source_order_id,
  'quantity',s.quantity,'state',s.state,'nextDueAt',s.next_due_at,'consentedAt',s.consented_at,
  'termsVersion',r.terms_version,'termsText',r.terms_text,'intervalDays',r.interval_days,
  'renewals',coalesce((select jsonb_agg(jsonb_build_object(
   'orderId',t.order_id,'cycle',t.cycle,'createdAt',t.created_at
  ) order by t.created_at,t.order_id) from private.replenishment_orders t
   join public.orders o on o.id=t.order_id where t.schedule_id=s.id and o.user_id=actor),'[]'::jsonb)
 ) order by s.consented_at,s.id),'[]'::jsonb)
 into records from private.replenishment_schedules s join private.replenishment_rules r on r.id=s.rule_id
 where s.user_id=actor;
 return document||jsonb_build_object('replenishmentSchedules',records);
end $$;

create or replace function public.export_my_data() returns jsonb
language sql security invoker set search_path='' as $$select private.export_my_data()$$;
revoke all on function private.export_my_data(),public.export_my_data() from public,anon,authenticated,service_role;
grant execute on function private.export_my_data(),public.export_my_data() to authenticated;
