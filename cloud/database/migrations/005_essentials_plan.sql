begin;

alter table firms
add column workspace_type text not null default 'cpa_firm'
check (workspace_type in ('cpa_firm', 'business'));

alter table subscription_plans drop constraint subscription_plans_code_check;
alter table subscription_plans add constraint subscription_plans_code_check
check (code in ('essentials', 'accounting', 'accounting_payroll'));

insert into subscription_plans(code, display_name, includes_payroll)
values ('essentials', 'North Ledger Essentials', false);

create or replace function provision_default_firm_subscription() returns trigger
language plpgsql as $$
begin
  insert into firm_subscriptions(firm_id, plan_code, status)
  values (new.id, case when new.workspace_type = 'business' then 'essentials' else 'accounting' end, 'trialing');
  return new;
end;
$$;

create or replace function set_firm_subscription(
  p_firm_id uuid,
  p_plan_code text,
  p_status text,
  p_provider_event_id text,
  p_customer_reference text,
  p_subscription_reference text,
  p_period_start timestamptz,
  p_period_end timestamptz
) returns void
language plpgsql security definer
set search_path = public
set row_security = off
as $$
declare
  previous firm_subscriptions%rowtype;
  next_state jsonb;
begin
  if p_plan_code not in ('essentials', 'accounting', 'accounting_payroll') then raise exception 'invalid subscription plan'; end if;
  if p_status not in ('trialing', 'active', 'past_due', 'canceled') then raise exception 'invalid subscription status'; end if;
  if p_provider_event_id is null or trim(p_provider_event_id) = '' then raise exception 'provider event id required'; end if;
  if exists (select 1 from subscription_events where provider_event_id = p_provider_event_id) then return; end if;

  select * into previous from firm_subscriptions where firm_id = p_firm_id for update;
  if not found then raise exception 'firm subscription not found'; end if;
  update firm_subscriptions
  set plan_code = p_plan_code,
      status = p_status,
      has_payroll_history = previous.has_payroll_history,
      billing_customer_reference = p_customer_reference,
      billing_subscription_reference = p_subscription_reference,
      current_period_start = p_period_start,
      current_period_end = p_period_end,
      version = version + 1,
      updated_at = now()
  where firm_id = p_firm_id;

  select to_jsonb(fs) into next_state from firm_subscriptions fs where fs.firm_id = p_firm_id;
  insert into subscription_events(firm_id, event_type, provider_event_id, before_state, after_state)
  values (p_firm_id, 'subscription.changed', p_provider_event_id, to_jsonb(previous), next_state);
end;
$$;

revoke all on function set_firm_subscription(uuid, text, text, text, text, text, timestamptz, timestamptz) from public;
grant execute on function set_firm_subscription(uuid, text, text, text, text, text, timestamptz, timestamptz) to northledger_billing;

commit;
