import { describe, expect, it } from 'vitest';
import { applyAccountTypeMapping, getCsvHeaders, guessAccountTypeMapping, parseAccountsCsvPreview } from './parseAccountsCsv';

const SAMPLE_CSV = [
  'Account Name,Type,Description',
  'Chequing Account,Bank,Main operating account',
  'Accounts Receivable (A/R),Accounts Receivable (A/R),',
  'Office Equipment,Fixed Assets,',
  'Visa,Credit Card,',
  'Accounts Payable (A/P),Accounts Payable (A/P),',
  "Owner's Equity,Equity,",
  'Sales,Income,',
  'Cost of Goods Sold,Cost of Goods Sold,',
  'Office Supplies,Expenses,',
  ',Expenses,Blank name row — should be skipped',
].join('\n');

describe('getCsvHeaders', () => {
  it('returns the header row', () => {
    expect(getCsvHeaders(SAMPLE_CSV)).toEqual(['Account Name', 'Type', 'Description']);
  });
});

describe('parseAccountsCsvPreview', () => {
  it('extracts accounts and collects distinct raw types', () => {
    const result = parseAccountsCsvPreview(SAMPLE_CSV, { nameColumn: 'Account Name', typeColumn: 'Type', descriptionColumn: 'Description' });
    expect(result.accounts).toHaveLength(9); // the blank-name row is skipped
    expect(result.accounts[0]).toEqual({ name: 'Chequing Account', rawType: 'Bank', description: 'Main operating account' });
    expect(result.distinctTypes).toContain('Bank');
    expect(result.distinctTypes).toContain('Credit Card');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/missing account name/i);
  });

  it('treats a null description column as always null', () => {
    const result = parseAccountsCsvPreview(SAMPLE_CSV, { nameColumn: 'Account Name', typeColumn: 'Type', descriptionColumn: null });
    expect(result.accounts[0].description).toBeNull();
  });
});

describe('guessAccountTypeMapping', () => {
  it('maps common QuickBooks Online type labels to the right AccountType/subtype', () => {
    expect(guessAccountTypeMapping('Bank')).toEqual({ accountType: 'Asset', accountSubtype: 'Cash and Bank' });
    expect(guessAccountTypeMapping('Accounts Receivable (A/R)')).toEqual({ accountType: 'Asset', accountSubtype: 'Current Asset' });
    expect(guessAccountTypeMapping('Fixed Assets')).toEqual({ accountType: 'Asset', accountSubtype: 'Capital Asset' });
    expect(guessAccountTypeMapping('Credit Card')).toEqual({ accountType: 'Liability', accountSubtype: 'Credit Card' });
    expect(guessAccountTypeMapping('Accounts Payable (A/P)')).toEqual({ accountType: 'Liability', accountSubtype: 'Current Liability' });
    expect(guessAccountTypeMapping('Long Term Liabilities')).toEqual({ accountType: 'Liability', accountSubtype: 'Long-Term Liability' });
    expect(guessAccountTypeMapping('Equity')).toEqual({ accountType: 'Equity', accountSubtype: 'Equity' });
    expect(guessAccountTypeMapping('Income')).toEqual({ accountType: 'Revenue', accountSubtype: 'Revenue' });
    expect(guessAccountTypeMapping('Cost of Goods Sold')).toEqual({ accountType: 'Expense', accountSubtype: 'Cost of Sales' });
    expect(guessAccountTypeMapping('Expenses')).toEqual({ accountType: 'Expense', accountSubtype: 'Operating Expense' });
  });

  it('falls back to Expense/Operating Expense for an unrecognized label', () => {
    expect(guessAccountTypeMapping('Some Weird Custom Type')).toEqual({ accountType: 'Expense', accountSubtype: 'Operating Expense' });
  });
});

describe('applyAccountTypeMapping', () => {
  it('resolves each account using the supplied mapping', () => {
    const parsed = parseAccountsCsvPreview(SAMPLE_CSV, { nameColumn: 'Account Name', typeColumn: 'Type', descriptionColumn: 'Description' });
    const mapping = Object.fromEntries(parsed.distinctTypes.map((t) => [t, guessAccountTypeMapping(t)]));
    const resolved = applyAccountTypeMapping(parsed.accounts, mapping);
    const visa = resolved.find((a) => a.name === 'Visa');
    expect(visa).toEqual({ name: 'Visa', accountType: 'Liability', accountSubtype: 'Credit Card', description: null });
  });

  it('falls back to Expense/Operating Expense for a raw type missing from the mapping', () => {
    const resolved = applyAccountTypeMapping([{ name: 'Mystery Account', rawType: 'Unmapped Type', description: null }], {});
    expect(resolved[0]).toEqual({ name: 'Mystery Account', accountType: 'Expense', accountSubtype: 'Operating Expense', description: null });
  });
});
