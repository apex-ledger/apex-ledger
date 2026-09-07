begin;

create table subscription_plans (
  code text primary key check (code in ('accounting', 'accounting_payroll')),
  display_name text not null,
  includes_payroll boolean not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into subscription_plans(code, display_name, includes_payroll) values
  ('accounting', 'North Ledger Accounting', false),
  ('accounting_payroll', 'North Ledger Accounting + Payroll', true);

create table firm_subscriptions (
  firm_id uuid primary key references firms(id),
  plan_code text not null references subscription_plans(code),
  status text not null check (status in ('trialing', 'active', 'past_due', 'canceled')),
  has_payroll_history boolean not null default false,
  billing_customer_reference text,
  billing_subscription_reference text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table subscription_events (
  id bigint generated always as identity primary key,
  firm_id uuid not null references firms(id),
  event_type text not null,
  provider_event_id text unique,
  before_state jsonb,
  after_state jsonb not null,
  occurred_at timestamptz not null default now()
);
create index subscription_events_firm_time_idx on subscription_events(firm_id, occurred_at desc);

insert into firm_subscriptions(firm_id, plan_code, status)
select id, 'accounting', 'trialing' from firms
on conflict (firm_id) do nothing;

create or replace function provision_default_firm_subscription() returns trigger
language plpgsql as $$
begin
  insert into firm_subscriptions(firm_id, plan_code, status)
  values (new.id, 'accounting', 'trialing');
  return new;
end;
$$;
create trigger firms_default_subscription
after insert on firms
for each row execute function provision_default_firm_subscription();

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
  if p_plan_code not in ('accounting', 'accounting_payroll') then raise exception 'invalid subscription plan'; end if;
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

create or replace function prevent_subscription_event_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'subscription events are append-only';
end;
$$;
create trigger subscription_events_immutable
before update or delete on subscription_events
for each row execute function prevent_subscription_event_mutation();

alter table firm_subscriptions enable row level security;
alter table firm_subscriptions force row level security;
alter table subscription_events enable row level security;
alter table subscription_events force row level security;

create policy firm_subscription_member_select on firm_subscriptions for select
using (current_user_firm_role(firm_id) is not null);
create policy subscription_event_admin_select on subscription_events for select
using (current_user_firm_role(firm_id) in ('owner', 'firm_admin'));

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'northledger_billing') then
    create role northledger_billing nologin nosuperuser nocreatedb nocreaterole noinherit;
  end if;
end;
$$;

grant select on subscription_plans to northledger_app;
grant select on firm_subscriptions to northledger_app;
grant select on subscription_events to northledger_app;
revoke all on function set_firm_subscription(uuid, text, text, text, text, text, timestamptz, timestamptz) from public;
grant execute on function set_firm_subscription(uuid, text, text, text, text, text, timestamptz, timestamptz) to northledger_billing;

commit;
