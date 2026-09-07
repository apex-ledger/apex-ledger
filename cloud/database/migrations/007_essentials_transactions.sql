begin;

create unique index accounts_company_hst_control_idx
on accounts(company_id, account_kind)
where account_kind in ('hst_payable', 'hst_recoverable');

alter table accounts no force row level security;
insert into accounts(firm_id, company_id, name, account_type, account_kind)
select c.firm_id, c.id, defaults.name, defaults.account_type, defaults.account_kind
from companies c
cross join (values
  ('Checking Account', 'asset', 'bank'),
  ('Sales', 'revenue', 'sales'),
  ('General Expenses', 'expense', 'general_expense'),
  ('GST/HST Payable', 'liability', 'hst_payable'),
  ('GST/HST Recoverable', 'asset', 'hst_recoverable')
) as defaults(name, account_type, account_kind)
where not exists (
  select 1 from accounts a where a.company_id = c.id and a.account_kind = defaults.account_kind
)
on conflict do nothing;
alter table accounts force row level security;

create table business_transactions (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id),
  company_id uuid not null references companies(id),
  transaction_type text not null check (transaction_type in ('sale', 'expense')),
  transaction_date date not null,
  description text not null,
  counterparty_name text,
  bank_account_id uuid not null,
  category_account_id uuid not null,
  tax_code text not null check (tax_code in ('hst_13', 'hst_exempt', 'manual_hst')),
  base_cents bigint not null check (base_cents > 0),
  hst_cents bigint not null check (hst_cents >= 0),
  total_cents bigint generated always as (base_cents + hst_cents) stored,
  journal_entry_id uuid not null unique,
  created_by uuid not null references app_users(id),
  created_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, bank_account_id) references accounts(company_id, id),
  foreign key (company_id, category_account_id) references accounts(company_id, id),
  foreign key (company_id, journal_entry_id) references journal_entries(company_id, id),
  check (
    (tax_code = 'hst_exempt' and hst_cents = 0)
    or (tax_code = 'hst_13' and hst_cents = ((base_cents * 13 + 50) / 100))
    or tax_code = 'manual_hst'
  )
);
create index business_transactions_company_date_idx
on business_transactions(company_id, transaction_date desc, id);
create index business_transactions_tax_idx
on business_transactions(company_id, tax_code, transaction_type, transaction_date);

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
  if active_plan = 'essentials' and actor_role not in ('firm_admin', 'accountant') and not exists (
    select 1 from business_transactions bt
    where bt.journal_entry_id = new.id and bt.created_by = actor_user
      and new.source = 'business_' || bt.transaction_type
  ) then raise exception 'Essentials adjustments require accountant access'; end if;
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

create or replace function prevent_business_transaction_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'posted business transactions are immutable; create a reversal';
end;
$$;
create trigger business_transactions_immutable
before update or delete on business_transactions
for each row execute function prevent_business_transaction_mutation();

create or replace function publish_business_transaction() returns trigger
language plpgsql security definer
set search_path = public
set row_security = off
as $$
begin
  insert into realtime_outbox(firm_id, company_id, topic, payload)
  values (new.firm_id, new.company_id, 'business.transaction.posted',
    jsonb_build_object('transactionId', new.id, 'transactionType', new.transaction_type,
                       'transactionDate', new.transaction_date, 'totalCents', new.total_cents));
  return new;
end;
$$;
create trigger business_transaction_outbox
after insert on business_transactions
for each row execute function publish_business_transaction();

alter table business_transactions enable row level security;
alter table business_transactions force row level security;
create policy business_transaction_company_isolation on business_transactions
using (
  firm_id = nullif(current_setting('app.firm_id', true), '')::uuid
  and company_id = nullif(current_setting('app.company_id', true), '')::uuid
)
with check (
  firm_id = nullif(current_setting('app.firm_id', true), '')::uuid
  and company_id = nullif(current_setting('app.company_id', true), '')::uuid
);

grant select, insert on business_transactions to northledger_app;
revoke all on function prevent_business_transaction_mutation() from public;
revoke all on function publish_business_transaction() from public;

commit;
