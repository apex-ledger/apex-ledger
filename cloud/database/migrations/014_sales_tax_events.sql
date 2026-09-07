begin;

create table sales_tax_events(
  id bigint generated always as identity primary key,firm_id uuid not null references firms(id),company_id uuid not null references companies(id),
  event_date date not null,event_type text not null check(event_type in('sales_collected','itc_paid')),
  source_type text not null check(source_type in('business_transaction','sales_invoice','sales_invoice_void','vendor_bill','vendor_bill_void')),
  source_id uuid not null,source_line_number integer not null default 0,category_account_id uuid not null,tax_code text not null
    check(tax_code in('hst_13','hst_exempt','manual_hst')),base_cents bigint not null check(base_cents<>0),hst_cents bigint not null,
  created_at timestamptz not null default now(),unique(company_id,source_type,source_id,source_line_number,event_type),
  foreign key(company_id,category_account_id) references accounts(company_id,id)
);
create index sales_tax_events_period_idx on sales_tax_events(company_id,event_date,event_type);
create index sales_tax_events_category_idx on sales_tax_events(company_id,category_account_id,event_date);

create or replace function prevent_sales_tax_event_mutation()returns trigger language plpgsql as $$
begin raise exception 'sales tax events are append-only';end;$$;
create trigger sales_tax_events_immutable before update or delete on sales_tax_events for each row execute function prevent_sales_tax_event_mutation();

create or replace function record_business_transaction_tax()returns trigger language plpgsql security definer
set search_path=public set row_security=off as $$
begin insert into sales_tax_events(firm_id,company_id,event_date,event_type,source_type,source_id,category_account_id,tax_code,base_cents,hst_cents)
  values(new.firm_id,new.company_id,new.transaction_date,case when new.transaction_type='sale' then 'sales_collected' else 'itc_paid' end,
    'business_transaction',new.id,new.category_account_id,new.tax_code,new.base_cents,new.hst_cents);return new;end;$$;
create trigger business_transaction_tax_event after insert on business_transactions for each row execute function record_business_transaction_tax();

create or replace function record_invoice_line_tax()returns trigger language plpgsql security definer
set search_path=public set row_security=off as $$
declare invoice_row sales_invoices%rowtype;
begin select * into invoice_row from sales_invoices where id=new.invoice_id;
  insert into sales_tax_events(firm_id,company_id,event_date,event_type,source_type,source_id,source_line_number,category_account_id,tax_code,base_cents,hst_cents)
  values(new.firm_id,new.company_id,invoice_row.invoice_date,'sales_collected','sales_invoice',new.invoice_id,new.line_number,new.revenue_account_id,new.tax_code,new.base_cents,new.hst_cents);
  return new;end;$$;
create trigger sales_invoice_line_tax_event after insert on sales_invoice_lines for each row execute function record_invoice_line_tax();

create or replace function record_invoice_void_tax()returns trigger language plpgsql security definer
set search_path=public set row_security=off as $$
begin if old.status<>'voided' and new.status='voided' then
  insert into sales_tax_events(firm_id,company_id,event_date,event_type,source_type,source_id,source_line_number,category_account_id,tax_code,base_cents,hst_cents)
    select sil.firm_id,sil.company_id,new.voided_at::date,'sales_collected','sales_invoice_void',new.id,sil.line_number,sil.revenue_account_id,sil.tax_code,-sil.base_cents,-sil.hst_cents
    from sales_invoice_lines sil where sil.invoice_id=new.id;
  end if;return new;end;$$;
create trigger sales_invoice_void_tax_event after update of status on sales_invoices for each row execute function record_invoice_void_tax();

insert into sales_tax_events(firm_id,company_id,event_date,event_type,source_type,source_id,category_account_id,tax_code,base_cents,hst_cents)
select firm_id,company_id,transaction_date,case when transaction_type='sale' then 'sales_collected' else 'itc_paid' end,
  'business_transaction',id,category_account_id,tax_code,base_cents,hst_cents from business_transactions on conflict do nothing;
insert into sales_tax_events(firm_id,company_id,event_date,event_type,source_type,source_id,source_line_number,category_account_id,tax_code,base_cents,hst_cents)
select sil.firm_id,sil.company_id,si.invoice_date,'sales_collected','sales_invoice',si.id,sil.line_number,sil.revenue_account_id,sil.tax_code,sil.base_cents,sil.hst_cents
from sales_invoice_lines sil join sales_invoices si on si.id=sil.invoice_id on conflict do nothing;
insert into sales_tax_events(firm_id,company_id,event_date,event_type,source_type,source_id,source_line_number,category_account_id,tax_code,base_cents,hst_cents)
select sil.firm_id,sil.company_id,si.voided_at::date,'sales_collected','sales_invoice_void',si.id,sil.line_number,sil.revenue_account_id,sil.tax_code,-sil.base_cents,-sil.hst_cents
from sales_invoice_lines sil join sales_invoices si on si.id=sil.invoice_id where si.status='voided' on conflict do nothing;

alter table sales_tax_events enable row level security;alter table sales_tax_events force row level security;
create policy sales_tax_event_member_select on sales_tax_events for select using(current_user_company_role(firm_id,company_id)is not null);
create policy sales_tax_event_writer_insert on sales_tax_events for insert with check(current_user_can_write_company(firm_id,company_id));
grant select,insert on sales_tax_events to northledger_app;
revoke all on function prevent_sales_tax_event_mutation()from public;
revoke all on function record_business_transaction_tax()from public;
revoke all on function record_invoice_line_tax()from public;
revoke all on function record_invoice_void_tax()from public;

commit;
