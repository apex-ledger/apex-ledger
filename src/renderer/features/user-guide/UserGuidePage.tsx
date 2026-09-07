import type { ReactNode } from 'react';
import { BackButton } from '../../components/BackButton';
import { useUiStore } from '../../app/store/uiStore';

interface GuideSection {
  id: string;
  title: string;
}

const SECTIONS: GuideSection[] = [
  { id: 'demo', title: 'The demo company' },
  { id: 'coa', title: 'Chart of Accounts' },
  { id: 'quickentry', title: 'Quick Entry' },
  { id: 'bills', title: 'Bills' },
  { id: 'invoices', title: 'Invoices' },
  { id: 'payroll', title: 'Payroll' },
  { id: 'bank', title: 'Bank import & reconciliation' },
  { id: 'hst', title: 'GST/HST Centre' },
  { id: 'reports', title: 'Financial statements' },
  { id: 'shareholder', title: 'Shareholder transactions' },
  { id: 'backups', title: 'Backups & company files' },
  { id: 'reference', title: 'Quick reference' },
];

function Section({ id, num, title, lede, children }: { id: string; num: number; title: string; lede?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-3 border-t border-gray-200 pt-6 first:border-0 first:pt-0">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-sm text-gold-600">{String(num).padStart(2, '0')}</span>
        <h2 className="text-lg font-bold text-brand-900">{title}</h2>
      </div>
      {lede && <p className="mt-2 max-w-2xl text-sm text-gray-500">{lede}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="rounded border border-gray-200 bg-white p-3">
      {title && <h3 className="mb-2 text-sm font-bold text-gray-800">{title}</h3>}
      <div className="text-sm text-gray-700">{children}</div>
    </div>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-sm text-gray-700">
          <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand-700 text-[11px] font-bold text-white">{i + 1}</span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

function Callout({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-r border-l-4 border-gold-400 bg-gold-50 px-3 py-2 text-sm text-gold-900">
      <span className="font-bold text-gold-700">{label} — </span>
      {children}
    </div>
  );
}

function Ledger({ rows, totalLabel, totalDr, totalCr }: { rows: { name: string; dr?: string; cr?: string }[]; totalLabel?: string; totalDr?: string; totalCr?: string }) {
  return (
    <div className="overflow-hidden rounded border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
            <th className="px-3 py-1.5 text-left font-medium">Account</th>
            <th className="w-28 px-3 py-1.5 text-right font-medium">Debit</th>
            <th className="w-28 px-3 py-1.5 text-right font-medium">Credit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-gray-100">
              <td className="px-3 py-1.5">{r.name}</td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums text-brand-700">{r.dr ?? ''}</td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums text-gold-700">{r.cr ?? ''}</td>
            </tr>
          ))}
          {totalLabel && (
            <tr className="border-t border-gray-200 bg-gray-50 font-bold">
              <td className="px-3 py-1.5">{totalLabel}</td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums">{totalDr}</td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums">{totalCr}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto rounded border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
            {head.map((h, i) => (
              <th key={i} className={`px-3 py-1.5 font-medium ${i === 0 ? 'text-left' : 'text-right'}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-gray-100">
              {row.map((cell, j) => (
                <td key={j} className={`px-3 py-1.5 ${j === 0 ? '' : 'text-right font-mono tabular-nums'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Path({ children }: { children: ReactNode }) {
  return <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[13px] text-brand-800">{children}</code>;
}

export function UserGuidePage() {
  const setView = useUiStore((s) => s.setView);
  return (
    <div className="w-full">
      <BackButton fallback={{ kind: 'companySettings' }} fallbackLabel="Settings" className="mb-3" />
      <div className="mb-3 rounded border border-brand-200 bg-brand-50 p-3">
        <div className="text-xs font-bold uppercase tracking-wider text-gold-600">Getting started</div>
        <h1 className="mt-1 text-lg font-bold text-brand-900">Learning Apex Ledger by example</h1>
        <p className="mt-2 max-w-2xl text-sm text-brand-800">
          This guide walks through every part of the bookkeeping cycle — sales, expenses, HST, payroll, and financial statements — using a
          real worked example: <strong>Demo Company Inc.</strong>, a small Ontario professional-services corporation with a full 2025
          fiscal year already entered.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ['Revenue (2025)', '$363,176'],
            ['Net income', '$86,082'],
            ['HST net payable', '$40,331'],
            ['Payroll, 3 staff', '$202,800'],
          ].map(([label, value]) => (
            <div key={label} className="rounded border border-brand-200 bg-white px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
              <div className="font-mono text-base font-bold tabular-nums text-brand-700">{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-brand-100 hover:text-brand-800">
            {s.title}
          </a>
        ))}
      </div>

      <div className="space-y-10 rounded border border-gray-200 bg-white p-3">
        <Section id="demo" num={1} title="The demo company" lede="A complete, already-posted fiscal year you can click through instead of starting from a blank file.">
          <Card title="Open it">
            <Steps
              items={[
                'From the Welcome screen, choose Open Company File (or File → Open Company File).',
                <>
                  Browse to <Path>Documents\Ledgerly Books Clients\Demo Company Inc\Demo Company Inc.company</Path> and open it.
                </>,
              ]}
            />
          </Card>
          <p>Demo Company Inc. is a fictional Ontario consulting firm, GST/HST-registered, with three employees. Its 2025 books include:</p>
          <DataTable
            head={['Area', "What's in it"]}
            rows={[
              ['Sales', '24 client invoices (HST 13%) across 4 customers, plus 12 cash sales and quarterly bank interest'],
              [
                'Expenses',
                'Rent, telephone, utilities, insurance, software, meals & entertainment, motor vehicle, office supplies, legal/accounting, advertising, a US-vendor subscription, and inventory purchases — every HST treatment the software supports',
              ],
              ['Payroll', '3 salaried employees, biweekly, all 26 pay periods of 2025, with CPP/EI/income tax withheld automatically'],
              ['Shareholder activity', 'Initial share issuance, a loan to the shareholder, and two dividend payments'],
            ]}
          />
          <Callout label="Tip">Everything below references this company by name. Open it side-by-side with this guide and follow along on the real screens.</Callout>
        </Section>

        <Section id="coa" num={2} title="Chart of Accounts" lede="Every account the business uses to categorize money — where it's editable, and what's already there.">
          <p>
            Open it from the sidebar under <strong>Accounting → Chart of Accounts</strong>. Demo Company Inc. was created from the{' '}
            <strong>General / Professional Services</strong> template, which ships with a few accounts worth knowing about:
          </p>
          <DataTable
            head={['Account', 'Type', 'Why it exists']}
            rows={[
              ['GST/HST Recoverable', 'Asset', 'Holds Input Tax Credits (ITCs) from HST paid on purchases — see §8'],
              ['GST/HST Payable', 'Liability', 'Holds HST collected from customers, owed to CRA'],
              ['Loan to Shareholder', 'Asset', "Money the company has lent an owner — must generally be repaid within a year (s. 15(2))"],
              ['Due to Shareholder', 'Liability', 'Money an owner has lent the company'],
              ['Office Supplies / Office Expenses', 'Expense', 'Kept separate — supplies (paper, ink) vs. broader office costs'],
            ]}
          />
          <Card title="Adding or editing an account">
            <Steps
              items={[
                'Click + New Account, or click any existing account to edit it.',
                'Set the account type (Asset/Liability/Equity/Revenue/Expense) — this is locked once created, since every report depends on it.',
                'Name, subtype, and GIFI code are editable any time.',
              ]}
            />
          </Card>
          <Callout label="About GIFI codes">
            these map each account to a line on the CRA's T2 filing schedules. Codes shipped with this app are cross-checked against CRA's
            own published examples where possible; codes marked unverified in the Chart of Accounts are a starting point your accountant
            should confirm before filing.
          </Callout>
        </Section>

        <Section id="quickentry" num={3} title="Quick Entry — the everyday screen" lede="The fastest way to record a single sale, expense, or transfer — with tax split out properly, not buried in the total.">
          <p>
            Sidebar → <strong>Sales</strong> or <strong>Expenses</strong>. Every entry has the same shape:
          </p>
          <DataTable
            head={['Field', 'What it means']}
            rows={[
              ['Paid From / Deposited To', 'The real bank, cash, or credit-card account money moved through'],
              ['Category', 'The expense or income account this belongs to (★ marks categories suggested for your business type)'],
              ['Base Amount', 'The amount before tax'],
              ['Tax Treatment', 'HST 13%, US Tax 8%, No HST, Manual HST, or Meals & Entertainment (50% claimable)'],
              ['Tax Amount', 'Auto-filled from the base amount, always editable — type the real number off a receipt if it differs'],
              ['Total', 'Base + tax, computed for you'],
            ]}
          />
          <p>Worked example from the demo — office rent, paid from Chequing, HST included:</p>
          <Ledger
            rows={[
              { name: 'Rent / Lease', dr: '$2,200.00' },
              { name: 'GST/HST Recoverable', dr: '$286.00' },
              { name: 'Chequing Account', cr: '$2,486.00' },
            ]}
            totalLabel="Total"
            totalDr="$2,486.00"
            totalCr="$2,486.00"
          />
          <p>
            Rent lands in the <em>expense</em> account at its real pre-tax cost, and the HST goes to its own <em>recoverable</em> account —
            so the Profit and Loss Summary never overstates the expense, and the GST/HST Centre always has an exact number to work from.
          </p>
          <Callout label="Meals & Entertainment">
            CRA only allows a 50% Input Tax Credit on meals and client entertainment. Pick that tax treatment and the software
            automatically splits the HST: half to GST/HST Recoverable, half added back into the expense as a real, non-recoverable cost.
          </Callout>
          <p>After saving, the date and the money account stay put and the category field re-focuses — enter the next transaction for the same day immediately, spreadsheet-style.</p>
        </Section>

        <Section id="bills" num={4} title="Bills — money you owe" lede="For anything tracked against a specific vendor, with its own due date.">
          <p>
            Sidebar → <strong>Purchases → Enter Bill</strong>. Same Base + Tax fields as Quick Entry, plus a vendor and a due date. Saving
            posts immediately: Debit the expense category, Credit Accounts Payable. Paying it later (Purchases page → Pay) posts a second
            entry — Debit Accounts Payable, Credit your bank — without touching the original expense.
          </p>
          <p>In the demo, Bell Canada, Toronto Hydro, ABC Insurance, and the firm's accountant are all tracked this way — 24 bills a year for recurring vendors, so year-end totals per vendor are one click away.</p>
        </Section>

        <Section id="invoices" num={5} title="Invoices — money owed to you" lede="Bills a customer, tracks HST collected, and prints a real PDF.">
          <Steps
            items={[
              'Sidebar → Invoices → New Invoice. Pick a customer and add one line per item (description, quantity, unit price, revenue account, tax treatment).',
              'The footer shows Subtotal, GST/HST, and Total as you build the invoice.',
              'Save to post it — Debit Accounts Receivable for the full total, Credit each revenue account for its base amount, Credit GST/HST Payable for the tax.',
              'Download PDF, or email it straight from the invoice via Outlook/Gmail.',
            ]}
          />
          <p>When the customer pays, use <strong>Receive Payment</strong> — this moves the amount into Undeposited Funds — then <strong>Make Deposit</strong> to batch it into the real bank account, matching how the money actually lands on a bank statement.</p>
        </Section>

        <Section id="payroll" num={6} title="Payroll" lede="Three employees, biweekly, CPP/EI/income tax calculated automatically.">
          <Card title="Set up an employee once">
            <Steps items={['Sidebar → Payroll → Employees → + New Employee.', 'Province, pay type (hourly or salary), rate, and pay periods per year.', 'Leave the federal/provincial claim amounts blank to use the standard Basic Personal Amount — that\'s what all three demo employees use.']} />
          </Card>
          <Card title="Run a pay period">
            <Steps
              items={[
                'Payroll → Run Payroll, pick the employee and the pay period dates.',
                'Income tax is calculated automatically for supported provinces (ON, BC, AB, SK, MB, NB, NS) via the CRA\'s own formula — CPP and EI track year-to-date automatically too, so contributions stop exactly at the annual maximum.',
                'Save, then Post — this books one entry: wages + employer CPP/EI to expense, all withholdings to Payroll Remittances Payable, net pay out of the bank.',
              ]}
            />
          </Card>
          <p>
            Across 2025, the three demo employees together earned <strong className="font-mono tabular-nums">$202,800</strong> in gross +
            vacation pay across 78 pay runs (26 periods × 3 people), with <strong className="font-mono tabular-nums">$62,127</strong>{' '}
            withheld and remitted to CRA.
          </p>
          <p>
            Year-end: <strong>Payroll → Year-End Slips</strong> generates T4 slips + summary for employees, and T4A slips for contractors
            flagged on the Vendors page (Box 048, fees for services) — Northgate Freelance Design in the demo is set up this way.
          </p>
          <Callout label="Important">
            Apex Ledger payroll currently supports current-year payroll runs. Verify any prior-year payroll separately before posting.
          </Callout>
        </Section>

        <Section id="bank" num={7} title="Bank import & reconciliation" lede="Bring in a real bank statement instead of typing every line by hand.">
          <Steps
            items={[
              'Sidebar → Banking. Paste or upload a CSV export from your bank, or paste directly from Excel.',
              'Map columns once (date, description, amount) — the software remembers your mapping per account.',
              "Each row gets a suggested category (it learns from categories you've picked before for similar descriptions) and a tax treatment.",
              'Review, adjust any row, then Import — every row posts with tax split onto its own GST/HST line, same as Quick Entry.',
            ]}
          />
          <p>Once transactions are in, use <strong>Bank Reconciliation</strong> to tick off each line against your real monthly statement and confirm the ending balance matches.</p>
        </Section>

        <Section id="hst" num={8} title="GST/HST Centre" lede="Everything CRA will ask about GST/HST for a given period, in one place.">
          <p>
            Sidebar → <strong>GST/HST Centre</strong>. It reads directly off the GST/HST Payable and GST/HST Recoverable account activity, so
            the numbers always match what's actually posted in the ledger. Demo Company Inc.'s 2025 year:
          </p>
          <DataTable
            head={['Quarter', 'Collected', 'ITC', 'Net payable']}
            rows={[
              ['Q1', '$9,702.03', '$1,628.90', '$8,073.13'],
              ['Q2', '$14,011.14', '$1,838.85', '$12,172.29'],
              ['Q3', '$12,314.25', '$1,773.20', '$10,541.05'],
              ['Q4', '$11,163.36', '$1,619.15', '$9,544.21'],
              ['2025 total', '$47,190.78', '$6,860.10', '$40,330.68'],
            ]}
          />
          <p>
            <strong>Collected</strong> is HST charged to customers on sales. <strong>ITC</strong> (Input Tax Credit) is HST paid on
            purchases the business can claim back — reduced for Meals & Entertainment lines, which only contribute half.{' '}
            <strong>Net payable</strong> is what's actually owed CRA (Collected − ITC) for the period.
          </p>
          <Callout label="Filing">
            compare your actual filing frequency (monthly/quarterly/annual, set in Company Settings) against these figures, then record
            the remittance itself as a transfer: Debit GST/HST Payable, Credit your bank account, for the amount actually paid.
          </Callout>
        </Section>

        <Section id="reports" num={9} title="Financial statements" lede="Trial Balance, Profit and Loss Summary, and Balance Sheet — sidebar → Reports.">
          <Card title="Profit and Loss Summary — 2025-01-01 to 2025-12-31">
            <Ledger
              rows={[
                { name: 'Service Revenue', cr: '$356,896.00' },
                { name: 'Product Sales', cr: '$6,110.00' },
                { name: 'Interest Income', cr: '$170.00' },
              ]}
              totalLabel="Total Revenue"
              totalCr="$363,176.00"
            />
            <p className="mt-3 text-xs text-gray-500">
              Largest expense lines: Salaries, Wages &amp; Benefits <span className="font-mono tabular-nums">$218,727.90</span> · Rent{' '}
              <span className="font-mono tabular-nums">$26,400.00</span> · Legal &amp; Accounting{' '}
              <span className="font-mono tabular-nums">$6,000.00</span>
            </p>
            <div className="mt-3">
              <Ledger rows={[]} totalLabel="Net Income" totalCr="$86,082.08" />
            </div>
          </Card>

          <Card title="Balance Sheet — as of 2025-12-31">
            <Ledger
              rows={[
                { name: 'Chequing Account', dr: '$96,010.85' },
                { name: 'Savings Account', dr: '$170.00' },
                { name: 'Accounts Receivable', dr: '$17,748.91' },
                { name: 'GST/HST Recoverable', dr: '$6,860.10' },
                { name: 'Loan to Shareholder', dr: '$5,000.00' },
              ]}
              totalLabel="Total Assets"
              totalDr="$125,789.86"
            />
            <div className="mt-3">
              <Ledger
                rows={[
                  { name: 'Accounts Payable', cr: '$1,017.00' },
                  { name: 'GST/HST Payable', cr: '$47,190.78' },
                  { name: 'Common Shares', cr: '$1,500.00' },
                  { name: 'Dividends Declared', dr: '($10,000.00)' },
                  { name: 'Net Income to Date', cr: '$86,082.08' },
                ]}
                totalLabel="Total Liabilities + Equity"
                totalCr="$125,789.86"
              />
            </div>
            <p className="mt-3 text-xs font-bold text-brand-700">✓ Balanced — Assets exactly equal Liabilities + Equity, as every posted entry is required to.</p>
          </Card>

          <p>The Trial Balance (Reports → Trial Balance) lists every account's debit or credit balance as of a chosen date — useful as a sanity check before closing a period, or for handing to an external accountant.</p>
        </Section>

        <Section id="shareholder" num={10} title="Shareholder transactions" lede="Loans, dividends, and share capital — sidebar → Payroll → Shareholders.">
          <p>
            A shareholder loan (money the company advances to an owner) is entered as a transfer into the <strong>Loan to Shareholder</strong>{' '}
            asset account. CRA generally requires it be repaid within one year of the corporate year-end, or it becomes taxable income to
            the shareholder under s. 15(2) — the demo's $5,000 advance to Jordan Lee in May is exactly this kind of entry.
          </p>
          <p>
            Dividends are recorded from the Shareholders page: pick the shareholder, the type (eligible / non-eligible / interest), amount,
            and paying bank account. This posts Debit Dividends Declared, Credit the bank account, and feeds directly into T5 slip
            generation at year end.
          </p>
        </Section>

        <Section id="backups" num={11} title="Backups & company files" lede="Every company is one file. Losing it means losing the books, so back it up.">
          <ul className="list-disc space-y-1.5 pl-5">
            <li><strong>Automatic backups</strong> run daily and on quit, keeping the last 14 copies — no setup required.</li>
            <li><strong>Manual backup</strong> — the toolbar Backup button saves a copy without switching which file you're working in.</li>
            <li><strong>Save Company As…</strong> (File menu) makes a copy <em>and</em> switches you to editing it — useful for starting a new fiscal year from an existing file, or setting up a second client from a template.</li>
            <li>
              Each client gets its own folder under <Path>Documents\Ledgerly Books Clients\&lt;Client Name&gt;\</Path> automatically.
            </li>
          </ul>
        </Section>

        <Section id="reference" num={12} title="Quick reference">
          <DataTable
            head={['Task', 'Where']}
            rows={[
              ['Record a sale or expense', 'Sidebar → Sales / Expenses (Quick Entry)'],
              ['Bill a vendor', 'Sidebar → Purchases → Enter Bill'],
              ['Invoice a customer', 'Sidebar → Invoices → New Invoice'],
              ['Run payroll', 'Sidebar → Payroll → Run Payroll'],
              ['Import a bank statement', 'Sidebar → Banking'],
              ['Check what\'s owed to/from CRA', 'Sidebar → GST/HST Centre'],
              ['See the big picture', 'Sidebar → Reports → Profit and Loss Summary / Balance Sheet'],
              ['Add or edit a category', 'Sidebar → Chart of Accounts'],
              ['Multi-line manual entry', 'Sidebar → Journal Entries → New'],
            ]}
          />
        </Section>
      </div>
    </div>
  );
}
