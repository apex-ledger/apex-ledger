import { describe, expect, it } from 'vitest';
import { ACCOUNTING_NAV, BOOKKEEPING_NAV, MAIN_NAV, expandedOwnerLabel, navToneClass, type NavItem } from './Sidebar';

/** The sidebar's shape, checked as data rather than as pixels.
 *
 * Two of the defects that reached the user came from here: Banking appearing twice after it was
 * added at the top level while still sitting inside a group, and children indenting the whole pill
 * so the column read as a zigzag. Both were visible in the nav definitions long before they were
 * visible on screen, which is where they are now caught.
 */

const ALL_SECTIONS: { name: string; items: NavItem[] }[] = [
  { name: 'main', items: MAIN_NAV },
  { name: 'bookkeeping', items: BOOKKEEPING_NAV },
  { name: 'accounting', items: ACCOUNTING_NAV },
];

function flatten(items: NavItem[]): NavItem[] {
  return items.flatMap((item) => [item, ...(item.children ?? [])]);
}

describe('every label appears exactly once', () => {
  it('within a section, counting children', () => {
    // Banking was once both a top-level row and a child of Transactions. It read as a duplicate,
    // because it was one.
    for (const section of ALL_SECTIONS) {
      const labels = flatten(section.items).map((i) => i.label);
      const seen = new Set<string>();
      const duplicated = labels.filter((l) => (seen.has(l) ? true : (seen.add(l), false)));
      expect(duplicated, `${section.name} repeats: ${duplicated.join(', ')}`).toEqual([]);
    }
  });

  it('across the whole sidebar', () => {
    const labels = ALL_SECTIONS.flatMap((s) => flatten(s.items)).map((i) => i.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('every entry goes somewhere', () => {
  it('has a label and a view', () => {
    for (const section of ALL_SECTIONS) {
      for (const item of flatten(section.items)) {
        expect(item.label.trim().length, `${section.name} has an unlabelled item`).toBeGreaterThan(0);
        expect(item.view, `${item.label} has no destination`).toBeTruthy();
        expect(typeof item.view.kind).toBe('string');
      }
    }
  });

  it('never points two entries at the same destination', () => {
    // Two rows that go to the same place is a menu that lies about how much it offers.
    const keyOf = (item: NavItem) => JSON.stringify(item.view);
    const keys = ALL_SECTIONS.flatMap((s) => flatten(s.items)).map(keyOf);
    const seen = new Set<string>();
    const duplicated = keys.filter((k) => (seen.has(k) ? true : (seen.add(k), false)));
    expect(duplicated).toEqual([]);
  });
});

describe('nesting stays one level deep', () => {
  it('has no grandchildren', () => {
    // The renderer only draws parents and their children. A third level would silently vanish.
    for (const section of ALL_SECTIONS) {
      for (const item of section.items) {
        for (const child of item.children ?? []) {
          expect(child.children, `${child.label} is nested too deep to render`).toBeUndefined();
        }
      }
    }
  });
});

describe('the canonical Ultimate navigation', () => {
  it('keeps every primary centre at the top level', () => {
    const topLevel = MAIN_NAV.map((i) => i.label);
    for (const essential of ['Sales & Payments', 'Expenses & Bills', 'Banking & Accounting', 'Chart of Accounts', 'Journal Entries', 'General Ledger', 'Inventory', 'Sales Tax (GST/HST)', 'Business Tax & GIFI', 'Reports & Analytics', 'Settings']) {
      expect(topLevel, `${essential} should be directly reachable`).toContain(essential);
    }
  });

  it('groups related tabs under the same work area', () => {
    const childrenOf = (label: string) => MAIN_NAV.find((item) => item.label === label)?.children?.map((item) => item.label) ?? [];
    expect(childrenOf('Sales & Payments')).toEqual(['All Sales', 'Invoices', 'Sales Receipts', 'Estimates', 'Sales Orders', 'Customers', 'Credit Notes', 'Deposits']);
    expect(childrenOf('Expenses & Bills')).toEqual(['Expense Transactions', 'Vendor Bills', 'Paid Bills', 'Vendors', 'Mileage']);
    expect(childrenOf('Banking & Accounting')).toEqual([
      'Client Overview',
      'Banking Overview',
      'Bank Transactions',
      'Receipt Inbox',
      'Bank Reconciliation',
    ]);
    expect(childrenOf('Reports & Analytics')).toEqual(['For my accountant', 'Who owes you (A/R)', 'Whom we owe (A/P)', 'Sales and customers', 'Expenses and vendors', 'Payroll reports', 'Audit exceptions', 'CPA year-end continuity']);
  });

  it('follows daily entry order and leaves reports until after bookkeeping is complete', () => {
    const labels = MAIN_NAV.map((item) => item.label);
    const position = (label: string) => labels.indexOf(label);

    expect(position('Sales & Payments')).toBeLessThan(position('Expenses & Bills'));
    expect(position('Expenses & Bills')).toBeLessThan(position('Banking & Accounting'));
    expect(position('Banking & Accounting')).toBeLessThan(position('Journal Entries'));
    expect(position('Banking & Accounting')).toBeLessThan(position('Chart of Accounts'));
    expect(position('Chart of Accounts')).toBeLessThan(position('Journal Entries'));
    expect(position('Journal Entries')).toBeLessThan(position('General Ledger'));
    expect(position('General Ledger')).toBeLessThan(position('Inventory'));
    expect(position('Banking & Accounting')).toBeLessThan(position('Month-End Close'));
    expect(position('Month-End Close')).toBeLessThan(position('Reports & Analytics'));
    expect(labels.at(-1)).toBe('Reports & Analytics');
  });

  it('uses the secondary section only for distinct supporting tools', () => {
    expect(BOOKKEEPING_NAV.map((item) => item.label)).toEqual(['Access & Permissions', 'Calendar', 'Forms', 'Audit', 'Tools', 'User Guide', 'Help & Tutor', "What's new", 'About']);
    expect(ACCOUNTING_NAV).toEqual([]);
  });
});

describe('sidebar tree colours', () => {
  it('keeps an active master dark and its selected child light', () => {
    expect(navToneClass(true, false, false)).toContain('bg-brand-800');
    expect(navToneClass(true, true, false)).toContain('bg-brand-100');
    expect(navToneClass(true, true, false)).not.toContain('bg-brand-800');
  });
});

describe('collapsible work areas', () => {
  it('opens only the group that owns the current destination', () => {
    expect(expandedOwnerLabel(MAIN_NAV, { kind: 'expenses' })).toBe('Expenses & Bills');
    expect(expandedOwnerLabel(MAIN_NAV, { kind: 'sales', tab: 'invoices' })).toBe('Sales & Payments');
    expect(expandedOwnerLabel(MAIN_NAV, { kind: 'report', report: 'cashFlow' })).toBe('Reports & Analytics');
  });

  it('closes all groups on standalone destinations', () => {
    expect(expandedOwnerLabel(MAIN_NAV, { kind: 'dashboard' })).toBeNull();
    expect(expandedOwnerLabel(MAIN_NAV, { kind: 'payroll' })).toBeNull();
    expect(expandedOwnerLabel(BOOKKEEPING_NAV, { kind: 'forms' })).toBeNull();
  });
});
