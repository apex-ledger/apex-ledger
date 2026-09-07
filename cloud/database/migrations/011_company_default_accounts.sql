begin;

create or replace function provision_company_default_accounts() returns trigger
language plpgsql security definer
set search_path = public
set row_security = off
as $$
begin
  insert into accounts(firm_id,company_id,name,account_type,account_kind) values
    (new.firm_id,new.id,'Checking Account','asset','bank'),
    (new.firm_id,new.id,'Accounts Receivable','asset','accounts_receivable'),
    (new.firm_id,new.id,'Sales','revenue','sales'),
    (new.firm_id,new.id,'General Expenses','expense','general_expense'),
    (new.firm_id,new.id,'GST/HST Payable','liability','hst_payable'),
    (new.firm_id,new.id,'GST/HST Recoverable','asset','hst_recoverable')
  on conflict do nothing;
  return new;
end;
$$;
create trigger companies_default_accounts after insert on companies
for each row execute function provision_company_default_accounts();

revoke all on function provision_company_default_accounts() from public;

commit;
