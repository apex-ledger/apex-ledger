begin;

create table accounts (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id),
  company_id uuid not null references companies(id),
  name text not null,
  internal_code text,
  account_type text not null check (account_type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  account_kind text not null,
  parent_account_id uuid,
  is_master boolean not null default false,
  active boolean not null default true,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, name),
  foreign key (company_id, parent_account_id) references accounts(company_id, id)
);
create unique index accounts_company_internal_code_idx
on accounts(company_id, internal_code) where internal_code is not null;
create index accounts_company_active_idx on accounts(company_id, active, account_type);

create table accounting_period_locks (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id),
  company_id uuid not null references companies(id),
  start_date date not null,
  end_date date not null,
  reason text not null,
  locked_by uuid not null references app_users(id),
  unlocked_at timestamptz,
  unlocked_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index accounting_period_locks_company_dates_idx
on accounting_period_locks(company_id, start_date, end_date) where unlocked_at is null;

create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id),
  company_id uuid not null references companies(id),
  transaction_date date not null,
  reference text,
  memo text not null,
  source text not null default 'manual',
  status text not null default 'draft' check (status in ('draft', 'posted', 'voided')),
  created_by uuid not null references app_users(id),
  posted_by uuid references app_users(id),
  posted_at timestamptz,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);
create index journal_entries_company_date_idx
on journal_entries(company_id, transaction_date, id) where status = 'posted';
create index journal_entries_firm_created_idx on journal_entries(firm_id, created_at desc);

create table journal_lines (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id),
  company_id uuid not null references companies(id),
  journal_entry_id uuid not null,
  line_order integer not null check (line_order >= 0),
  account_id uuid not null,
  description text,
  debit_cents bigint not null default 0 check (debit_cents >= 0),
  credit_cents bigint not null default 0 check (credit_cents >= 0),
  tax_code text,
  created_at timestamptz not null default now(),
  foreign key (company_id, journal_entry_id) references journal_entries(company_id, id) on delete cascade,
  foreign key (company_id, account_id) references accounts(company_id, id),
  unique (journal_entry_id, line_order),
  check ((debit_cents > 0 and credit_cents = 0) or (credit_cents > 0 and debit_cents = 0))
);
create index journal_lines_entry_idx on journal_lines(journal_entry_id, line_order);
create index journal_lines_account_idx on journal_lines(company_id, account_id);

create or replace function validate_journal_posting() returns trigger
language plpgsql security definer
set search_path = public
set row_security = off
as $$
declare
  actor_user uuid;
  actor_role text;
  active_plan text;
  active_status text;
  line_count integer;
  debit_total numeric;
  credit_total numeric;
begin
  if old.status <> 'draft' or new.status <> 'posted' then
    if old.status = 'posted' then raise exception 'posted journal entries are immutable'; end if;
    return new;
  end if;
  actor_user := nullif(current_setting('app.user_id', true), '')::uuid;
  select role into actor_role from firm_memberships
  where firm_id = new.firm_id and user_id = actor_user and status = 'active';
  select plan_code, status into active_plan, active_status
  from firm_subscriptions where firm_id = new.firm_id;
  if active_status not in ('trialing', 'active') then raise exception 'subscription is read-only'; end if;
  if actor_role not in ('owner', 'firm_admin', 'accountant', 'bookkeeper') then raise exception 'ledger posting permission required'; end if;
  if active_plan = 'essentials' and actor_role not in ('firm_admin', 'accountant') then
    raise exception 'Essentials adjustments require accountant access';
  end if;
  if exists (
    select 1 from accounting_period_locks
    where company_id = new.company_id and unlocked_at is null
      and new.transaction_date between start_date and end_date
  ) then raise exception 'accounting period is locked'; end if;
  select count(*), coalesce(sum(debit_cents), 0), coalesce(sum(credit_cents), 0)
  into line_count, debit_total, credit_total
  from journal_lines where journal_entry_id = new.id;
  if line_count < 2 then raise exception 'journal entry requires at least two lines'; end if;
  if debit_total <= 0 or debit_total <> credit_total then raise exception 'journal entry is not balanced'; end if;
  if exists (
    select 1 from journal_lines jl join accounts a on a.id = jl.account_id
    where jl.journal_entry_id = new.id and (not a.active or a.company_id <> new.company_id)
  ) then raise exception 'journal entry contains an unavailable account'; end if;
  new.posted_by := actor_user;
  new.posted_at := now();
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;
create trigger journal_posting_validation
before update of status on journal_entries
for each row execute function validate_journal_posting();

create or replace function prevent_posted_journal_entry_mutation() returns trigger
language plpgsql security definer
set search_path = public
set row_security = off
as $$
begin
  if old.status = 'posted' then raise exception 'posted journal entries are immutable'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger journal_entries_posted_immutable
before update or delete on journal_entries
for each row execute function prevent_posted_journal_entry_mutation();

create or replace function prevent_posted_journal_line_mutation() returns trigger
language plpgsql security definer
set search_path = public
set row_security = off
as $$
declare entry_status text;
begin
  select status into entry_status from journal_entries
  where id = coalesce(old.journal_entry_id, new.journal_entry_id);
  if entry_status = 'posted' then raise exception 'posted journal lines are immutable'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger journal_lines_posted_immutable
before update or delete on journal_lines
for each row execute function prevent_posted_journal_line_mutation();

create or replace function record_posted_journal() returns trigger
language plpgsql security definer
set search_path = public
set row_security = off
as $$
begin
  if old.status = 'draft' and new.status = 'posted' then
    insert into audit_events(firm_id, company_id, actor_user_id, event_type, entity_type, entity_id, after_state)
    values (new.firm_id, new.company_id, new.posted_by, 'journal.posted', 'journal_entry', new.id::text,
      jsonb_build_object('transactionDate', new.transaction_date, 'reference', new.reference, 'memo', new.memo));
    insert into realtime_outbox(firm_id, company_id, topic, payload)
    values (new.firm_id, new.company_id, 'journal.posted', jsonb_build_object('journalEntryId', new.id, 'version', new.version));
  end if;
  return new;
end;
$$;
create trigger journal_posted_audit
after update of status on journal_entries
for each row execute function record_posted_journal();

alter table accounts enable row level security;
alter table accounts force row level security;
alter table accounting_period_locks enable row level security;
alter table accounting_period_locks force row level security;
alter table journal_entries enable row level security;
alter table journal_entries force row level security;
alter table journal_lines enable row level security;
alter table journal_lines force row level security;

create policy account_company_isolation on accounts
using (
  firm_id = nullif(current_setting('app.firm_id', true), '')::uuid
  and company_id = nullif(current_setting('app.company_id', true), '')::uuid
)
with check (
  firm_id = nullif(current_setting('app.firm_id', true), '')::uuid
  and company_id = nullif(current_setting('app.company_id', true), '')::uuid
);
create policy period_lock_company_isolation on accounting_period_locks
using (
  firm_id = nullif(current_setting('app.firm_id', true), '')::uuid
  and company_id = nullif(current_setting('app.company_id', true), '')::uuid
)
with check (
  firm_id = nullif(current_setting('app.firm_id', true), '')::uuid
  and company_id = nullif(current_setting('app.company_id', true), '')::uuid
);
create policy journal_entry_company_isolation on journal_entries
using (
  firm_id = nullif(current_setting('app.firm_id', true), '')::uuid
  and company_id = nullif(current_setting('app.company_id', true), '')::uuid
)
with check (
  firm_id = nullif(current_setting('app.firm_id', true), '')::uuid
  and company_id = nullif(current_setting('app.company_id', true), '')::uuid
);
create policy journal_line_company_isolation on journal_lines
using (
  firm_id = nullif(current_setting('app.firm_id', true), '')::uuid
  and company_id = nullif(current_setting('app.company_id', true), '')::uuid
)
with check (
  firm_id = nullif(current_setting('app.firm_id', true), '')::uuid
  and company_id = nullif(current_setting('app.company_id', true), '')::uuid
);

grant select, insert, update on accounts to northledger_app;
grant select on accounting_period_locks to northledger_app;
grant select, insert, update on journal_entries to northledger_app;
grant select, insert, update, delete on journal_lines to northledger_app;

revoke all on function validate_journal_posting() from public;
revoke all on function prevent_posted_journal_entry_mutation() from public;
revoke all on function prevent_posted_journal_line_mutation() from public;
revoke all on function record_posted_journal() from public;

commit;
