begin;

create table bank_transfers(
  id uuid primary key default gen_random_uuid(),firm_id uuid not null references firms(id),company_id uuid not null references companies(id),
  transfer_date date not null,from_account_id uuid not null references accounts(id),to_account_id uuid not null references accounts(id),amount_cents bigint not null check(amount_cents>0),
  memo text,journal_entry_id uuid not null unique references journal_entries(id),created_by uuid not null references app_users(id),created_at timestamptz not null default now(),
  check(from_account_id<>to_account_id)
);
create index bank_transfers_company_date_idx on bank_transfers(company_id,transfer_date desc);

create table bank_import_batches(
  id uuid primary key default gen_random_uuid(),firm_id uuid not null references firms(id),company_id uuid not null references companies(id),account_id uuid not null references accounts(id),
  source_type text not null check(source_type in('csv','ofx','qbo','bank_feed')),source_name text not null,content_sha256 text not null check(content_sha256~'^[0-9a-f]{64}$'),
  row_count integer not null default 0 check(row_count>=0),created_by uuid not null references app_users(id),created_at timestamptz not null default now(),unique(company_id,account_id,content_sha256)
);
create table bank_import_rows(
  id uuid primary key default gen_random_uuid(),firm_id uuid not null references firms(id),company_id uuid not null references companies(id),batch_id uuid not null references bank_import_batches(id),account_id uuid not null references accounts(id),
  posted_date date not null,description text not null,reference text,amount_cents bigint not null check(amount_cents<>0),external_transaction_id text,dedup_hash text not null check(dedup_hash~'^[0-9a-f]{64}$'),
  status text not null default 'unmatched'check(status in('unmatched','matched','excluded')),matched_journal_entry_id uuid references journal_entries(id),created_at timestamptz not null default now(),
  unique(company_id,account_id,dedup_hash)
);
create index bank_import_rows_match_idx on bank_import_rows(company_id,account_id,status,posted_date);

create table bank_reconciliations(
  id uuid primary key default gen_random_uuid(),firm_id uuid not null references firms(id),company_id uuid not null references companies(id),account_id uuid not null references accounts(id),
  statement_start date not null,statement_end date not null,opening_balance_cents bigint not null,closing_balance_cents bigint not null,
  status text not null default 'draft'check(status in('draft','completed','reopened')),created_by uuid not null references app_users(id),created_at timestamptz not null default now(),
  completed_by uuid references app_users(id),completed_at timestamptz,reopen_reason text,version integer not null default 1,check(statement_end>=statement_start),unique(company_id,account_id,statement_end)
);
create table bank_reconciliation_items(
  reconciliation_id uuid not null references bank_reconciliations(id)on delete cascade,firm_id uuid not null references firms(id),company_id uuid not null references companies(id),
  journal_line_id uuid not null references journal_lines(id),cleared_amount_cents bigint not null check(cleared_amount_cents<>0),primary key(reconciliation_id,journal_line_id)
);

create or replace function prevent_bank_transfer_mutation()returns trigger language plpgsql as $$begin raise exception'posted bank transfers are immutable';end;$$;
create trigger bank_transfer_immutable before update or delete on bank_transfers for each row execute function prevent_bank_transfer_mutation();

alter table bank_transfers enable row level security;alter table bank_transfers force row level security;
alter table bank_import_batches enable row level security;alter table bank_import_batches force row level security;
alter table bank_import_rows enable row level security;alter table bank_import_rows force row level security;
alter table bank_reconciliations enable row level security;alter table bank_reconciliations force row level security;
alter table bank_reconciliation_items enable row level security;alter table bank_reconciliation_items force row level security;
create policy bank_transfer_member_select on bank_transfers for select using(current_user_company_role(firm_id,company_id)is not null);
create policy bank_transfer_writer_insert on bank_transfers for insert with check(current_user_can_write_company(firm_id,company_id));
create policy bank_import_batch_member_select on bank_import_batches for select using(current_user_company_role(firm_id,company_id)is not null);
create policy bank_import_batch_writer_insert on bank_import_batches for insert with check(current_user_can_write_company(firm_id,company_id));
create policy bank_import_row_member_select on bank_import_rows for select using(current_user_company_role(firm_id,company_id)is not null);
create policy bank_import_row_writer_insert on bank_import_rows for insert with check(current_user_can_write_company(firm_id,company_id));
create policy bank_import_row_writer_update on bank_import_rows for update using(current_user_can_write_company(firm_id,company_id))with check(current_user_can_write_company(firm_id,company_id));
create policy bank_reconciliation_member_select on bank_reconciliations for select using(current_user_company_role(firm_id,company_id)is not null);
create policy bank_reconciliation_writer_all on bank_reconciliations for all using(current_user_can_write_company(firm_id,company_id))with check(current_user_can_write_company(firm_id,company_id));
create policy bank_reconciliation_item_member_select on bank_reconciliation_items for select using(current_user_company_role(firm_id,company_id)is not null);
create policy bank_reconciliation_item_writer_all on bank_reconciliation_items for all using(current_user_can_write_company(firm_id,company_id))with check(current_user_can_write_company(firm_id,company_id));
grant select,insert on bank_transfers,bank_import_batches to northledger_app;
grant select,insert,update on bank_import_rows,bank_reconciliations,bank_reconciliation_items to northledger_app;
grant delete on bank_reconciliation_items to northledger_app;

commit;
