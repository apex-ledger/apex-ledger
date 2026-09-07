import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const root = process.cwd();
const outputDir = path.join(root, 'demo-companies');
const output = path.join(outputDir, 'North Ledger Comprehensive Demo.company');
fs.mkdirSync(outputDir, { recursive: true });
for (const suffix of ['', '-wal', '-shm']) if (fs.existsSync(output + suffix)) fs.rmSync(output + suffix);

const db = new Database(output);
db.pragma('foreign_keys = ON');
const migrationDir = path.join(root, 'src', 'main', 'db', 'migrations');
for (const name of fs.readdirSync(migrationDir).filter((n) => /^\d+.*\.sql$/.test(n)).sort()) {
  db.exec(fs.readFileSync(path.join(migrationDir, name), 'utf8'));
  db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES (?)').run(Number(name.slice(0, 4)));
}

const insert = (table, values) => {
  const keys = Object.keys(values);
  const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`;
  return Number(db.prepare(sql).run(...keys.map((k) => values[k])).lastInsertRowid);
};

const accountIds = new Map();
const account = (code, name, type, subtype, normal, system = 0) => {
  const id = insert('accounts', {
    code, name, account_type: type, account_subtype: subtype, normal_balance: normal,
    parent_id: null, gifi_code: null, is_active: 1, is_system: system, description: 'Comprehensive demo account',
  });
  accountIds.set(code, id);
  return id;
};

db.transaction(() => {
  insert('company_info', {
    id: 1, legal_name: 'North Ledger Comprehensive DEMO Inc.', display_name: 'Comprehensive DEMO',
    fiscal_year_end_month: 12, fiscal_year_end_day: 31, base_currency: 'CAD', business_number: '123456789RC0001',
    business_type: 'general_services', hst_number: '123456789RT0001', payroll_number: '123456789RP0001',
    number_of_employees: 1, business_address_line1: '100 Demo Street', business_address_line2: null,
    business_city: 'Toronto', business_province: 'ON', business_postal_code: 'M5V 2T6',
  });

  account('1000', 'Chequing Account', 'Asset', 'Bank', 'Debit', 1);
  account('1100', 'Accounts Receivable', 'Asset', 'Accounts Receivable', 'Debit', 1);
  account('1200', 'GST/HST Recoverable', 'Asset', 'Other Current Asset', 'Debit', 1);
  account('2000', 'Accounts Payable', 'Liability', 'Accounts Payable', 'Credit', 1);
  account('2100', 'GST/HST Payable', 'Liability', 'Other Current Liability', 'Credit', 1);
  account('2200', 'Payroll Remittances Payable', 'Liability', 'Other Current Liability', 'Credit', 1);
  account('3000', 'Common Shares', 'Equity', 'Share Capital', 'Credit', 1);
  account('4000', 'Consulting Revenue', 'Revenue', 'Service Revenue', 'Credit');
  account('4100', 'Other Revenue — Non-HST', 'Revenue', 'Other Revenue', 'Credit');
  account('5000', 'Rent / Lease', 'Expense', 'Occupancy', 'Debit');
  account('5100', 'Telephone and Internet', 'Expense', 'Utilities', 'Debit');
  account('5200', 'Insurance', 'Expense', 'Insurance', 'Debit');
  account('5300', 'Office Supplies', 'Expense', 'Office Expenses', 'Debit');
  account('6000', 'Wages and Salaries', 'Expense', 'Payroll', 'Debit');
  account('6100', 'Employer Payroll Taxes', 'Expense', 'Payroll', 'Debit');

  const customerHst = insert('customers', { name: 'Maple Consulting Group', email: 'accounts@maple.example', phone: '416-555-0101', address: '25 King Street, Toronto ON', notes: 'HST customer — pays invoice in full', is_active: 1, payment_terms: 'Net 30' });
  const customerNoHst = insert('customers', { name: 'Northern Community Association', email: 'treasurer@northern.example', phone: '705-555-0130', address: '8 Lake Road, Sudbury ON', notes: 'Non-HST customer — open receivable', is_active: 1, payment_terms: 'Net 15' });
  const walkIn = insert('customers', { name: 'Walk-in Customer', email: null, phone: null, address: null, notes: 'Immediate no-HST receipt example', is_active: 1, payment_terms: 'Due on receipt' });
  const landlord = insert('vendors', { name: 'Harbour Property Management', email: 'billing@harbour.example', phone: '416-555-0200', address: '200 Front Street, Toronto ON', notes: 'Monthly rent with HST', is_active: 1, default_expense_account_id: accountIds.get('5000'), payment_terms: 'Net 15' });
  const insurer = insert('vendors', { name: 'Dominion Business Insurance', email: 'service@dominion.example', phone: '800-555-0210', address: '40 Bay Street, Toronto ON', notes: 'Insurance — no HST', is_active: 1, default_expense_account_id: accountIds.get('5200'), payment_terms: 'Due on receipt' });
  const telecom = insert('vendors', { name: 'Metro Telecom', email: 'business@metro.example', phone: '888-555-0220', address: '50 Yonge Street, Toronto ON', notes: 'Telephone bill with HST; partially paid', is_active: 1, default_expense_account_id: accountIds.get('5100'), payment_terms: 'Net 30' });

  const journal = (date, memo, reference, lines) => {
    const id = insert('journal_entries', { entry_date: date, memo, reference, status: 'posted', posted_at: `${date} 12:00:00`, created_by: 'Demo Seed', source: 'manual', source_reference: reference });
    lines.forEach((line, index) => insert('journal_entry_lines', {
      journal_entry_id: id, account_id: accountIds.get(line.code), debit_cents: line.dr ?? 0, credit_cents: line.cr ?? 0,
      description: line.description ?? memo, line_order: index, tax_code: line.tax ?? null,
      manual_hst_cents: null, vendor_id: line.vendor ?? null, customer_id: line.customer ?? null,
      base_cents: line.base ?? null,
    }));
    return id;
  };

  journal('2026-01-02', 'Owner investment to open the company', 'OPEN-001', [{ code: '1000', dr: 5000000 }, { code: '3000', cr: 5000000 }]);

  const inv1Je = journal('2026-01-10', 'HST consulting invoice to Maple Consulting Group', 'INV-1001', [
    { code: '1100', dr: 1130000, customer: customerHst }, { code: '4000', cr: 1000000, tax: 'HST13', base: 1000000, customer: customerHst }, { code: '2100', cr: 130000, tax: 'HST13', customer: customerHst },
  ]);
  const inv1 = insert('invoices', { customer_id: customerHst, invoice_number: 'INV-1001', invoice_date: '2026-01-10', due_date: '2026-02-09', memo: 'Professional services — HST 13%', total_cents: 1130000, status: 'paid', invoice_journal_entry_id: inv1Je, paid_cents: 1130000, payment_terms: 'Net 30', payment_account_id: accountIds.get('1000') });
  insert('invoice_lines', { invoice_id: inv1, line_order: 0, description: 'January advisory engagement', quantity: 1, unit_price_cents: 1000000, amount_cents: 1000000, revenue_account_id: accountIds.get('4000'), tax_code: 'HST13', manual_hst_cents: null });
  const inv1PayJe = journal('2026-02-05', 'Payment received for INV-1001', 'RCPT-1001', [{ code: '1000', dr: 1130000, customer: customerHst }, { code: '1100', cr: 1130000, customer: customerHst }]);
  db.prepare('UPDATE invoices SET payment_journal_entry_id=? WHERE id=?').run(inv1PayJe, inv1);
  insert('invoice_payments', { invoice_id: inv1, payment_date: '2026-02-05', amount_cents: 1130000, money_account_id: accountIds.get('1000'), journal_entry_id: inv1PayJe, deposit_id: null, memo: 'Electronic payment received in full' });

  const inv2Je = journal('2026-02-12', 'Non-HST training invoice', 'INV-1002', [{ code: '1100', dr: 300000, customer: customerNoHst }, { code: '4100', cr: 300000, tax: 'NoHST', base: 300000, customer: customerNoHst }]);
  const inv2 = insert('invoices', { customer_id: customerNoHst, invoice_number: 'INV-1002', invoice_date: '2026-02-12', due_date: '2026-02-27', memo: 'Exempt community training', total_cents: 300000, status: 'unpaid', invoice_journal_entry_id: inv2Je, paid_cents: 0, payment_terms: 'Net 15', payment_account_id: null });
  insert('invoice_lines', { invoice_id: inv2, line_order: 0, description: 'Community training workshop — no HST', quantity: 1, unit_price_cents: 300000, amount_cents: 300000, revenue_account_id: accountIds.get('4100'), tax_code: 'NoHST', manual_hst_cents: null });

  const srJe = journal('2026-02-15', 'Immediate no-HST sale', 'SR-1001', [{ code: '1000', dr: 75000, customer: walkIn }, { code: '4100', cr: 75000, tax: 'NoHST', base: 75000, customer: walkIn }]);
  const sr = insert('sales_receipts', { customer_id: walkIn, receipt_number: 'SR-1001', receipt_date: '2026-02-15', memo: 'Cash workshop materials — no HST', total_cents: 75000, deposit_to_account_id: accountIds.get('1000'), journal_entry_id: srJe, deposit_id: null });
  insert('sales_receipt_lines', { sales_receipt_id: sr, line_order: 0, description: 'Workshop materials', quantity: 1, unit_price_cents: 75000, amount_cents: 75000, revenue_account_id: accountIds.get('4100'), tax_code: 'NoHST', manual_hst_cents: null });

  const addBill = (vendor, date, due, category, base, tax, memo, paid) => {
    const hst = tax === 'HST13' ? Math.round(base * 0.13) : 0;
    const total = base + hst;
    const billJe = journal(date, memo, `BILL-${date}-${vendor}`, [{ code: category, dr: base, tax, base, vendor }, ...(hst ? [{ code: '1200', dr: hst, tax, vendor }] : []), { code: '2000', cr: total, vendor }]);
    const bill = insert('bills', { vendor_id: vendor, bill_date: date, due_date: due, category_account_id: accountIds.get(category), amount_cents: total, tax_code: tax, manual_hst_cents: null, memo, status: paid >= total ? 'paid' : 'unpaid', bill_journal_entry_id: billJe, payment_journal_entry_id: null, paid_cents: paid, approval_status: 'approved', approved_by: 'Demo Manager', approved_at: `${date} 15:00:00`, payment_terms: 'Net 30' });
    if (paid > 0) {
      const payJe = journal(due, `Vendor payment — ${memo}`, `VPAY-${bill}`, [{ code: '2000', dr: paid, vendor }, { code: '1000', cr: paid, vendor }]);
      insert('bill_payments', { bill_id: bill, payment_date: due, amount_cents: paid, bank_account_id: accountIds.get('1000'), journal_entry_id: payJe, memo: paid < total ? 'Partial vendor payment' : 'Paid in full' });
      db.prepare('UPDATE bills SET payment_journal_entry_id=? WHERE id=?').run(payJe, bill);
    }
  };
  addBill(landlord, '2026-01-31', '2026-02-15', '5000', 200000, 'HST13', 'January office rent with HST', 226000);
  addBill(insurer, '2026-02-01', '2026-02-01', '5200', 120000, 'NoHST', 'Annual business insurance — no HST', 120000);
  addBill(telecom, '2026-02-20', '2026-03-22', '5100', 20000, 'HST13', 'Telephone and internet with HST', 10000);

  const employee = insert('employees', { name: 'Alex Morgan', province: 'ON', pay_type: 'Salary', hourly_rate_cents: null, annual_salary_cents: 6500000, pay_periods_per_year: 26, vacation_pay_rate: 0.04, sin_last_four: '1234', sin: '000000000', is_active: 1, federal_total_claim_cents: null, provincial_total_claim_cents: null, additional_tax_cents: null, address_line1: '15 Example Avenue', address_line2: null, address_city: 'Toronto', address_province: 'ON', address_postal_code: 'M4B 1B3' });
  const payrollJe = journal('2026-02-27', 'Biweekly payroll — Alex Morgan', 'PAY-2026-02-27', [{ code: '6000', dr: 500000 }, { code: '6100', dr: 41200 }, { code: '2200', cr: 169200 }, { code: '1000', cr: 372000 }]);
  insert('payroll_runs', { employee_id: employee, pay_period_start: '2026-02-09', pay_period_end: '2026-02-22', pay_date: '2026-02-27', regular_hours: null, overtime_hours: null, regular_pay_cents: 500000, overtime_pay_cents: 0, gross_pay_cents: 500000, vacation_pay_cents: 0, cpp1_employee_cents: 30000, cpp1_employer_cents: 30000, cpp2_employee_cents: 0, cpp2_employer_cents: 0, ei_employee_cents: 8000, ei_employer_cents: 11200, income_tax_cents: 90000, net_pay_cents: 372000, status: 'posted', journal_entry_id: payrollJe });

  journal('2026-02-28', 'Office supplies paid immediately with HST', 'EXP-1001', [{ code: '5300', dr: 10000, tax: 'HST13', base: 10000 }, { code: '1200', dr: 1300, tax: 'HST13' }, { code: '1000', cr: 11300 }]);
})();

const imbalance = db.prepare(`SELECT je.id FROM journal_entries je JOIN journal_entry_lines l ON l.journal_entry_id=je.id GROUP BY je.id HAVING SUM(l.debit_cents)<>SUM(l.credit_cents)`).all();
if (imbalance.length) throw new Error(`Unbalanced demo journals: ${imbalance.map((r) => r.id).join(', ')}`);
db.pragma('wal_checkpoint(TRUNCATE)');
db.close();
console.log(output);
