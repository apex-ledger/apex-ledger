begin;

alter table sales_invoices add column void_journal_entry_id uuid;
alter table sales_invoices add column voided_at timestamptz;
alter table sales_invoices add column voided_by uuid references app_users(id);
alter table sales_invoices add column void_reason text;
alter table sales_invoices add foreign key(company_id,void_journal_entry_id) references journal_entries(company_id,id);
alter table sales_invoices add constraint sales_invoice_void_details_check check (
  (status<>'voided' and void_journal_entry_id is null and voided_at is null and voided_by is null and void_reason is null)
  or (status='voided' and void_journal_entry_id is not null and voided_at is not null and voided_by is not null and length(trim(void_reason))>0)
);

create or replace function publish_invoice_status_change() returns trigger language plpgsql security definer
set search_path=public set row_security=off as $$
begin
  if old.status is distinct from new.status then
    insert into realtime_outbox(firm_id,company_id,topic,payload) values(new.firm_id,new.company_id,'invoice.status.changed',
      jsonb_build_object('invoiceId',new.id,'status',new.status,'balanceCents',new.balance_cents,'version',new.version));
  end if;return new;
end; $$;
create trigger sales_invoice_status_outbox after update on sales_invoices
for each row execute function publish_invoice_status_change();

revoke all on function publish_invoice_status_change() from public;

commit;
