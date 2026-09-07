import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const here=dirname(fileURLToPath(import.meta.url));
const migrationDirectory=join(here,'..','database','migrations');

describe('PostgreSQL migration chain',()=>{
  it('applies every migration in order and creates invoice controls',async()=>{
    const database=new PGlite({extensions:{pgcrypto}});
    try{
      const files=(await readdir(migrationDirectory)).filter((file)=>file.endsWith('.sql')).sort();
      for(const file of files) await database.exec(await readFile(join(migrationDirectory,file),'utf8'));
      assert.deepEqual(files,['001_identity_and_tenancy.sql','002_runtime_permissions.sql','003_seat_invitations.sql',
        '004_subscription_plans.sql','005_essentials_plan.sql','006_accounting_core.sql','007_essentials_transactions.sql',
        '008_company_contacts.sql','009_sales_invoices.sql','010_rls_membership_hardening.sql','011_company_default_accounts.sql',
        '012_product_updates.sql','013_invoice_voids.sql','014_sales_tax_events.sql','015_vendor_bills.sql','016_seat_growth_requests.sql','017_company_team_access.sql','018_banking_reconciliation.sql','019_apex_security_and_platform_management.sql','020_platform_action_history.sql']);
      const tables=await database.query(`select table_name from information_schema.tables where table_schema='public'`);
      const names=new Set(tables.rows.map((row)=>row.table_name));
      for(const required of ['firms','companies','accounts','company_contacts','products_services','sales_invoices','sales_invoice_lines','customer_payments','vendor_bills','vendor_bill_lines','vendor_payments','firm_seat_change_requests','company_member_access','firm_invitation_company_access','bank_transfers','bank_import_batches','bank_import_rows','bank_reconciliations','email_mfa_challenges','platform_staff','platform_subscription_actions']){
        assert.equal(names.has(required),true,`missing table ${required}`);
      }
      const policies=await database.query(`select tablename from pg_policies where schemaname='public' and tablename in ('company_contacts','sales_invoices','customer_payments','vendor_bills','vendor_payments')`);
      assert.equal(new Set(policies.rows.map((row)=>row.tablename)).size,5);

      const ids={
        writer:'00000000-0000-4000-8000-000000000001',viewer:'00000000-0000-4000-8000-000000000002',
        firmA:'10000000-0000-4000-8000-000000000001',firmB:'10000000-0000-4000-8000-000000000002',
        companyA:'20000000-0000-4000-8000-000000000001',companyB:'20000000-0000-4000-8000-000000000002',companyA2:'20000000-0000-4000-8000-000000000003',
      };
      await database.exec(`
        insert into app_users(id,entra_object_id,subject,email) values
          ('${ids.writer}','writer-oid','writer-sub','writer@example.test'),
          ('${ids.viewer}','viewer-oid','viewer-sub','viewer@example.test');
        insert into platform_staff(user_id,role) values('${ids.writer}','platform_admin');
        insert into firms(id,name,seat_limit) values ('${ids.firmA}','Firm A',5),('${ids.firmB}','Firm B',5);
        insert into firm_memberships(firm_id,user_id,role,status) values
          ('${ids.firmA}','${ids.writer}','firm_admin','active'),
          ('${ids.firmA}','${ids.viewer}','viewer','active');
        insert into companies(id,firm_id,legal_name) values
          ('${ids.companyA}','${ids.firmA}','Company A'),('${ids.companyA2}','${ids.firmA}','Company A Private'),('${ids.companyB}','${ids.firmB}','Company B');
        insert into company_member_access(firm_id,company_id,user_id,granted_by)values('${ids.firmA}','${ids.companyA}','${ids.viewer}','${ids.writer}');
      `);
      const defaults=await database.query(`select account_kind from accounts where company_id='${ids.companyA}'`);
      assert.deepEqual(new Set(defaults.rows.map((row)=>row.account_kind)),new Set([
        'bank','accounts_receivable','accounts_payable','sales','general_expense','hst_payable','hst_recoverable',
      ]),'new companies must receive every posting control account');

      await database.exec(`set role northledger_app; begin;
        select set_config('app.user_id','${ids.writer}',true);
        select set_config('app.firm_id','${ids.firmB}',true);
        select set_config('app.company_id','${ids.companyB}',true);`);
      const deniedFirm=await database.query(`select id from companies where id='${ids.companyB}'`);
      assert.equal(deniedFirm.rows.length,0,'changing context must not grant cross-firm access');
      await database.exec(`rollback; reset role;`);

      await database.exec(`set role northledger_app; begin;
        select set_config('app.user_id','${ids.viewer}',true);
        select set_config('app.firm_id','${ids.firmA}',true);`);
      const viewerCompanies=await database.query(`select id from companies order by id`);
      assert.deepEqual(viewerCompanies.rows.map((row)=>row.id),[ids.companyA],'a non-admin seat must see only explicitly assigned client companies');
      await database.exec(`rollback;reset role;`);

      await database.exec(`set role northledger_app; begin;
        select set_config('app.user_id','${ids.writer}',true);
        select set_config('app.firm_id','${ids.firmA}',true);
        select set_config('app.company_id','${ids.companyA}',true);`);
      const allowedFirm=await database.query(`select id from companies where id='${ids.companyA}'`);
      assert.equal(allowedFirm.rows.length,1,'active firm member must retain authorized access');
      const brandedPlans=await database.query(`select display_name from subscription_plans order by code`);
      assert.equal(brandedPlans.rows.every((row)=>row.display_name.startsWith('Apex Ledger')),true,'forward migration must apply Apex Ledger branding');
      const mfa=await database.query(`select create_email_mfa_challenge(repeat('a',64),now()+interval '10 minutes') as id`);
      const wrongMfa=await database.query(`select consume_email_mfa_challenge('${mfa.rows[0].id}',repeat('b',64)) as accepted`);
      assert.equal(wrongMfa.rows[0].accepted,false);
      const acceptedMfa=await database.query(`select consume_email_mfa_challenge('${mfa.rows[0].id}',repeat('a',64)) as accepted`);
      assert.equal(acceptedMfa.rows[0].accepted,true,'matching email OTP hash must be consumed once');
      const platformRole=await database.query(`select current_user_platform_role() as role`);
      assert.equal(platformRole.rows[0].role,'platform_admin');
      await database.query(`select platform_manage_subscription('${ids.firmA}','accounting','suspended',null,'suspend','Customer requested temporary stop')`);
      const stopped=await database.query(`select status from firm_subscriptions where firm_id='${ids.firmA}'`);
      assert.equal(stopped.rows[0].status,'suspended');
      await database.query(`select platform_manage_subscription('${ids.firmA}','accounting','active',now()+interval '1 month','reactivate','Customer renewed service')`);
      const visiblePlatformAudit=await database.query(`select action,firm_name as "firmName",actor_email as "actorEmail",reason from platform_list_subscription_actions(10) order by id`);
      assert.deepEqual(visiblePlatformAudit.rows.map((row)=>row.action),['suspend','reactivate']);
      assert.equal(visiblePlatformAudit.rows.every((row)=>row.firmName==='Firm A'&&row.actorEmail==='writer@example.test'&&row.reason.length>=3),true);
      await database.exec(`commit;reset role;`);
      const platformAudit=await database.query(`select action from platform_subscription_actions where firm_id='${ids.firmA}' order by id`);
      assert.deepEqual(platformAudit.rows.map((row)=>row.action),['suspend','reactivate']);
      await database.exec(`set role northledger_app;begin;select set_config('app.user_id','${ids.writer}',true);select set_config('app.firm_id','${ids.firmA}',true);select set_config('app.company_id','${ids.companyA}',true);`);
      const seatRequest=await database.query(`insert into firm_seat_change_requests(firm_id,requested_by,current_seat_limit,requested_seat_limit)
        values('${ids.firmA}','${ids.writer}',5,20)returning requested_seat_limit as "requestedSeatLimit",status`);
      assert.deepEqual(seatRequest.rows[0],{requestedSeatLimit:20,status:'pending'});
      const contact=await database.query(`insert into company_contacts(firm_id,company_id,contact_type,entity_type,display_name,created_by)
        values('${ids.firmA}','${ids.companyA}','customer','business','Invoice Client','${ids.writer}') returning id`);
      const customerId=contact.rows[0].id;
      const controls=await database.query(`select id,account_kind from accounts where company_id='${ids.companyA}'`);
      const account=(kind)=>controls.rows.find((row)=>row.account_kind===kind).id;
      const savings=await database.query(`insert into accounts(firm_id,company_id,name,account_type,account_kind)values('${ids.firmA}','${ids.companyA}','Savings','asset','bank')returning id`);
      const transferJournal=await database.query(`insert into journal_entries(firm_id,company_id,transaction_date,memo,source,created_by)values('${ids.firmA}','${ids.companyA}','2026-08-29','Bank transfer','bank_transfer','${ids.writer}')returning id`);
      await database.exec(`insert into journal_lines(firm_id,company_id,journal_entry_id,line_order,account_id,description,debit_cents,credit_cents)values
          ('${ids.firmA}','${ids.companyA}','${transferJournal.rows[0].id}',0,'${savings.rows[0].id}','Transfer',250000,0),
          ('${ids.firmA}','${ids.companyA}','${transferJournal.rows[0].id}',1,'${account('bank')}','Transfer',0,250000);
        update journal_entries set status='posted'where id='${transferJournal.rows[0].id}';
        insert into bank_transfers(firm_id,company_id,transfer_date,from_account_id,to_account_id,amount_cents,journal_entry_id,created_by)
          values('${ids.firmA}','${ids.companyA}','2026-08-29','${account('bank')}','${savings.rows[0].id}',250000,'${transferJournal.rows[0].id}','${ids.writer}');`);
      const transferBalance=await database.query(`select sum(debit_cents)::text as debits,sum(credit_cents)::text as credits from journal_lines where journal_entry_id='${transferJournal.rows[0].id}'`);
      assert.deepEqual(transferBalance.rows[0],{debits:'250000',credits:'250000'});
      const journal=await database.query(`insert into journal_entries(firm_id,company_id,transaction_date,reference,memo,source,created_by)
        values('${ids.firmA}','${ids.companyA}','2026-08-29','INV-1','Integration invoice','sales_invoice','${ids.writer}') returning id`);
      const journalId=journal.rows[0].id;
      const invoice=await database.query(`insert into sales_invoices(firm_id,company_id,customer_id,invoice_number,invoice_date,due_date,
        subtotal_cents,hst_cents,balance_cents,journal_entry_id,created_by) values('${ids.firmA}','${ids.companyA}','${customerId}',1,
        '2026-08-29','2026-09-28',10000,1300,11300,'${journalId}','${ids.writer}') returning id`);
      await database.exec(`
        insert into sales_invoice_lines(firm_id,company_id,invoice_id,line_number,description,quantity_milli,unit_price_cents,revenue_account_id,tax_code,base_cents,hst_cents)
        values('${ids.firmA}','${ids.companyA}','${invoice.rows[0].id}',1,'Consulting',1000,10000,'${account('sales')}','hst_13',10000,1300);
        insert into journal_lines(firm_id,company_id,journal_entry_id,line_order,account_id,description,debit_cents,credit_cents,tax_code) values
          ('${ids.firmA}','${ids.companyA}','${journalId}',0,'${account('accounts_receivable')}','Invoice 1',11300,0,null),
          ('${ids.firmA}','${ids.companyA}','${journalId}',1,'${account('sales')}','Consulting',0,10000,'hst_13'),
          ('${ids.firmA}','${ids.companyA}','${journalId}',2,'${account('hst_payable')}','HST collected',0,1300,'hst_13');
        update journal_entries set status='posted' where id='${journalId}';
      `);
      const posted=await database.query(`select je.status,sum(jl.debit_cents)::text as debits,sum(jl.credit_cents)::text as credits
        from journal_entries je join journal_lines jl on jl.journal_entry_id=je.id where je.id='${journalId}' group by je.status`);
      assert.deepEqual(posted.rows[0],{status:'posted',debits:'11300',credits:'11300'});
      await database.exec(`commit; reset role;`);

      await database.exec(`set role northledger_app; begin;
        select set_config('app.user_id','${ids.writer}',true);
        select set_config('app.firm_id','${ids.firmA}',true);
        select set_config('app.company_id','${ids.companyA}',true);`);
      const paymentJournal=await database.query(`insert into journal_entries(firm_id,company_id,transaction_date,memo,source,created_by)
        values('${ids.firmA}','${ids.companyA}','2026-08-30','Payment for invoice 1','customer_payment','${ids.writer}') returning id`);
      const paymentJournalId=paymentJournal.rows[0].id;
      await database.exec(`
        insert into customer_payments(firm_id,company_id,invoice_id,payment_date,amount_cents,bank_account_id,journal_entry_id,created_by)
        values('${ids.firmA}','${ids.companyA}','${invoice.rows[0].id}','2026-08-30',11300,'${account('bank')}','${paymentJournalId}','${ids.writer}');
        insert into journal_lines(firm_id,company_id,journal_entry_id,line_order,account_id,description,debit_cents,credit_cents) values
          ('${ids.firmA}','${ids.companyA}','${paymentJournalId}',0,'${account('bank')}','Payment',11300,0),
          ('${ids.firmA}','${ids.companyA}','${paymentJournalId}',1,'${account('accounts_receivable')}','Payment',0,11300);
        update journal_entries set status='posted' where id='${paymentJournalId}';
        update sales_invoices set balance_cents=0,status='paid' where id='${invoice.rows[0].id}';
      `);
      const paid=await database.query(`select status,balance_cents::text as balance from sales_invoices where id='${invoice.rows[0].id}'`);
      assert.deepEqual(paid.rows[0],{status:'paid',balance:'0'});
      await database.exec(`commit; reset role;`);

      await database.exec(`set role northledger_app; begin;
        select set_config('app.user_id','${ids.writer}',true);
        select set_config('app.firm_id','${ids.firmA}',true);
        select set_config('app.company_id','${ids.companyA}',true);`);
      const voidOriginal=await database.query(`insert into journal_entries(firm_id,company_id,transaction_date,reference,memo,source,created_by)
        values('${ids.firmA}','${ids.companyA}','2026-08-30','INV-2','Void test','sales_invoice','${ids.writer}') returning id`);
      const voidInvoiceRow=await database.query(`insert into sales_invoices(firm_id,company_id,customer_id,invoice_number,invoice_date,due_date,subtotal_cents,hst_cents,balance_cents,journal_entry_id,created_by)
        values('${ids.firmA}','${ids.companyA}','${customerId}',2,'2026-08-30','2026-09-29',5000,650,5650,'${voidOriginal.rows[0].id}','${ids.writer}') returning id`);
      await database.exec(`insert into sales_invoice_lines(firm_id,company_id,invoice_id,line_number,description,quantity_milli,unit_price_cents,revenue_account_id,tax_code,base_cents,hst_cents)
        values('${ids.firmA}','${ids.companyA}','${voidInvoiceRow.rows[0].id}',1,'Void service',1000,5000,'${account('sales')}','hst_13',5000,650);
        insert into journal_lines(firm_id,company_id,journal_entry_id,line_order,account_id,description,debit_cents,credit_cents) values
          ('${ids.firmA}','${ids.companyA}','${voidOriginal.rows[0].id}',0,'${account('accounts_receivable')}','Invoice 2',5650,0),
          ('${ids.firmA}','${ids.companyA}','${voidOriginal.rows[0].id}',1,'${account('sales')}','Void service',0,5000),
          ('${ids.firmA}','${ids.companyA}','${voidOriginal.rows[0].id}',2,'${account('hst_payable')}','HST',0,650);
        update journal_entries set status='posted' where id='${voidOriginal.rows[0].id}';`);
      const reversal=await database.query(`insert into journal_entries(firm_id,company_id,transaction_date,reference,memo,source,created_by)
        values('${ids.firmA}','${ids.companyA}','2026-08-30','VOID-INV-2','Duplicate','sales_invoice_void','${ids.writer}') returning id`);
      await database.exec(`insert into journal_lines(firm_id,company_id,journal_entry_id,line_order,account_id,description,debit_cents,credit_cents) values
          ('${ids.firmA}','${ids.companyA}','${reversal.rows[0].id}',0,'${account('accounts_receivable')}','Reverse invoice 2',0,5650),
          ('${ids.firmA}','${ids.companyA}','${reversal.rows[0].id}',1,'${account('sales')}','Reverse service',5000,0),
          ('${ids.firmA}','${ids.companyA}','${reversal.rows[0].id}',2,'${account('hst_payable')}','Reverse HST',650,0);
        update journal_entries set status='posted' where id='${reversal.rows[0].id}';
        update sales_invoices set status='voided',balance_cents=0,void_journal_entry_id='${reversal.rows[0].id}',voided_at=now(),voided_by='${ids.writer}',void_reason='Duplicate'
          where id='${voidInvoiceRow.rows[0].id}';`);
      const voidTax=await database.query(`select sum(base_cents)::text as base,sum(hst_cents)::text as hst from sales_tax_events where source_id='${voidInvoiceRow.rows[0].id}'`);
      assert.deepEqual(voidTax.rows[0],{base:'0',hst:'0'},'void event must reverse invoice HST without rewriting the original event');
      await database.exec(`commit; reset role;`);

      await database.exec(`set role northledger_app; begin;
        select set_config('app.user_id','${ids.writer}',true);
        select set_config('app.firm_id','${ids.firmA}',true);
        select set_config('app.company_id','${ids.companyA}',true);`);
      const vendor=await database.query(`insert into company_contacts(firm_id,company_id,contact_type,entity_type,display_name,created_by)
        values('${ids.firmA}','${ids.companyA}','vendor','business','Integration Vendor','${ids.writer}') returning id`);
      const billJournal=await database.query(`insert into journal_entries(firm_id,company_id,transaction_date,reference,memo,source,created_by)
        values('${ids.firmA}','${ids.companyA}','2026-08-30','BILL-1','Integration bill','vendor_bill','${ids.writer}') returning id`);
      const bill=await database.query(`insert into vendor_bills(firm_id,company_id,vendor_id,bill_number,vendor_invoice_number,bill_date,due_date,subtotal_cents,hst_cents,balance_cents,journal_entry_id,created_by)
        values('${ids.firmA}','${ids.companyA}','${vendor.rows[0].id}',1,'SUP-001','2026-08-30','2026-09-29',157500,20475,177975,'${billJournal.rows[0].id}','${ids.writer}') returning id`);
      await database.exec(`insert into vendor_bill_lines(firm_id,company_id,bill_id,line_number,description,expense_account_id,tax_code,base_cents,hst_cents)
          values('${ids.firmA}','${ids.companyA}','${bill.rows[0].id}',1,'Office supplies','${account('general_expense')}','hst_13',157500,20475);
        insert into journal_lines(firm_id,company_id,journal_entry_id,line_order,account_id,description,debit_cents,credit_cents) values
          ('${ids.firmA}','${ids.companyA}','${billJournal.rows[0].id}',0,'${account('general_expense')}','Office supplies',157500,0),
          ('${ids.firmA}','${ids.companyA}','${billJournal.rows[0].id}',1,'${account('hst_recoverable')}','HST recoverable',20475,0),
          ('${ids.firmA}','${ids.companyA}','${billJournal.rows[0].id}',2,'${account('accounts_payable')}','Vendor bill',0,177975);
        update journal_entries set status='posted' where id='${billJournal.rows[0].id}';`);
      const billPosting=await database.query(`select sum(debit_cents)::text as debits,sum(credit_cents)::text as credits from journal_lines where journal_entry_id='${billJournal.rows[0].id}'`);
      assert.deepEqual(billPosting.rows[0],{debits:'177975',credits:'177975'});
      const billTax=await database.query(`select event_type,base_cents::text as base,hst_cents::text as hst from sales_tax_events where source_id='${bill.rows[0].id}'`);
      assert.deepEqual(billTax.rows[0],{event_type:'itc_paid',base:'157500',hst:'20475'});
      const vendorPaymentJournal=await database.query(`insert into journal_entries(firm_id,company_id,transaction_date,memo,source,created_by)
        values('${ids.firmA}','${ids.companyA}','2026-08-31','Vendor payment','vendor_payment','${ids.writer}') returning id`);
      await database.exec(`insert into vendor_payments(firm_id,company_id,bill_id,payment_date,amount_cents,bank_account_id,journal_entry_id,created_by)
          values('${ids.firmA}','${ids.companyA}','${bill.rows[0].id}','2026-08-31',177975,'${account('bank')}','${vendorPaymentJournal.rows[0].id}','${ids.writer}');
        insert into journal_lines(firm_id,company_id,journal_entry_id,line_order,account_id,description,debit_cents,credit_cents) values
          ('${ids.firmA}','${ids.companyA}','${vendorPaymentJournal.rows[0].id}',0,'${account('accounts_payable')}','Pay bill',177975,0),
          ('${ids.firmA}','${ids.companyA}','${vendorPaymentJournal.rows[0].id}',1,'${account('bank')}','Pay bill',0,177975);
        update journal_entries set status='posted' where id='${vendorPaymentJournal.rows[0].id}';
        update vendor_bills set balance_cents=0,status='paid' where id='${bill.rows[0].id}';`);
      const paidBill=await database.query(`select status,balance_cents::text as balance from vendor_bills where id='${bill.rows[0].id}'`);
      assert.deepEqual(paidBill.rows[0],{status:'paid',balance:'0'});
      await database.exec(`commit; reset role;`);

      await database.exec(`set role northledger_app; begin;
        select set_config('app.user_id','${ids.writer}',true);
        select set_config('app.firm_id','${ids.firmA}',true);
        select set_config('app.company_id','${ids.companyA}',true);`);
      await assert.rejects(()=>database.query(`update sales_invoices set memo='silent rewrite' where id='${invoice.rows[0].id}'`),/invoice content is immutable/i);
      await database.exec(`rollback; reset role;`);

      await database.exec(`set role northledger_app; begin;
        select set_config('app.user_id','${ids.viewer}',true);
        select set_config('app.firm_id','${ids.firmA}',true);
        select set_config('app.company_id','${ids.companyA}',true);`);
      await assert.rejects(()=>database.query(`insert into company_contacts(firm_id,company_id,contact_type,display_name,created_by)
        values('${ids.firmA}','${ids.companyA}','customer','Blocked write','${ids.viewer}')`),/row-level security policy/i);
      await database.exec(`rollback; reset role;`);
    }finally{await database.close();}
  });
});
