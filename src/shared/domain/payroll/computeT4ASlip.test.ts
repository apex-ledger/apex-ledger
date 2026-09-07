import { describe, expect, it } from 'vitest';
import { computeT4ASlip, computeT4ASlipsForYear } from './computeT4ASlip';
import type { Bill, Contact } from '../types';

let nextBillId = 1;
function makeBill(overrides: Partial<Bill>): Bill {
  nextBillId += 1;
  return {
    id: nextBillId,
    vendorId: 1,
    billNumber: null,
    billDate: '2026-03-10',
    dueDate: '2026-04-10',
    categoryAccountId: 1,
    amountCents: 100000,
    taxCode: null,
    manualHstCents: null,
    memo: null,
    status: 'paid',
    billJournalEntryId: 1,
    paymentJournalEntryId: 2,
    paidCents: 100000,
    balanceDueCents: 0,
    foreignCurrency: null,
    foreignAmountCents: null,
    exchangeRate: null,
    receiptFilePath: null,
    approvalStatus: 'approved',
    approvedBy: null,
    approvedAt: null,
    approvalNote: null,
    paymentTerms: null,
    ...overrides,
  };
}

function makeVendor(overrides: Partial<Contact>): Contact {
  return {
    id: 1,
    name: 'Bob the Contractor',
    email: null,
    phone: null,
    address: null,
    notes: null,
    isActive: true,
    isT4aContractor: true,
    t4aSin: null,
    t4aBusinessNumber: null,
    isT5018Contractor: false,
    defaultExpenseAccountId: null,
    paymentTerms: null,
    ...overrides,
  };
}

describe('computeT4ASlip', () => {
  it('sums box 048 across paid bills in the tax year', () => {
    const vendor = makeVendor({ id: 1 });
    const bills = [makeBill({ vendorId: 1, billDate: '2026-03-10', amountCents: 100000 }), makeBill({ vendorId: 1, billDate: '2026-11-01', amountCents: 50000 })];
    const slip = computeT4ASlip(bills, vendor, 2026);
    expect(slip.feesForServicesCents).toBe(150000);
  });

  it('excludes unpaid bills and bills from other years or vendors', () => {
    const vendor = makeVendor({ id: 1 });
    const bills = [
      makeBill({ vendorId: 1, billDate: '2026-03-10', status: 'unpaid' }),
      makeBill({ vendorId: 1, billDate: '2025-12-31' }),
      makeBill({ vendorId: 2, billDate: '2026-03-10' }),
    ];
    const slip = computeT4ASlip(bills, vendor, 2026);
    expect(slip.feesForServicesCents).toBe(0);
  });
});

describe('computeT4ASlipsForYear', () => {
  it('includes only T4A-flagged vendors with at least one paid bill that year, sorted by name', () => {
    const vendors = [
      makeVendor({ id: 1, name: 'Zed Contracting', isT4aContractor: true }),
      makeVendor({ id: 2, name: 'Amy Consulting', isT4aContractor: true }),
      makeVendor({ id: 3, name: 'Not Flagged', isT4aContractor: false }),
      makeVendor({ id: 4, name: 'Flagged But No Bills', isT4aContractor: true }),
    ];
    const bills = [makeBill({ vendorId: 1, billDate: '2026-01-01' }), makeBill({ vendorId: 2, billDate: '2026-06-01' }), makeBill({ vendorId: 3, billDate: '2026-01-01' })];
    const slips = computeT4ASlipsForYear(bills, vendors, 2026);
    expect(slips.map((s) => s.vendorName)).toEqual(['Amy Consulting', 'Zed Contracting']);
  });
});
