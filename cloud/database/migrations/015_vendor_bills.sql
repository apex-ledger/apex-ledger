begin;

alter table company_document_sequences drop constraint company_document_sequences_document_type_check;
alter table company_document_sequences add constraint company_document_sequences_document_type_check check(document_type in('invoice','bill'));
create unique index accounts_company_ap_control_idx on accounts(company_id,account_kind)where account_kind='accounts_payable';
alter table accounts no force row level security;
insert into accounts(firm_id,company_id,name,account_type,account_kind)
select c.firm_id,c.id,'Accounts Payable','liability','accounts_payable' from companies c where not exists(
  select 1 from accounts a where a.company_id=c.id and a.account_kind='accounts_payable');
alter table accounts force row level security;

create or replace function provision_company_default_accounts()returns trigger language plpgsql security definer
set search_path=public set row_security=off as $$
begin insert into accounts(firm_id,company_id,name,account_type,account_kind)values
  (new.firm_id,new.id,'Checking Account','asset','bank'),(new.firm_id,new.id,'Accounts Receivable','asset','accounts_receivable'),
  (new.firm_id,new.id,'Accounts Payable','liability','accounts_payable'),(new.firm_id,new.id,'Sales','revenue','sales'),
  (new.firm_id,new.id,'General Expenses','expense','general_expense'),(new.firm_id,new.id,'GST/HST Payable','liability','hst_payable'),
  (new.firm_id,new.id,'GST/HST Recoverable','asset','hst_recoverable') on conflict do nothing;return new;end;$$;

create table vendor_bills(
  id uuid primary key default gen_random_uuid(),firm_id uuid not null references firms(id),company_id uuid not null references companies(id),vendor_id uuid not null,
  bill_number bigint not null check(bill_number>0),vendor_invoice_number text not null check(length(trim(vendor_invoice_number))>0),bill_date date not null,due_date date not null,
  memo text,status text not null default'posted'check(status in('posted','partially_paid','paid','voided')),subtotal_cents bigint not null check(subtotal_cents>0),
  hst_cents bigint not null check(hst_cents>=0),total_cents bigint generated always as(subtotal_cents+hst_cents)stored,balance_cents bigint not null check(balance_cents>=0),
  journal_entry_id uuid not null,void_journal_entry_id uuid,voided_at timestamptz,voided_by uuid references app_users(id),void_reason text,
  created_by uuid not null references app_users(id),created_at timestamptz not null default now(),version bigint not null default 1,
  unique(company_id,id),unique(company_id,bill_number),unique(company_id,vendor_id,vendor_invoice_number),
  foreign key(company_id,vendor_id)references company_contacts(company_id,id),foreign key(company_id,journal_entry_id)references journal_entries(company_id,id),
  foreign key(company_id,void_journal_entry_id)references journal_entries(company_id,id),check(due_date>=bill_date),check(balance_cents<=subtotal_cents+hst_cents),
  check((status<>'voided'and void_journal_entry_id is null and voided_at is null and voided_by is null and void_reason is null)
    or(status='voided'and void_journal_entry_id is not null and voided_at is not null and voided_by is not null and length(trim(void_reason))>0))
);
create index vendor_bills_vendor_idx on vendor_bills(company_id,vendor_id,status,due_date);
create table vendor_bill_lines(
  id uuid primary key default gen_random_uuid(),firm_id uuid not null references firms(id),company_id uuid not null references companies(id),bill_id uuid not null,
  line_number integer not null check(line_number>0),description text not null,expense_account_id uuid not null,tax_code text not null check(tax_code in('hst_13','hst_exempt','manual_hst')),
  base_cents bigint not null check(base_cents>0),hst_cents bigint not null check(hst_cents>=0),total_cents bigint generated always as(base_cents+hst_cents)stored,
  foreign key(company_id,bill_id)references vendor_bills(company_id,id),foreign key(company_id,expense_account_id)references accounts(company_id,id),unique(bill_id,line_number),
  check((tax_code='hst_exempt'and hst_cents=0)or(tax_code='hst_13'and hst_cents=((base_cents*13+50)/100))or tax_code='manual_hst')
);
create table vendor_payments(
  id uuid primary key default gen_random_uuid(),firm_id uuid not null references firms(id),company_id uuid not null references companies(id),bill_id uuid not null,
  payment_date date not null,amount_cents bigint not null check(amount_cents>0),bank_account_id uuid not null,reference text,journal_entry_id uuid not null,
  created_by uuid not null references app_users(id),created_at timestamptz not null default now(),unique(company_id,id),
  foreign key(company_id,bill_id)references vendor_bills(company_id,id),foreign key(company_id,bank_account_id)references accounts(company_id,id),
  foreign key(company_id,journal_entry_id)references journal_entries(company_id,id)
);

create or replace function prevent_vendor_bill_content_mutation()returns trigger language plpgsql as $$
begin if tg_op='DELETE'then raise exception'posted bills cannot be deleted; void with an audit trail';end if;
  if(new.firm_id,new.company_id,new.vendor_id,new.bill_number,new.vendor_invoice_number,new.bill_date,new.due_date,new.memo,new.subtotal_cents,new.hst_cents,new.journal_entry_id,new.created_by,new.created_at)
    is distinct from(old.firm_id,old.company_id,old.vendor_id,old.bill_number,old.vendor_invoice_number,old.bill_date,old.due_date,old.memo,old.subtotal_cents,old.hst_cents,old.journal_entry_id,old.created_by,old.created_at)
    then raise exception'posted bill content is immutable';end if;new.version:=old.version+1;return new;end;$$;
create trigger vendor_bill_content_immutable before update or delete on vendor_bills for each row execute function prevent_vendor_bill_content_mutation();
create or replace function prevent_vendor_bill_line_mutation()returns trigger language plpgsql as $$begin raise exception'posted bill lines are immutable';end;$$;
create trigger vendor_bill_lines_immutable before update or delete on vendor_bill_lines for each row execute function prevent_vendor_bill_line_mutation();

create or replace function publish_vendor_activity()returns trigger language plpgsql security definer set search_path=public set row_security=off as $$
begin insert into realtime_outbox(firm_id,company_id,topic,payload)values(new.firm_id,new.company_id,
  case when tg_table_name='vendor_bills'then'bill.posted'else'vendor.payment.posted'end,
  jsonb_build_object(case when tg_table_name='vendor_bills'then'billId'else'paymentId'end,new.id));return new;end;$$;
create trigger vendor_bill_outbox after insert on vendor_bills for each row execute function publish_vendor_activity();
create trigger vendor_payment_outbox after insert on vendor_payments for each row execute function publish_vendor_activity();
create or replace function publish_vendor_bill_status()returns trigger language plpgsql security definer set search_path=public set row_security=off as $$
begin if old.status is distinct from new.status then insert into realtime_outbox(firm_id,company_id,topic,payload)values(new.firm_id,new.company_id,'bill.status.changed',
  jsonb_build_object('billId',new.id,'status',new.status,'balanceCents',new.balance_cents,'version',new.version));end if;return new;end;$$;
create trigger vendor_bill_status_outbox after update on vendor_bills for each row execute function publish_vendor_bill_status();

create or replace function record_vendor_bill_line_tax()returns trigger language plpgsql security definer set search_path=public set row_security=off as $$
declare bill_row vendor_bills%rowtype;begin select*into bill_row from vendor_bills where id=new.bill_id;
  insert into sales_tax_events(firm_id,company_id,event_date,event_type,source_type,source_id,source_line_number,category_account_id,tax_code,base_cents,hst_cents)
  values(new.firm_id,new.company_id,bill_row.bill_date,'itc_paid','vendor_bill',new.bill_id,new.line_number,new.expense_account_id,new.tax_code,new.base_cents,new.hst_cents);return new;end;$$;
create trigger vendor_bill_line_tax_event after insert on vendor_bill_lines for each row execute function record_vendor_bill_line_tax();
create or replace function record_vendor_bill_void_tax()returns trigger language plpgsql security definer set search_path=public set row_security=off as $$
begin if old.status<>'voided'and new.status='voided'then insert into sales_tax_events(firm_id,company_id,event_date,event_type,source_type,source_id,source_line_number,category_account_id,tax_code,base_cents,hst_cents)
  select vbl.firm_id,vbl.company_id,new.voided_at::date,'itc_paid','vendor_bill_void',new.id,vbl.line_number,vbl.expense_account_id,vbl.tax_code,-vbl.base_cents,-vbl.hst_cents
  from vendor_bill_lines vbl where vbl.bill_id=new.id;end if;return new;end;$$;
create trigger vendor_bill_void_tax_event after update of status on vendor_bills for each row execute function record_vendor_bill_void_tax();

alter table vendor_bills enable row level security;alter table vendor_bills force row level security;
alter table vendor_bill_lines enable row level security;alter table vendor_bill_lines force row level security;
alter table vendor_payments enable row level security;alter table vendor_payments force row level security;
create policy vendor_bill_member_select on vendor_bills for select using(current_user_company_role(firm_id,company_id)is not null);
create policy vendor_bill_writer_insert on vendor_bills for insert with check(current_user_can_write_company(firm_id,company_id));
create policy vendor_bill_writer_update on vendor_bills for update using(current_user_can_write_company(firm_id,company_id))with check(current_user_can_write_company(firm_id,company_id));
create policy vendor_bill_line_member_select on vendor_bill_lines for select using(current_user_company_role(firm_id,company_id)is not null);
create policy vendor_bill_line_writer_insert on vendor_bill_lines for insert with check(current_user_can_write_company(firm_id,company_id));
create policy vendor_payment_member_select on vendor_payments for select using(current_user_company_role(firm_id,company_id)is not null);
create policy vendor_payment_writer_insert on vendor_payments for insert with check(current_user_can_write_company(firm_id,company_id));
grant select,insert,update on vendor_bills to northledger_app;grant select,insert on vendor_bill_lines,vendor_payments to northledger_app;
revoke all on function prevent_vendor_bill_content_mutation()from public;revoke all on function prevent_vendor_bill_line_mutation()from public;
revoke all on function publish_vendor_activity()from public;revoke all on function publish_vendor_bill_status()from public;
revoke all on function record_vendor_bill_line_tax()from public;revoke all on function record_vendor_bill_void_tax()from public;

commit;
