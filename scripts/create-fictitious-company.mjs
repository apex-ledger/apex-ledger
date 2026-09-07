// Builds the fictitious test company by launching the app in its private seed mode, so every
// record goes through the real handlers. Writes:
//   demo-companies/Northwind Bookkeeping Test Co.company   (bundled into the installer)
//   docs/TEST-COMPANY-EXPECTED-RESULTS.md                  (what each screen should show)
//
//   npm run build && node scripts/create-fictitious-company.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const companyPath = path.join(root, 'demo-companies', 'Northwind Bookkeeping Test Co.company');
const resultPath = path.join(root, '.seed-result.json');
const docPath = path.join(root, 'docs', 'TEST-COMPANY-EXPECTED-RESULTS.md');
const electron = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
if (!fs.existsSync(electron)) { console.error('electron.exe not found under node_modules.'); process.exit(2); }
if (!fs.existsSync(path.join(root, 'dist-electron', 'main', 'index.js'))) { console.error('Run npm run build first.'); process.exit(2); }
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(companyPath + suffix, { force: true });
fs.rmSync(resultPath, { force: true });
fs.mkdirSync(path.dirname(companyPath), { recursive: true });

const env = { ...process.env, NORTH_LEDGER_TEST_BUILD: '1' };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
const launched = spawnSync(electron, ['.', `--apex-seed-company=${companyPath}`, `--apex-seed-result=${resultPath}`], { cwd: root, env, encoding: 'utf8', timeout: 240_000, windowsHide: true });
if (launched.error) { console.error('launch failed:', launched.error.message); process.exit(2); }
if (!fs.existsSync(resultPath)) { console.error('no seed result written. exit', launched.status, '\n', launched.stderr?.slice(-2000)); process.exit(2); }
const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
// Creating the company takes its daily safety copy into demo-companies/Backups; that folder must
// not ride along into the installer.
fs.rmSync(path.join(root, 'demo-companies', 'Backups'), { recursive: true, force: true });
fs.rmSync(resultPath, { force: true });
if (!result.ok) { console.error('SEED FAILED:\n' + result.error); process.exit(2); }

const e = result.expected;
const money = (cents) => `$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const rows = (list, cols) => ['| ' + cols.join(' | ') + ' |', '|' + cols.map(() => '---').join('|') + '|', ...list.map((r) => '| ' + cols.map((c) => r[c.toLowerCase()] ?? r[c] ?? '').join(' | ') + ' |')].join('\n');
const doc = `# ${result.company} — what every screen should show

Generated ${new Date().toISOString().slice(0, 10)} by \`scripts/create-fictitious-company.mjs\` from the numbers the app
itself produced while building the company. Open the company (Welcome → *Open test company*, or
File → Open → \`Northwind Bookkeeping Test Co.company\`) and check each screen against this sheet.
Every figure below was computed by the same code the report screens run, so a mismatch is a bug in
the screen, not in the sheet.

## The company

Bookkeeping / accounting firm in Toronto, ON, HST registrant, fiscal year ending December 31.
Activity runs January to August 2026. Three sign-ins are set up (Users & Access): Alex Admin,
Priya Accountant, Jordan Bookkeeper — switch between them from the dropdown in the green bar.

| Records | Count |
|---|---|
${Object.entries(result.counts).map(([k, v]) => `| ${k} | ${v} |`).join('\n')}

## Sales → Customers / Invoices

Open invoices (**${e.accountsReceivable.count}**, total **${money(e.accountsReceivable.totalCents)}**) — Reports → Accounts Receivable Ageing must agree:

${rows(e.accountsReceivable.invoices, ['number', 'due', 'balance'])}

- **INV-1001** paid in full straight to Chequing on 2026-02-20.
- **INV-1002** paid into Undeposited Funds, then banked in the 2026-03-21 deposit with sales receipt SR-2002.
- **INV-1003** partly paid ($300.00 of $565.00); the payment is still in Undeposited Funds — *Make Deposit* must offer it.
- **INV-1004** sold 2 Receipt Scanner Kits from stock — Items & Prices must show the quantity going out, and P&L must carry their cost.
- **INV-1005** HST-exempt training for the non-profit, due on receipt, unpaid → overdue.
- **INV-1006** the T2 return: $200.00 of credit note CN-0001 applied, $100.00 of it refunded to Spruce on 2026-07-12, then $1,000.00 received; balance still open.
- **INV-1007** August bookkeeping, not yet due.
- **Credit note CN-0001** should read *refunded*, with "Undo Settlement" available; its journal links should open.

## Purchases → Bills / Vendors

Open bills (**${e.accountsPayable.count}**, total **${money(e.accountsPayable.totalCents)}**) — Reports → Accounts Payable Ageing must agree:

${rows(e.accountsPayable.bills, ['number', 'due', 'balance'])}

- Rent is billed monthly Jan–Aug; Jan–Jul are paid, **RENT-2026-08** is open.
- **STP-44810** had vendor credit **VC-0001** ($56.50) applied against it — Bills & payments on Staples should show it settled by credit, not cash.
- **HYD-2026-Q2** is partly paid ($200.00 of $508.50).
- **STP-MEAL-1** used the Meals code — only half the HST is claimable; the other half sits in the expense.
- **PO-4001** was received into stock (5 kits) and matched to supplier invoice **AMZ-80211**; **PO-4002** was converted straight to bill **STP-51022**; **PO-4003** is still open.

## Payroll

${e.payroll.postedRuns} posted runs (gross **${money(e.payroll.grossPaidCents)}**), ${e.payroll.draftRuns} draft — Kim's April run is waiting to be posted from the Payroll screen.
Sam Patel is hourly (75 h a fortnight at $28.00), Kim Nguyen is salaried ($60,000 monthly-paid). PD7A for January–March must show CPP/EI/tax matching the paystubs.

## Inventory

Receipt Scanner Kit on hand: **${e.inventory.receiptScannerKitsOnHand}** (10 bought on AMZ-77120 − 2 sold on INV-1004 + 5 received on PO-4001).

## Banking

| Account | Balance at 2026-08-31 |
|---|---|
| Chequing Account | ${e.bankBalances.chequing} |
| Savings Account | ${e.bankBalances.savings} |
| Undeposited Funds | ${e.bankBalances.undepositedFunds} |

Undeposited Funds should equal exactly INV-1003's $300.00 partial payment.

## Sales tax (HST Centre)

Q1 2026 has been **filed** on 2026-04-20 and paid from Chequing; Q2 is ready to file; Q3 is in progress.
Posting a taxed entry dated inside Q1 must be refused with "Reopen that return".

${rows(e.gstHst, ['period', 'collected', 'itcs', 'net'])}

## Reports

| Report | Expected |
|---|---|
| Trial Balance (${e.trialBalance.asOf}) | debits ${e.trialBalance.totalDebits} = credits ${e.trialBalance.totalCredits} — ${e.trialBalance.balanced ? 'balanced' : 'NOT BALANCED'} |
| Profit and Loss (${e.profitAndLoss.period}) | revenue ${e.profitAndLoss.revenue}, cost of sales ${e.profitAndLoss.costOfSales}, expenses ${e.profitAndLoss.operatingExpenses}, **net income ${e.profitAndLoss.netIncome}** |
| Balance Sheet (${e.balanceSheet.asOf}) | assets ${e.balanceSheet.assets} = liabilities ${e.balanceSheet.liabilities} + equity ${e.balanceSheet.equity} — ${e.balanceSheet.equation ? 'balances' : 'DOES NOT BALANCE'} |

## Things to try that must be refused

- Pay INV-1003 with a date before 2026-03-10 → "a payment cannot precede the document it settles".
- Deactivate Maple Consulting Group → refused, it has an unpaid invoice.
- Create a bill for Spruce Retail as a vendor → not offered; add a vendor with the name "Bell Canada" → duplicate refused.
- Run payroll for Sam for 2026-01-01 to 2026-01-14 again → duplicate period refused.
- Post a journal with an HST line dated 2026-02-15 → filed-return lock.
- Apply more of a credit than remains → refused with the remaining amount.

## Things that should just work

- Ctrl+K: type \`1003\`, \`Bell\`, \`kit\`, \`Sam\`, \`ageing\` — each finds its record.
- Receive Payment from the toolbar → pick Birch & Co. → INV-1003 appears with $265.00 due.
- Customers → *Invoices & payments* on Maple shows three invoices and two payments with the journal links.
- Invoice editor for a firm shows the Services rail with priced services (T1 $250.00, Monthly Bookkeeping $400.00, T2 $1,500.00).
- Users & Access → Sign-in history shows the current session.
`;
fs.mkdirSync(path.dirname(docPath), { recursive: true });
fs.writeFileSync(docPath, doc, 'utf8');
console.log(`Test company written: ${companyPath}`);
console.log(`Expected results: ${docPath}`);
console.log(JSON.stringify({ counts: result.counts, trialBalance: e.trialBalance, balanceSheet: e.balanceSheet }, null, 1));
