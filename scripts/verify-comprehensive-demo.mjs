import path from 'node:path';
import { createRequire } from 'node:module';

const file = path.resolve('demo-companies', 'North Ledger Comprehensive Demo.company');
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const db = new DatabaseSync(file, { readOnly: true });
const failures = [];
const scalar = (sql, key = 'value') => db.prepare(sql).get()?.[key] ?? 0;
const requireCheck = (condition, message) => { if (!condition) failures.push(message); };

try {
  requireCheck(db.prepare('PRAGMA integrity_check').get()?.integrity_check === 'ok', 'SQLite integrity_check did not return ok.');

  const totals = db.prepare(`
    SELECT COALESCE(SUM(l.debit_cents), 0) AS debits, COALESCE(SUM(l.credit_cents), 0) AS credits
    FROM journal_entries e JOIN journal_entry_lines l ON l.journal_entry_id = e.id
    WHERE e.status = 'posted'
  `).get();
  requireCheck(totals.debits === totals.credits, `Trial balance is out by ${totals.debits - totals.credits} cents.`);

  const unbalanced = scalar(`
    SELECT COUNT(*) AS value FROM (
      SELECT e.id FROM journal_entries e JOIN journal_entry_lines l ON l.journal_entry_id = e.id
      WHERE e.status = 'posted' GROUP BY e.id HAVING SUM(l.debit_cents) <> SUM(l.credit_cents)
    )
  `);
  requireCheck(unbalanced === 0, `${unbalanced} posted journal entries are unbalanced.`);

  for (const [table, minimum, label] of [
    ['customers', 3, 'customers'], ['vendors', 3, 'vendors'], ['invoices', 2, 'invoices'],
    ['bills', 3, 'vendor bills'], ['invoice_payments', 1, 'customer payments'],
    ['bill_payments', 3, 'vendor payments'], ['payroll_runs', 1, 'payroll runs'],
  ]) {
    const count = scalar(`SELECT COUNT(*) AS value FROM ${table}`);
    requireCheck(count >= minimum, `Expected at least ${minimum} ${label}; found ${count}.`);
  }

  requireCheck(scalar(`SELECT COUNT(*) AS value FROM journal_entry_lines WHERE tax_code = 'HST13'`) > 0, 'No HST transactions found.');
  requireCheck(scalar(`SELECT COUNT(*) AS value FROM journal_entry_lines WHERE tax_code = 'NoHST'`) > 0, 'No non-HST transactions found.');
  requireCheck(scalar(`SELECT COUNT(*) AS value FROM bills WHERE paid_cents > 0 AND paid_cents < amount_cents`) > 0, 'No partial vendor payment found.');
  requireCheck(scalar(`SELECT COUNT(*) AS value FROM invoices WHERE paid_cents = total_cents`) > 0, 'No fully paid customer invoice found.');

  const arDocuments = scalar(`SELECT COALESCE(SUM(total_cents - paid_cents), 0) AS value FROM invoices`);
  const arLedger = scalar(`
    SELECT COALESCE(SUM(l.debit_cents - l.credit_cents), 0) AS value
    FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.journal_entry_id
    JOIN accounts a ON a.id = l.account_id WHERE e.status = 'posted' AND a.name = 'Accounts Receivable'
  `);
  requireCheck(arDocuments === arLedger, `A/R documents ${arDocuments} do not match ledger ${arLedger}.`);

  const apDocuments = scalar(`SELECT COALESCE(SUM(amount_cents - paid_cents), 0) AS value FROM bills`);
  const apLedger = scalar(`
    SELECT COALESCE(SUM(l.credit_cents - l.debit_cents), 0) AS value
    FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.journal_entry_id
    JOIN accounts a ON a.id = l.account_id WHERE e.status = 'posted' AND a.name = 'Accounts Payable'
  `);
  requireCheck(apDocuments === apLedger, `A/P documents ${apDocuments} do not match ledger ${apLedger}.`);

  const balances = db.prepare(`
    SELECT a.account_type AS type,
      SUM(CASE WHEN a.account_type IN ('Liability','Equity','Revenue')
        THEN l.credit_cents - l.debit_cents ELSE l.debit_cents - l.credit_cents END) AS amount
    FROM accounts a JOIN journal_entry_lines l ON l.account_id = a.id
    JOIN journal_entries e ON e.id = l.journal_entry_id WHERE e.status = 'posted'
    GROUP BY a.account_type
  `).all();
  const byType = new Map(balances.map((row) => [row.type, row.amount]));
  const assets = byType.get('Asset') ?? 0;
  const liabilities = byType.get('Liability') ?? 0;
  const equity = byType.get('Equity') ?? 0;
  const netIncome = (byType.get('Revenue') ?? 0) - (byType.get('Expense') ?? 0);
  requireCheck(assets === liabilities + equity + netIncome, `Balance Sheet equation fails: assets ${assets}, liabilities + equity + income ${liabilities + equity + netIncome}.`);
} finally {
  db.close();
}

if (failures.length) {
  console.error('Comprehensive demo accounting verification FAILED:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(2);
}

console.log('Comprehensive demo accounting verification PASSED.');
console.log(' SQLite integrity, double-entry, A/R, A/P, HST, payroll, payments, and Balance Sheet equation verified.');
