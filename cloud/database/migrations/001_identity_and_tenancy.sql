begin;

create extension if not exists pgcrypto;

create table app_users (
  id uuid primary key default gen_random_uuid(),
  entra_object_id text not null unique,
  subject text not null,
  email text,
  display_name text,
  status text not null default 'active' check (status in ('active', 'suspended')),
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table firms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  seat_limit integer not null default 2 check (seat_limit > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table firm_memberships (
  firm_id uuid not null references firms(id),
  user_id uuid not null references app_users(id),
  role text not null check (role in ('owner', 'firm_admin', 'accountant', 'bookkeeper', 'payroll', 'viewer')),
  status text not null default 'active' check (status in ('invited', 'active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (firm_id, user_id)
);
create index firm_memberships_user_idx on firm_memberships(user_id, status);

create or replace function enforce_firm_seat_limit() returns trigger
language plpgsql as $$
declare
  allowed_seats integer;
  occupied_seats integer;
begin
  if new.status not in ('invited', 'active') then return new; end if;
  select seat_limit into allowed_seats from firms where id = new.firm_id for update;
  select count(*) into occupied_seats
  from firm_memberships
  where firm_id = new.firm_id
    and status in ('invited', 'active')
    and user_id <> new.user_id;
  if occupied_seats >= allowed_seats then
    raise exception 'firm seat limit reached' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger firm_membership_seat_limit
before insert or update of firm_id, user_id, status on firm_memberships
for each row execute function enforce_firm_seat_limit();

create table companies (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id),
  legal_name text not null,
  operating_name text,
  version bigint not null default 1,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (firm_id, legal_name)
);
create index companies_firm_idx on companies(firm_id) where archived_at is null;

create table audit_events (
  id bigint generated always as identity primary key,
  firm_id uuid not null references firms(id),
  company_id uuid references companies(id),
  actor_user_id uuid references app_users(id),
  request_id text,
  event_type text not null,
  entity_type text not null,
  entity_id text not null,
  before_state jsonb,
  after_state jsonb,
  occurred_at timestamptz not null default now()
);
create index audit_events_firm_time_idx on audit_events(firm_id, occurred_at desc);

create table idempotency_keys (
  firm_id uuid not null references firms(id),
  key text not null,
  request_hash text not null,
  response_status integer,
  response_body jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (firm_id, key)
);

create table realtime_outbox (
  id bigint generated always as identity primary key,
  firm_id uuid not null references firms(id),
  company_id uuid references companies(id),
  topic text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index realtime_outbox_pending_idx on realtime_outbox(id) where delivered_at is null;

create or replace function prevent_audit_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'audit events are append-only';
end;
$$;
create trigger audit_events_immutable
before update or delete on audit_events
for each row execute function prevent_audit_mutation();

alter table firm_memberships enable row level security;
alter table companies enable row level security;
alter table audit_events enable row level security;
alter table idempotency_keys enable row level security;
alter table realtime_outbox enable row level security;
alter table firm_memberships force row level security;
alter table companies force row level security;
alter table audit_events force row level security;
alter table idempotency_keys force row level security;
alter table realtime_outbox force row level security;

create policy membership_self_select on firm_memberships for select
using (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

create policy company_firm_isolation on companies
using (firm_id = nullif(current_setting('app.firm_id', true), '')::uuid)
with check (firm_id = nullif(current_setting('app.firm_id', true), '')::uuid);

create policy audit_firm_isolation on audit_events
using (firm_id = nullif(current_setting('app.firm_id', true), '')::uuid)
with check (firm_id = nullif(current_setting('app.firm_id', true), '')::uuid);

create policy idempotency_firm_isolation on idempotency_keys
using (firm_id = nullif(current_setting('app.firm_id', true), '')::uuid)
with check (firm_id = nullif(current_setting('app.firm_id', true), '')::uuid);

create policy outbox_firm_isolation on realtime_outbox
using (firm_id = nullif(current_setting('app.firm_id', true), '')::uuid)
with check (firm_id = nullif(current_setting('app.firm_id', true), '')::uuid);

commit;
