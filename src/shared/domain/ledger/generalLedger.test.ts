import { describe, expect, it } from 'vitest';
import { LEDGER_ENTRY_GROUP_LABELS, ledgerEntryGroup } from './generalLedger';

describe('which side of the books a ledger line came from', () => {
  it('separates what sales raised from what bills raised from what somebody keyed by hand', () => {
    for (const type of ['Invoice', 'Customer Payment', 'Sales Receipt', 'Deposit', 'Customer Credit', 'Customer Refund']) {
      expect(ledgerEntryGroup(type), type).toBe('sales');
    }
    for (const type of ['Bill', 'Bill Payment', 'Vendor Credit', 'Vendor Refund', 'Mileage Claim', 'Inventory Receipt']) {
      expect(ledgerEntryGroup(type), type).toBe('purchases');
    }
    // Keyed rather than raised from a document: neither has an invoice or a bill behind it.
    expect(ledgerEntryGroup('Journal Entry')).toBe('manual');
    expect(ledgerEntryGroup('Quick Entry')).toBe('manual');
    expect(ledgerEntryGroup('Payroll')).toBe('payrollTax');
    expect(ledgerEntryGroup('GST/HST Filing')).toBe('payrollTax');
    expect(ledgerEntryGroup('Bank Import')).toBe('banking');
  });

  it('puts an unrecognised type in Other rather than losing the line', () => {
    expect(ledgerEntryGroup('Something Added Next Year')).toBe('other');
    expect(ledgerEntryGroup('')).toBe('other');
  });

  it('labels every group, so no filter button can render blank', () => {
    for (const group of ['sales', 'purchases', 'manual', 'payrollTax', 'banking', 'other'] as const) {
      expect(LEDGER_ENTRY_GROUP_LABELS[group]).toBeTruthy();
    }
  });
});
