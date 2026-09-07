begin;

create or replace function current_user_company_role(target_firm_id uuid, target_company_id uuid) returns text
language sql stable security definer
set search_path = public
set row_security = off
as $$
  select fm.role from firm_memberships fm join companies c on c.firm_id = fm.firm_id
  where fm.firm_id = target_firm_id and fm.user_id = nullif(current_setting('app.user_id', true), '')::uuid
    and fm.status = 'active' and c.id = target_company_id and c.archived_at is null
$$;

create or replace function current_user_can_write_company(target_firm_id uuid, target_company_id uuid) returns boolean
language sql stable security definer
set search_path = public
set row_security = off
as $$
  select coalesce(current_user_company_role(target_firm_id, target_company_id)
    in ('owner', 'firm_admin', 'accountant', 'bookkeeper'), false)
$$;

drop policy company_firm_isolation on companies;
create policy company_member_select on companies for select using (
  firm_id = nullif(current_setting('app.firm_id', true), '')::uuid and current_user_firm_role(firm_id) is not null);
create policy company_admin_insert on companies for insert with check (
  firm_id = nullif(current_setting('app.firm_id', true), '')::uuid and current_user_firm_role(firm_id) in ('owner','firm_admin'));
create policy company_admin_update on companies for update using (
  firm_id = nullif(current_setting('app.firm_id', true), '')::uuid and current_user_firm_role(firm_id) in ('owner','firm_admin')) with check (
  firm_id = nullif(current_setting('app.firm_id', true), '')::uuid and current_user_firm_role(firm_id) in ('owner','firm_admin'));

drop policy audit_firm_isolation on audit_events;
create policy audit_member_select on audit_events for select using (
  firm_id = nullif(current_setting('app.firm_id', true), '')::uuid and current_user_firm_role(firm_id) is not null);
create policy audit_writer_insert on audit_events for insert with check (
  firm_id = nullif(current_setting('app.firm_id', true), '')::uuid and current_user_firm_role(firm_id) in ('owner','firm_admin','accountant','bookkeeper'));

drop policy idempotency_firm_isolation on idempotency_keys;
create policy idempotency_writer_all on idempotency_keys using (
  firm_id = nullif(current_setting('app.firm_id', true), '')::uuid and current_user_firm_role(firm_id) in ('owner','firm_admin','accountant','bookkeeper')) with check (
  firm_id = nullif(current_setting('app.firm_id', true), '')::uuid and current_user_firm_role(firm_id) in ('owner','firm_admin','accountant','bookkeeper'));

drop policy outbox_firm_isolation on realtime_outbox;
create policy outbox_member_select on realtime_outbox for select using (
  firm_id = nullif(current_setting('app.firm_id', true), '')::uuid and current_user_firm_role(firm_id) is not null);
create policy outbox_writer_insert on realtime_outbox for insert with check (
  firm_id = nullif(current_setting('app.firm_id', true), '')::uuid and (company_id is null or current_user_can_write_company(firm_id, company_id)));
create policy outbox_writer_update on realtime_outbox for update using (
  firm_id = nullif(current_setting('app.firm_id', true), '')::uuid and current_user_firm_role(firm_id) in ('owner','firm_admin')) with check (
  firm_id = nullif(current_setting('app.firm_id', true), '')::uuid and current_user_firm_role(firm_id) in ('owner','firm_admin'));

drop policy account_company_isolation on accounts;
drop policy period_lock_company_isolation on accounting_period_locks;
drop policy journal_entry_company_isolation on journal_entries;
drop policy journal_line_company_isolation on journal_lines;
drop policy business_transaction_company_isolation on business_transactions;
drop policy company_contact_isolation on company_contacts;
drop policy document_sequence_isolation on company_document_sequences;
drop policy product_service_isolation on products_services;
drop policy sales_invoice_isolation on sales_invoices;
drop policy sales_invoice_line_isolation on sales_invoice_lines;
drop policy customer_payment_isolation on customer_payments;

create policy account_member_select on accounts for select using (current_user_company_role(firm_id,company_id) is not null);
create policy account_writer_insert on accounts for insert with check (current_user_can_write_company(firm_id,company_id));
create policy account_writer_update on accounts for update using (current_user_can_write_company(firm_id,company_id)) with check (current_user_can_write_company(firm_id,company_id));
create policy period_lock_member_select on accounting_period_locks for select using (current_user_company_role(firm_id,company_id) is not null);
create policy journal_entry_member_select on journal_entries for select using (current_user_company_role(firm_id,company_id) is not null);
create policy journal_entry_writer_insert on journal_entries for insert with check (current_user_can_write_company(firm_id,company_id));
create policy journal_entry_writer_update on journal_entries for update using (current_user_can_write_company(firm_id,company_id)) with check (current_user_can_write_company(firm_id,company_id));
create policy journal_line_member_select on journal_lines for select using (current_user_company_role(firm_id,company_id) is not null);
create policy journal_line_writer_insert on journal_lines for insert with check (current_user_can_write_company(firm_id,company_id));
create policy journal_line_writer_update on journal_lines for update using (current_user_can_write_company(firm_id,company_id)) with check (current_user_can_write_company(firm_id,company_id));
create policy journal_line_writer_delete on journal_lines for delete using (current_user_can_write_company(firm_id,company_id));
create policy business_transaction_member_select on business_transactions for select using (current_user_company_role(firm_id,company_id) is not null);
create policy business_transaction_writer_insert on business_transactions for insert with check (current_user_can_write_company(firm_id,company_id));
create policy company_contact_member_select on company_contacts for select using (current_user_company_role(firm_id,company_id) is not null);
create policy company_contact_writer_insert on company_contacts for insert with check (current_user_can_write_company(firm_id,company_id));
create policy company_contact_writer_update on company_contacts for update using (current_user_can_write_company(firm_id,company_id)) with check (current_user_can_write_company(firm_id,company_id));
create policy document_sequence_member_select on company_document_sequences for select using (current_user_company_role(firm_id,company_id) is not null);
create policy document_sequence_writer_insert on company_document_sequences for insert with check (current_user_can_write_company(firm_id,company_id));
create policy document_sequence_writer_update on company_document_sequences for update using (current_user_can_write_company(firm_id,company_id)) with check (current_user_can_write_company(firm_id,company_id));
create policy product_service_member_select on products_services for select using (current_user_company_role(firm_id,company_id) is not null);
create policy product_service_writer_insert on products_services for insert with check (current_user_can_write_company(firm_id,company_id));
create policy product_service_writer_update on products_services for update using (current_user_can_write_company(firm_id,company_id)) with check (current_user_can_write_company(firm_id,company_id));
create policy sales_invoice_member_select on sales_invoices for select using (current_user_company_role(firm_id,company_id) is not null);
create policy sales_invoice_writer_insert on sales_invoices for insert with check (current_user_can_write_company(firm_id,company_id));
create policy sales_invoice_writer_update on sales_invoices for update using (current_user_can_write_company(firm_id,company_id)) with check (current_user_can_write_company(firm_id,company_id));
create policy sales_invoice_line_member_select on sales_invoice_lines for select using (current_user_company_role(firm_id,company_id) is not null);
create policy sales_invoice_line_writer_insert on sales_invoice_lines for insert with check (current_user_can_write_company(firm_id,company_id));
create policy customer_payment_member_select on customer_payments for select using (current_user_company_role(firm_id,company_id) is not null);
create policy customer_payment_writer_insert on customer_payments for insert with check (current_user_can_write_company(firm_id,company_id));

revoke all on function current_user_company_role(uuid,uuid) from public;
revoke all on function current_user_can_write_company(uuid,uuid) from public;
grant execute on function current_user_company_role(uuid,uuid), current_user_can_write_company(uuid,uuid) to northledger_app;

commit;
