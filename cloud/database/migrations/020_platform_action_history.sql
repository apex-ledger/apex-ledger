begin;

create or replace function platform_list_subscription_actions(p_limit integer default 100)
returns table(id bigint,firm_id uuid,firm_name text,actor_name text,actor_email text,action text,reason text,created_at timestamptz)
language plpgsql security definer set search_path=public set row_security=off as $$
begin
  if current_user_platform_role() is null then raise exception 'platform access denied'; end if;
  return query
    select psa.id,psa.firm_id,f.name,coalesce(u.display_name,'Platform staff'),coalesce(u.email,''),psa.action,psa.reason,psa.occurred_at
    from platform_subscription_actions psa
    join firms f on f.id=psa.firm_id
    join app_users u on u.id=psa.actor_user_id
    order by psa.occurred_at desc,psa.id desc
    limit greatest(1,least(coalesce(p_limit,100),500));
end $$;

revoke all on function platform_list_subscription_actions(integer) from public;
grant execute on function platform_list_subscription_actions(integer) to northledger_app;

commit;
