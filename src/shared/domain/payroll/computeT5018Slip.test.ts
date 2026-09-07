import { describe, expect, it } from 'vitest';
import { computeT5018Slip, computeT5018SlipsForYear } from './computeT5018Slip';
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
    name: 'Bob the Subcontractor',
    email: null,
    phone: null,
    address: null,
    notes: null,
    isActive: true,
    isT4aContractor: false,
    t4aSin: null,
    t4aBusinessNumber: null,
    isT5018Contractor: true,
    defaultExpenseAccountId: null,
    paymentTerms: null,
    ...overrides,
  };
}

describe('computeT5018Slip', () => {
  it('sums box 22 (gross, incl. tax) across paid bills in the tax year', () => {
    const vendor = makeVendor({ id: 1 });
    const bills = [makeBill({ vendorId: 1, billDate: '2026-03-10', amountCents: 100000 }), makeBill({ vendorId: 1, billDate: '2026-11-01', amountCents: 50000 })];
    const slip = computeT5018Slip(bills, vendor, 2026);
    expect(slip.totalPaymentsCents).toBe(150000);
  });

  it('excludes unpaid bills and bills from other years or vendors', () => {
    const vendor = makeVendor({ id: 1 });
    const bills = [
      makeBill({ vendorId: 1, billDate: '2026-03-10', status: 'unpaid' }),
      makeBill({ vendorId: 1, billDate: '2025-12-31' }),
      makeBill({ vendorId: 2, billDate: '2026-03-10' }),
    ];
    const slip = computeT5018Slip(bills, vendor, 2026);
    expect(slip.totalPaymentsCents).toBe(0);
  });
});

describe('computeT5018SlipsForYear', () => {
  it('includes only T5018-flagged vendors with at least $500 in paid bills that year, sorted by name', () => {
    const vendors = [
      makeVendor({ id: 1, name: 'Zed Contracting', isT5018Contractor: true }),
      makeVendor({ id: 2, name: 'Amy Drywall', isT5018Contractor: true }),
      makeVendor({ id: 3, name: 'Not Flagged', isT5018Contractor: false }),
      makeVendor({ id: 4, name: 'Flagged But No Bills', isT5018Contractor: true }),
    ];
    const bills = [
      makeBill({ vendorId: 1, billDate: '2026-01-01', amountCents: 60000 }),
      makeBill({ vendorId: 2, billDate: '2026-06-01', amountCents: 60000 }),
      makeBill({ vendorId: 3, billDate: '2026-01-01', amountCents: 60000 }),
    ];
    const slips = computeT5018SlipsForYear(bills, vendors, 2026);
    expect(slips.map((s) => s.vendorName)).toEqual(['Amy Drywall', 'Zed Contracting']);
  });

  it('excludes T5018-flagged vendors under the $500 CRA reporting threshold', () => {
    const vendors = [makeVendor({ id: 1, name: 'Small Job Co', isT5018Contractor: true })];
    const bills = [makeBill({ vendorId: 1, billDate: '2026-01-01', amountCents: 40000 })]; // $400 < $500
    const slips = computeT5018SlipsForYear(bills, vendors, 2026);
    expect(slips).toHaveLength(0);
  });
});
