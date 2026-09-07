begin;

-- Branding is changed through a forward migration so already-created databases receive it too.
update subscription_plans set display_name = case code
  when 'essentials' then 'Apex Ledger Essentials'
  when 'accounting' then 'Apex Ledger Accounting'
  when 'accounting_payroll' then 'Apex Ledger Accounting + Payroll'
  else display_name end,
  updated_at = now();

alter table firm_subscriptions drop constraint if exists firm_subscriptions_status_check;
alter table firm_subscriptions add constraint firm_subscriptions_status_check
  check (status in ('trialing','active','past_due','suspended','canceled'));

create table email_mfa_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id),
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts between 0 and 5),
  consumed_at timestamptz,
  requested_at timestamptz not null default now()
);
create index email_mfa_challenges_user_idx on email_mfa_challenges(user_id, requested_at desc);

create table platform_staff (
  user_id uuid primary key references app_users(id),
  role text not null check (role in ('platform_admin','customer_support')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table platform_subscription_actions (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null references app_users(id),
  firm_id uuid not null references firms(id),
  action text not null check (action in ('renew','suspend','reactivate','mark_past_due','cancel','change_plan')),
  reason text not null,
  before_state jsonb not null,
  after_state jsonb not null,
  occurred_at timestamptz not null default now()
);
create index platform_subscription_actions_firm_idx on platform_subscription_actions(firm_id, occurred_at desc);

create or replace function prevent_platform_action_mutation() returns trigger language plpgsql as $$
begin raise exception 'platform subscription actions are append-only'; end; $$;
create trigger platform_subscription_actions_immutable before update or delete on platform_subscription_actions
for each row execute function prevent_platform_action_mutation();

alter table email_mfa_challenges enable row level security;
alter table email_mfa_challenges force row level security;
alter table platform_staff enable row level security;
alter table platform_staff force row level security;
alter table platform_subscription_actions enable row level security;
alter table platform_subscription_actions force row level security;

create or replace function create_email_mfa_challenge(p_code_hash text, p_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path=public set row_security=off as $$
declare actor uuid := nullif(current_setting('app.user_id',true),'')::uuid; challenge_id uuid;
begin
  if actor is null then raise exception 'authentication required'; end if;
  if p_code_hash !~ '^[0-9a-f]{64}$' or p_expires_at <= now() or p_expires_at > now()+interval '15 minutes' then raise exception 'invalid mfa challenge'; end if;
  if exists(select 1 from email_mfa_challenges where user_id=actor and requested_at>now()-interval '60 seconds') then raise exception 'mfa challenge rate limited'; end if;
  update email_mfa_challenges set consumed_at=now() where user_id=actor and consumed_at is null;
  insert into email_mfa_challenges(user_id,code_hash,expires_at) values(actor,p_code_hash,p_expires_at) returning id into challenge_id;
  return challenge_id;
end $$;

create or replace function consume_email_mfa_challenge(p_challenge_id uuid,p_code_hash text)
returns boolean language plpgsql security definer set search_path=public set row_security=off as $$
declare actor uuid := nullif(current_setting('app.user_id',true),'')::uuid; accepted boolean;
begin
  update email_mfa_challenges set attempts=attempts+1,
    consumed_at=case when code_hash=p_code_hash then now() else consumed_at end
  where id=p_challenge_id and user_id=actor and consumed_at is null and expires_at>now() and attempts<5
  returning consumed_at is not null into accepted;
  return coalesce(accepted,false);
end $$;

create or replace function current_user_platform_role() returns text language sql stable security definer
set search_path=public set row_security=off as $$
  select role from platform_staff where user_id=nullif(current_setting('app.user_id',true),'')::uuid and active=true
$$;

create or replace function platform_list_subscriptions()
returns table(firm_id uuid,firm_name text,plan_code text,plan_name text,status text,seat_limit integer,current_period_end timestamptz,version bigint)
language plpgsql security definer set search_path=public set row_security=off as $$
begin
  if current_user_platform_role() is null then raise exception 'platform access denied'; end if;
  return query select f.id,f.name,fs.plan_code,sp.display_name,fs.status,f.seat_limit,fs.current_period_end,fs.version
    from firms f join firm_subscriptions fs on fs.firm_id=f.id join subscription_plans sp on sp.code=fs.plan_code order by f.name;
end $$;

create or replace function platform_manage_subscription(p_firm_id uuid,p_plan_code text,p_status text,p_period_end timestamptz,p_action text,p_reason text)
returns void language plpgsql security definer set search_path=public set row_security=off as $$
declare actor uuid:=nullif(current_setting('app.user_id',true),'')::uuid; staff_role text:=current_user_platform_role(); previous firm_subscriptions%rowtype; next_state jsonb;
begin
  if staff_role is null then raise exception 'platform access denied'; end if;
  if p_status not in ('trialing','active','past_due','suspended','canceled') or p_action not in ('renew','suspend','reactivate','mark_past_due','cancel','change_plan') then raise exception 'invalid subscription action'; end if;
  if p_plan_code not in ('essentials','accounting','accounting_payroll') then raise exception 'invalid subscription plan'; end if;
  if staff_role='customer_support' and (p_action in ('cancel','change_plan') or p_plan_code<>(select plan_code from firm_subscriptions where firm_id=p_firm_id)) then raise exception 'administrator approval required'; end if;
  if length(trim(p_reason))<3 then raise exception 'reason required'; end if;
  select * into previous from firm_subscriptions where firm_id=p_firm_id for update;
  if not found then raise exception 'firm subscription not found'; end if;
  update firm_subscriptions set plan_code=p_plan_code,status=p_status,current_period_end=p_period_end,version=version+1,updated_at=now() where firm_id=p_firm_id;
  select to_jsonb(fs) into next_state from firm_subscriptions fs where fs.firm_id=p_firm_id;
  insert into platform_subscription_actions(actor_user_id,firm_id,action,reason,before_state,after_state)
    values(actor,p_firm_id,p_action,trim(p_reason),to_jsonb(previous),next_state);
  insert into subscription_events(firm_id,event_type,before_state,after_state)
    values(p_firm_id,'subscription.platform_'||p_action,to_jsonb(previous),next_state);
end $$;

revoke all on email_mfa_challenges,platform_staff,platform_subscription_actions from public,northledger_app;
revoke all on function create_email_mfa_challenge(text,timestamptz),consume_email_mfa_challenge(uuid,text),current_user_platform_role(),platform_list_subscriptions(),platform_manage_subscription(uuid,text,text,timestamptz,text,text) from public;
grant execute on function create_email_mfa_challenge(text,timestamptz),consume_email_mfa_challenge(uuid,text),current_user_platform_role(),platform_list_subscriptions(),platform_manage_subscription(uuid,text,text,timestamptz,text,text) to northledger_app;

commit;
