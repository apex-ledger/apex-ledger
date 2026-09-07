import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/renderer/layout/Sidebar.tsx', import.meta.url), 'utf8');
const header = fs.readFileSync(new URL('../src/renderer/layout/Header.tsx', import.meta.url), 'utf8');
const reportsHub = fs.readFileSync(new URL('../src/renderer/features/reports/ReportsHubPage.tsx', import.meta.url), 'utf8');
const between = (start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`Could not locate sidebar section ${start}.`);
  return source.slice(from, to);
};
const labels = (text) => [...text.matchAll(/\{\s*label:\s*'([^']+)'/g)].map((match) => match[1]);

const main = labels(between('export const MAIN_NAV', 'export const BOOKKEEPING_NAV'));
const more = labels(between('export const BOOKKEEPING_NAV', 'export const ACCOUNTING_NAV'));
const all = [...main, ...more];
const requiredMain = [
  'Dashboard', 'Action Centre', 'Sales & Payments', 'Expenses & Bills', 'Banking & Accounting',
  'Chart of Accounts', 'Inventory', 'Payroll', 'Sales Tax (GST/HST)', 'Month-End Close', 'Business Tax & GIFI', 'Settings', 'Reports & Analytics',
];
const requiredImportant = [
  'Invoices', 'Customers', 'Vendor Bills', 'Vendors', 'Bank Transactions', 'Bank Reconciliation', 'Receipt Inbox',
  'File GST/HST Return', 'Journal Entries', 'General Ledger', 'For my accountant', 'Who owes you (A/R)', 'Whom we owe (A/P)', 'Audit exceptions',
];
const requiredMore = ['Access & Permissions', 'Calendar', 'Forms', 'Audit', 'Tools', 'User Guide', 'About'];
const failures = [];

if (!source.includes("label: 'Quick Entry'") || !source.includes("view: { kind: 'quickEntry', type: 'expense' }")) {
  failures.push('The standalone Quick Entry destination is missing.');
}
if (main.includes('Client Management (CRM)')) failures.push('Client Management (CRM) must not appear in the sidebar.');
const accountantCentreButton = 'label="Accountant Centre"';
const crmToolbarButton = 'label="Client Management (CRM)"';
if (!header.includes(crmToolbarButton) || !header.includes("setView({ kind: 'clientHub' })") || !header.includes("can('crm')")) {
  failures.push('Client Management (CRM) is missing from the top action row or is not correctly linked/gated.');
} else if (header.indexOf(crmToolbarButton) < header.indexOf(accountantCentreButton)) {
  failures.push('Client Management (CRM) must remain immediately after Accountant Centre in the top action row.');
}
const quickEntryButton = source.match(/<NavButton\s+[\s\S]*?item=\{QUICK_ENTRY_NAV_ITEM\}[\s\S]*?forceActive=\{currentView\.kind === 'quickEntry'\}[\s\S]*?emphasized[\s\S]*?\/>/);
const collapsibleNavigation = source.indexOf('<nav className="flex-1 overflow-y-auto');
if (!quickEntryButton || source.indexOf(quickEntryButton[0]) > collapsibleNavigation) {
  failures.push('Quick Entry is no longer a fixed, prominent button above the collapsible navigation.');
}
if (!/^  \{ label: 'Chart of Accounts'/m.test(source)) {
  failures.push('Chart of Accounts is not a directly visible top-level sidebar destination.');
}
if (!source.includes("if (active && nested) return 'bg-brand-100") || !source.includes("if (active) return 'bg-brand-800")) {
  failures.push('Sidebar tree hierarchy must keep the selected child light and its master tab dark.');
}

for (const label of requiredMain) if (!main.includes(label)) failures.push(`Essential main destination is missing: ${label}`);
for (const label of requiredImportant) if (!main.includes(label)) failures.push(`Important direct shortcut is missing: ${label}`);
for (const label of requiredMore) if (!more.includes(label)) failures.push(`More destination is missing: ${label}`);
for (const report of ['Accounts Receivable Ageing', 'Accounts Payable Ageing']) {
  if (!reportsHub.includes(`title: '${report}'`)) failures.push(`Ageing report is missing from Reports: ${report}`);
}

const before = (first, second) => main.indexOf(first) >= 0 && main.indexOf(first) < main.indexOf(second);
for (const [first, second] of [
  ['Invoices', 'Customers'],
  ['Vendor Bills', 'Vendors'],
  ['Sales & Payments', 'Expenses & Bills'],
  ['Expenses & Bills', 'Banking & Accounting'],
  ['Banking & Accounting', 'Month-End Close'],
  ['Month-End Close', 'Reports & Analytics'],
  ['Reports & Analytics', 'For my accountant'],
]) {
  if (!before(first, second)) failures.push(`Daily workflow order requires ${first} before ${second}.`);
}
if (main.at(-1) !== 'CPA year-end continuity') failures.push('Reports & Analytics and its report shortcuts must remain at the end of the main navigation.');

const duplicates = all.filter((label, index) => all.indexOf(label) !== index);
for (const label of [...new Set(duplicates)]) failures.push(`Exact sidebar label is duplicated: ${label}`);

if (!source.includes("if (view.kind === 'banking' && current.kind === 'banking') return view.tab === current.tab")) {
  failures.push('Banking shortcut active-state protection is missing.');
}
if (!source.includes("if (view.kind === 'sales' && current.kind === 'sales') return view.tab === current.tab")) {
  failures.push('Sales shortcut active-state protection is missing.');
}
if (!source.includes("if (view.kind === 'purchases' && current.kind === 'purchases') return view.tab === current.tab")) {
  failures.push('Purchases shortcut active-state protection is missing.');
}
if (!source.includes('setExpanded((prev) => (prev.has(label) ? new Set() : new Set([label])))')) {
  failures.push('Sidebar groups no longer enforce single-open accordion behaviour.');
}
if (!source.includes('setExpanded(owner ? new Set([owner]) : new Set())')) {
  failures.push('Sidebar groups no longer close or switch when the main destination changes.');
}

if (failures.length) {
  console.error('Sidebar completeness verification FAILED:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(2);
}

console.log('Sidebar completeness verification PASSED.');
console.log(` ${main.length} main destinations/shortcuts and ${more.length} More destinations preserved.`);
