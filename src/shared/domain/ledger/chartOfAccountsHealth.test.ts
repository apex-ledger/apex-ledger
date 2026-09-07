import { describe, expect, it } from 'vitest';
import { checkChartOfAccounts } from './chartOfAccountsHealth';
import type { Account } from '../types';

function account(overrides: Partial<Account>): Account {
  return {
    id: 1,
    code: '5000',
    name: 'Advertising',
    accountType: 'Expense',
    accountSubtype: 'Operating Expense',
    normalBalance: 'Debit',
    parentId: null,
    gifiCode: null,
    isActive: true,
    isSystem: false,
    description: null,
    accountNumber: null,
    isTransferEligible: false,
    ...overrides,
  };
}

function messages(accounts: Account[]): string[] {
  return checkChartOfAccounts(accounts).issues.map((i) => i.message);
}

describe('income filed as an expense', () => {
  it('is reported as an error', () => {
    // Found in a real file: "Other Income" typed as an Expense. Every amount posted to it both
    // understates income and overstates costs, so profit moves twice.
    const result = checkChartOfAccounts([account({ id: 1, code: '5218', name: 'Other Income' })]);

    expect(result.errorCount).toBe(1);
    expect(result.issues[0].message).toMatch(/money coming in/i);
  });

  it('catches a sales account on the wrong side', () => {
    expect(messages([account({ name: 'Sales Returns Account', accountType: 'Expense' })])).toEqual([]);
    expect(messages([account({ name: 'Consulting Revenue', accountType: 'Expense' })])).toHaveLength(1);
  });

  it('leaves a genuine revenue account alone', () => {
    expect(messages([account({ code: '4000', name: 'Service Revenue', accountType: 'Revenue', accountSubtype: 'Revenue', normalBalance: 'Credit' })])).toEqual([]);
  });

  it('does not flag a contra-revenue expense', () => {
    // "Customer Refunds & Returns" mentions neither income nor a capital item in a way that makes
    // it wrong — refunds sitting against revenue are normal.
    expect(messages([account({ name: 'Vendor Refunds & Rebates' })])).toEqual([]);
  });
});

describe('capital items booked as expenses', () => {
  it('flags an equipment account typed as an expense', () => {
    // Buying equipment is a balance-sheet event written off over years. As an expense it overstates
    // this year's costs and leaves the asset off the books entirely.
    const issues = checkChartOfAccounts([account({ name: 'Computer Equipment' })]).issues;
    expect(issues).toHaveLength(1);
    expect(issues[0].suggestion).toMatch(/capital assets/i);
  });

  it('flags vehicles and furniture the same way', () => {
    expect(messages([account({ name: 'Vehicles' })])).toHaveLength(1);
    expect(messages([account({ name: 'Furniture' })])).toHaveLength(1);
  });

  it('leaves the cost of USING an asset alone', () => {
    // These really are expenses even though they name the asset — flagging them would be noise,
    // and noise is how a checker gets ignored.
    for (const name of [
      'Equipment Rental',
      'Vehicle Lease',
      'Repairs & Maintenance - Equipment',
      'Equipment Insurance',
      // Plurals count: the real chart calls this one "Motor Vehicle Expenses", and matching only
      // the singular flagged it as a capital purchase.
      'Motor Vehicle Expenses',
      'Equipment Repairs',
      'Vehicle Costs',
    ]) {
      expect(messages([account({ name })]), name).toEqual([]);
    }
  });

  it('says nothing about equipment already held as an asset', () => {
    expect(
      messages([account({ code: '1700', name: 'Computer Equipment', accountType: 'Asset', accountSubtype: 'Capital Asset' })]),
    ).toEqual([]);
  });
});

describe('a sub-type that contradicts the type', () => {
  it('is reported', () => {
    // Found in a real file: an Expense account filed under sub-type "Revenue". Reports that group
    // by sub-type put it in the wrong section.
    const issues = checkChartOfAccounts([
      account({ code: '5217', name: 'Consulting / Professional Fees', accountSubtype: 'Revenue' }),
    ]).issues;
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/sub-type says "Revenue"/);
  });

  it('accepts a sub-type that agrees', () => {
    expect(messages([account({ accountSubtype: 'Cost of Sales' })])).toEqual([]);
  });

  it('accepts a blank sub-type', () => {
    expect(messages([account({ accountSubtype: null })])).toEqual([]);
  });
});

describe('duplicate accounts', () => {
  it('spots two accounts meaning the same thing', () => {
    // Found in a real file: a 5000-block and a 5200-block describing the same costs. Amounts get
    // split across both and neither total is right.
    const issues = checkChartOfAccounts([
      account({ id: 1, code: '5030', name: 'Interest & Bank Charges - Long-Term Debt' }),
      account({ id: 2, code: '5210', name: 'Interest & Bank Charges (Long-Term Debt)' }),
    ]).issues;

    expect(issues).toHaveLength(1);
    expect(issues[0].accountCode).toBe('5210');
  });

  it('matches regardless of word order and punctuation', () => {
    const issues = checkChartOfAccounts([
      account({ id: 1, code: '5050', name: 'Legal & Accounting Fees' }),
      account({ id: 2, code: '5211', name: 'Accounting, Legal Fees' }),
    ]).issues;
    expect(issues).toHaveLength(1);
  });

  it('reports the later code, keeping the original as the survivor', () => {
    const issues = checkChartOfAccounts([
      account({ id: 1, code: '5213', name: 'Rent' }),
      account({ id: 2, code: '5090', name: 'Rent' }),
    ]).issues;
    expect(issues[0].accountCode).toBe('5213');
  });

  it('does not treat the same name under different types as a duplicate', () => {
    // "Interest" as income and "Interest" as a cost are genuinely two different accounts.
    const issues = checkChartOfAccounts([
      account({ id: 1, code: '4900', name: 'Interest', accountType: 'Revenue', accountSubtype: 'Revenue', normalBalance: 'Credit' }),
      account({ id: 2, code: '5030', name: 'Interest' }),
    ]).issues;
    expect(issues).toEqual([]);
  });

  it('ignores an inactive duplicate, which is how one is retired', () => {
    const issues = checkChartOfAccounts([
      account({ id: 1, code: '5090', name: 'Rent' }),
      account({ id: 2, code: '5213', name: 'Rent', isActive: false }),
    ]).issues;
    expect(issues).toEqual([]);
  });
});

describe('a healthy chart', () => {
  it('reports nothing at all', () => {
    const result = checkChartOfAccounts([
      account({ id: 1, code: '1000', name: 'Chequing Account', accountType: 'Asset', accountSubtype: 'Cash and Bank' }),
      account({ id: 2, code: '1700', name: 'Computer Equipment', accountType: 'Asset', accountSubtype: 'Capital Asset' }),
      account({ id: 3, code: '2100', name: 'Accounts Payable', accountType: 'Liability', accountSubtype: 'Current Liability', normalBalance: 'Credit' }),
      account({ id: 4, code: '4000', name: 'Service Revenue', accountType: 'Revenue', accountSubtype: 'Revenue', normalBalance: 'Credit' }),
      account({ id: 5, code: '5000', name: 'Advertising' }),
    ]);

    expect(result.issues).toEqual([]);
    expect(result.errorCount).toBe(0);
  });

  it('handles an empty chart', () => {
    expect(checkChartOfAccounts([]).issues).toEqual([]);
  });
});

describe('ordering', () => {
  it('puts errors above warnings', () => {
    const result = checkChartOfAccounts([
      account({ id: 1, code: '5100', name: 'Computer Equipment' }),
      account({ id: 2, code: '5218', name: 'Other Income' }),
    ]);
    expect(result.issues[0].severity).toBe('error');
  });
});
