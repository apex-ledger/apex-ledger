import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();

function source(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function expectBefore(relativePath: string, primaryAction: string, laterControl: string) {
  const text = source(relativePath);
  expect(text, `${primaryAction} must exist in ${relativePath}`).toContain(primaryAction);
  expect(text, `${laterControl} must exist in ${relativePath}`).toContain(laterControl);
  expect(text.indexOf(primaryAction), `${primaryAction} must be placed first at the left in ${relativePath}`).toBeLessThan(text.indexOf(laterControl));
}

describe('page action placement', () => {
  it('keeps sales and accounting creation actions before filters and secondary actions', () => {
    expectBefore('src/renderer/features/invoices/InvoicesPage.tsx', '+ New Invoice', 'Make Deposit');
    expectBefore('src/renderer/features/sales-receipts/SalesReceiptsPage.tsx', '+ New Sales Receipt', 'Make Deposit');
    expectBefore('src/renderer/features/credit-notes/CreditNotesPage.tsx', "New {kind === 'customer' ? 'Credit Note'", "(['customer', 'vendor']");
    expectBefore('src/renderer/features/journal-entries/JournalEntryListPage.tsx', '+ New Journal Entry', 'All statuses');
    expectBefore('src/renderer/features/chart-of-accounts/ChartOfAccountsPage.tsx', '+ New Account', 'Search accounts…');
  });

  it('keeps report actions before their date criteria', () => {
    expectBefore('src/renderer/features/reports/GifiExportPage.tsx', 'Export Excel', 'Fiscal period');
    expectBefore('src/renderer/features/reports/ChequeRegisterPage.tsx', '+ Fill a Cheque', '>From</label>');
  });

  it('does not push primary page actions to the far right', () => {
    expect(source('src/renderer/features/credit-notes/CreditNotesPage.tsx')).not.toContain('className="ml-auto rounded-full bg-brand-100');
    expect(source('src/renderer/features/journal-entries/JournalEntryListPage.tsx')).not.toContain('className="ml-auto rounded-full bg-brand-50');
    expect(source('src/renderer/features/chart-of-accounts/ChartOfAccountsPage.tsx')).not.toContain('className="ml-auto rounded-full bg-gray-100');
    expect(source('src/renderer/features/invoices/InvoiceEditorPage.tsx')).not.toContain('className="ml-auto flex items-center gap-2"');
  });

  it('keeps contact, bill, and user creation on the heading row, not on a row of their own', () => {
    // One convention for the three pages: the heading block and the actions share one flex row
    // (heading left, actions right), instead of the actions stacking beneath in an `mt-2` row —
    // a full extra band of empty height on every page. Checking the row, not a button's colour
    // classes, is what "on the heading row" actually means.
    for (const page of ['contacts/ContactsPage.tsx', 'purchases/PurchasesPage.tsx', 'access-permissions/AccessPermissionsPage.tsx']) {
      const text = source(`src/renderer/features/${page}`);
      expect(text, page).toContain('className="flex flex-wrap items-center justify-between gap-3"');
      expect(text, page).not.toContain('className="mt-2 flex flex-wrap items-center gap-2"');
    }
  });
});
