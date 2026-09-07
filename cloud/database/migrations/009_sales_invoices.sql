begin;

create unique index accounts_company_ar_control_idx
on accounts(company_id, account_kind) where account_kind = 'accounts_receivable';
alter table accounts no force row level security;
insert into accounts(firm_id, company_id, name, account_type, account_kind)
select c.firm_id, c.id, 'Accounts Receivable', 'asset', 'accounts_receivable'
from companies c where not exists (
  select 1 from accounts a where a.company_id = c.id and a.account_kind = 'accounts_receivable'
);
alter table accounts force row level security;

create table company_document_sequences (
  firm_id uuid not null references firms(id),
  company_id uuid not null references companies(id),
  document_type text not null check (document_type in ('invoice')),
  next_number bigint not null default 1 check (next_number > 0),
  primary key (company_id, document_type)
);

create table products_services (
  id uuid primary key default gen_random_uuid(), firm_id uuid not null references firms(id),
  company_id uuid not null references companies(id), item_type text not null check (item_type in ('product', 'service')),
  name text not null, description text, sku text, unit_price_cents bigint not null default 0 check (unit_price_cents >= 0),
  revenue_account_id uuid not null, default_tax_code text not null default 'hst_13'
    check (default_tax_code in ('hst_13', 'hst_exempt', 'manual_hst')),
  active boolean not null default true, version bigint not null default 1,
  created_by uuid not null references app_users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(company_id, id), unique(company_id, name),
  foreign key(company_id, revenue_account_id) references accounts(company_id, id)
);
create unique index products_services_sku_idx on products_services(company_id, sku) where sku is not null and active = true;

create table sales_invoices (
  id uuid primary key default gen_random_uuid(), firm_id uuid not null references firms(id), company_id uuid not null references companies(id),
  customer_id uuid not null, invoice_number bigint not null check (invoice_number > 0), invoice_date date not null, due_date date not null,
  memo text, status text not null default 'posted' check (status in ('posted', 'partially_paid', 'paid', 'voided')),
  subtotal_cents bigint not null check (subtotal_cents > 0), hst_cents bigint not null check (hst_cents >= 0),
  total_cents bigint generated always as (subtotal_cents + hst_cents) stored,
  balance_cents bigint not null check (balance_cents >= 0), journal_entry_id uuid not null,
  created_by uuid not null references app_users(id), created_at timestamptz not null default now(), version bigint not null default 1,
  unique(company_id, id), unique(company_id, invoice_number),
  foreign key(company_id, customer_id) references company_contacts(company_id, id),
  foreign key(company_id, journal_entry_id) references journal_entries(company_id, id),
  check (due_date >= invoice_date), check (balance_cents <= subtotal_cents + hst_cents)
);
create index sales_invoices_customer_idx on sales_invoices(company_id, customer_id, status, due_date);

create table sales_invoice_lines (
  id uuid primary key default gen_random_uuid(), firm_id uuid not null references firms(id), company_id uuid not null references companies(id),
  invoice_id uuid not null, line_number integer not null check (line_number > 0), product_id uuid,
  description text not null, quantity_milli bigint not null check (quantity_milli > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0), revenue_account_id uuid not null,
  tax_code text not null check (tax_code in ('hst_13', 'hst_exempt', 'manual_hst')),
  base_cents bigint not null check (base_cents > 0), hst_cents bigint not null check (hst_cents >= 0),
  total_cents bigint generated always as (base_cents + hst_cents) stored,
  foreign key(company_id, invoice_id) references sales_invoices(company_id, id),
  foreign key(company_id, product_id) references products_services(company_id, id),
  foreign key(company_id, revenue_account_id) references accounts(company_id, id), unique(invoice_id, line_number),
  check ((tax_code = 'hst_exempt' and hst_cents = 0)
    or (tax_code = 'hst_13' and hst_cents = ((base_cents * 13 + 50) / 100)) or tax_code = 'manual_hst')
);

create table customer_payments (
  id uuid primary key default gen_random_uuid(), firm_id uuid not null references firms(id), company_id uuid not null references companies(id),
  invoice_id uuid not null, payment_date date not null, amount_cents bigint not null check (amount_cents > 0), bank_account_id uuid not null,
  reference text, journal_entry_id uuid not null, created_by uuid not null references app_users(id), created_at timestamptz not null default now(),
  unique(company_id, id), foreign key(company_id, invoice_id) references sales_invoices(company_id, id),
  foreign key(company_id, bank_account_id) references accounts(company_id, id),
  foreign key(company_id, journal_entry_id) references journal_entries(company_id, id)
);

create or replace function prevent_sales_invoice_content_mutation() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'posted invoices cannot be deleted; void with an audit trail'; end if;
  if (new.firm_id, new.company_id, new.customer_id, new.invoice_number, new.invoice_date, new.due_date,
      new.memo, new.subtotal_cents, new.hst_cents, new.journal_entry_id, new.created_by, new.created_at)
     is distinct from
     (old.firm_id, old.company_id, old.customer_id, old.invoice_number, old.invoice_date, old.due_date,
      old.memo, old.subtotal_cents, old.hst_cents, old.journal_entry_id, old.created_by, old.created_at)
  then raise exception 'posted invoice content is immutable'; end if;
  new.version := old.version + 1; return new;
end; $$;
create trigger sales_invoice_content_immutable before update or delete on sales_invoices
for each row execute function prevent_sales_invoice_content_mutation();

create or replace function prevent_sales_invoice_line_mutation() returns trigger language plpgsql as $$
begin raise exception 'posted invoice lines are immutable'; end; $$;
create trigger sales_invoice_lines_immutable before update or delete on sales_invoice_lines
for each row execute function prevent_sales_invoice_line_mutation();

create or replace function publish_sales_activity() returns trigger language plpgsql security definer
set search_path = public set row_security = off as $$
begin
  insert into realtime_outbox(firm_id, company_id, topic, payload) values
    (new.firm_id, new.company_id, case when tg_table_name = 'sales_invoices' then 'invoice.posted' else 'customer.payment.posted' end,
     jsonb_build_object(case when tg_table_name = 'sales_invoices' then 'invoiceId' else 'paymentId' end, new.id));
  return new;
end; $$;
create trigger sales_invoice_outbox after insert on sales_invoices for each row execute function publish_sales_activity();
create trigger customer_payment_outbox after insert on customer_payments for each row execute function publish_sales_activity();

alter table company_document_sequences enable row level security; alter table company_document_sequences force row level security;
alter table products_services enable row level security; alter table products_services force row level security;
alter table sales_invoices enable row level security; alter table sales_invoices force row level security;
alter table sales_invoice_lines enable row level security; alter table sales_invoice_lines force row level security;
alter table customer_payments enable row level security; alter table customer_payments force row level security;

create policy document_sequence_isolation on company_document_sequences using (firm_id = nullif(current_setting('app.firm_id', true), '')::uuid and company_id = nullif(current_setting('app.company_id', true), '')::uuid) with check (firm_id = nullif(current_setting('app.firm_id', true), '')::uuid and company_id = nullif(current_setting('app.company_id', true), '')::uuid);
create policy product_service_isolation on products_services using (firm_id = nullif(current_setting('app.firm_id', true), '')::uuid and company_id = nullif(current_setting('app.company_id', true), '')::uuid) with check (firm_id = nullif(current_setting('app.firm_id', true), '')::uuid and company_id = nullif(current_setting('app.company_id', true), '')::uuid);
create policy sales_invoice_isolation on sales_invoices using (firm_id = nullif(current_setting('app.firm_id', true), '')::uuid and company_id = nullif(current_setting('app.company_id', true), '')::uuid) with check (firm_id = nullif(current_setting('app.firm_id', true), '')::uuid and company_id = nullif(current_setting('app.company_id', true), '')::uuid);
create policy sales_invoice_line_isolation on sales_invoice_lines using (firm_id = nullif(current_setting('app.firm_id', true), '')::uuid and company_id = nullif(current_setting('app.company_id', true), '')::uuid) with check (firm_id = nullif(current_setting('app.firm_id', true), '')::uuid and company_id = nullif(current_setting('app.company_id', true), '')::uuid);
create policy customer_payment_isolation on customer_payments using (firm_id = nullif(current_setting('app.firm_id', true), '')::uuid and company_id = nullif(current_setting('app.company_id', true), '')::uuid) with check (firm_id = nullif(current_setting('app.firm_id', true), '')::uuid and company_id = nullif(current_setting('app.company_id', true), '')::uuid);

grant select, insert, update on company_document_sequences to northledger_app;
grant select, insert, update on products_services to northledger_app;
grant select, insert, update on sales_invoices to northledger_app;
grant select, insert on sales_invoice_lines, customer_payments to northledger_app;
revoke all on function prevent_sales_invoice_content_mutation() from public;
revoke all on function prevent_sales_invoice_line_mutation() from public;
revoke all on function publish_sales_activity() from public;

commit;
