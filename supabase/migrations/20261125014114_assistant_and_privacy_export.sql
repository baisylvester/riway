-- Optional B: opt-in approved reference corpus, metered by account. Staff must
-- explicitly author assistant-* CMS pages; arbitrary site text is not a corpus.
create function private.assistant_sources(p_market text,p_locale text) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 if private.app_user_id() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_market is null or p_market not in ('PH','SG','MY') or p_locale is null or p_locale !~ '^[a-z]{2}(-[A-Z]{2})?$' then raise exception 'Invalid market or language' using errcode='22023'; end if;
 perform private.check_rate('assistant',12,60);
 return coalesce((select jsonb_agg(to_jsonb(t)) from (
  select id::text as id,title,body as text,'/reference/'||id::text as url,approved_at as "approvedAt"
  from public.content_entries where kind='page' and slug like 'assistant-%' and status='published'
   and (market=p_market or market is null) and locale=p_locale and approved_at is not null
   and (publish_at is null or publish_at<=now()) and (unpublish_at is null or unpublish_at>now())
  order by slug limit 100
 ) t),'[]'::jsonb);
end $$;
create function private.assistant_voice_rate() returns void language plpgsql security definer set search_path='' as $$ begin
 if private.app_user_id() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform private.check_rate('assistant_voice',4,60);
end $$;
create function public.assistant_sources(p_market text,p_locale text) returns jsonb language sql security invoker set search_path='' as $$ select private.assistant_sources(p_market,p_locale) $$;
create function public.assistant_voice_rate() returns void language sql security invoker set search_path='' as $$ select private.assistant_voice_rate() $$;

-- Self-service export never accepts a subject/user ID. Each array is projected
-- explicitly to avoid exporting staff identities, private notes or provider keys.
-- Transaction/audit records are preserved. Formal case completion remains a
-- separate verified staff process under PRIVACY-REQUESTS.md.
create function private.export_my_data() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.app_user_id(); result jsonb; begin
 if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform private.check_rate('privacy_export',3,3600);
 select jsonb_build_object('formatVersion',1,'generatedAt',clock_timestamp(),'subjectId',actor,
 'profile',(select to_jsonb(p)-'id' from public.profiles p where id=actor),
 'addresses',coalesce((select jsonb_agg(to_jsonb(a)-'user_id') from public.addresses a where user_id=actor),'[]'::jsonb),
 'savedBag',(select items from public.carts where user_id=actor),
 'membership',(select jsonb_build_object('externalMemberId',external_member_id,'tier',tier,'status',status,'syncedAt',synced_at) from public.memberships where user_id=actor),
 'orders',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'market',o.market,'currency',o.currency,'totalMinor',o.total_minor,'status',o.status,'paymentStatus',o.payment_status,'address',o.address,'termsVersion',o.terms_version,'createdAt',o.created_at,
  'items',coalesce((select jsonb_agg(jsonb_build_object('productId',product_id,'name',product_name,'quantity',quantity,'unitMinor',unit_minor)) from public.order_items where order_id=o.id),'[]'::jsonb))) from public.orders o where user_id=actor),'[]'::jsonb),
 'enrolments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'orderId',order_id,'market',market,'quantity',quantity,'packageRule',rule_snapshot,'consent',consent,'consentedAt',consented_at,'status',status,'externalMemberId',external_member_id)) from private.membership_enrollments where user_id=actor),'[]'::jsonb),
 'supportRequests',coalesce((select jsonb_agg(jsonb_build_object('id',id,'market',market,'subject',subject,'message',message,'status',status,'createdAt',created_at)) from public.support_tickets where user_id=actor),'[]'::jsonb),
 'eventRegistrations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'eventId',event_id,'status',status,'createdAt',created_at,'checkedInAt',checked_in_at)) from public.event_registrations where user_id=actor),'[]'::jsonb),
 'consultations',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'status',b.status,'timezone',b.timezone,'startsAt',s.starts_at,'endsAt',s.ends_at,'createdAt',b.created_at)) from private.consultation_bookings b join private.consultation_slots s on s.id=b.slot_id where b.user_id=actor or b.distributor_id=actor),'[]'::jsonb),
 'privacyRequests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'market',r.market,'kind',r.kind,'details',r.details,'status',r.status,'createdAt',r.created_at,'messages',coalesce((select jsonb_agg(jsonb_build_object('byStaff',by_staff,'status',status,'message',message,'createdAt',created_at)) from private.privacy_request_events where request_id=r.id),'[]'::jsonb))) from private.privacy_requests r where user_id=actor),'[]'::jsonb)
 ) into result;
 insert into public.audit_logs(actor_id,action,entity,entity_id) values(actor,'PRIVACY_SELF_EXPORT','app_users',actor::text);
 return result;
end $$;
create function public.export_my_data() returns jsonb language sql security invoker set search_path='' as $$ select private.export_my_data() $$;
revoke all on function private.assistant_sources(text,text),public.assistant_sources(text,text),private.assistant_voice_rate(),public.assistant_voice_rate(),private.export_my_data(),public.export_my_data() from public,anon,authenticated,service_role;
grant execute on function private.assistant_sources(text,text),public.assistant_sources(text,text),private.assistant_voice_rate(),public.assistant_voice_rate(),private.export_my_data(),public.export_my_data() to authenticated;
