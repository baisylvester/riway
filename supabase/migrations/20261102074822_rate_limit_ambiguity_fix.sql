create or replace function private.check_rate(scope text,max_hits integer,seconds integer) returns void language plpgsql security definer set search_path='' as $$
declare h integer; begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 insert into private.rate_limits(user_id,scope,window_start,hits) values(auth.uid(),$1,now(),1)
 on conflict on constraint rate_limits_pkey do update set
 hits=case when private.rate_limits.window_start<now()-make_interval(secs=>$3) then 1 else private.rate_limits.hits+1 end,
 window_start=case when private.rate_limits.window_start<now()-make_interval(secs=>$3) then now() else private.rate_limits.window_start end returning hits into h;
 if h>$2 then raise exception 'Too many requests. Please try later.'; end if;
end $$;
