import { describe, expect, it } from 'vitest';
import { ACCOUNT_PRESETS, KNOWN_SUBTYPES, findPreset, presetsForAccountType } from './accountPresets';

describe('account presets', () => {
  it('never stores a subtype the rest of the app does not understand', () => {
    // This is the whole point of the two-level design. A preset that stored "Chequing" as the
    // subtype would create an account that is invisible to the cash-flow statement and to every
    // "Paid From" picker, while looking perfectly correct on screen.
    for (const preset of ACCOUNT_PRESETS) {
      expect(KNOWN_SUBTYPES).toContain(preset.subtype);
    }
  });

  it('files every bank-like account under Cash and Bank', () => {
    // The label is what the user recognises; the subtype is what makes it count as cash.
    for (const label of ['Chequing account', 'Savings account', 'Cash on hand / petty cash', 'Trust account']) {
      expect(findPreset('Asset', label)?.subtype).toBe('Cash and Bank');
    }
  });

  it('marks the accounts money actually moves between as transfer-eligible', () => {
    expect(findPreset('Asset', 'Chequing account')?.transferEligible).toBe(true);
    expect(findPreset('Liability', 'Credit card')?.transferEligible).toBe(true);
    // A capital asset is not something you transfer money into.
    expect(findPreset('Asset', 'Equipment')?.transferEligible).toBeUndefined();
  });

  it('offers presets for all five account types', () => {
    for (const type of ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'] as const) {
      expect(presetsForAccountType(type).length).toBeGreaterThan(0);
      // and never leaks one type's presets into another's list
      expect(presetsForAccountType(type).every((p) => p.accountType === type)).toBe(true);
    }
  });

  it('has no duplicate label within an account type', () => {
    for (const type of ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'] as const) {
      const labels = presetsForAccountType(type).map((p) => p.label);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it('separates cost of sales from operating expenses', () => {
    expect(findPreset('Expense', 'Cost of goods sold')?.subtype).toBe('Cost of Sales');
    expect(findPreset('Expense', 'Rent')?.subtype).toBe('Operating Expense');
  });

  it('puts long-term borrowing where the cash-flow statement calls it financing', () => {
    expect(findPreset('Liability', 'Bank loan')?.subtype).toBe('Long-Term Liability');
    expect(findPreset('Liability', 'Accounts payable')?.subtype).toBe('Current Liability');
  });

  it('returns nothing for a label that belongs to a different type', () => {
    expect(findPreset('Expense', 'Chequing account')).toBeUndefined();
  });
});
