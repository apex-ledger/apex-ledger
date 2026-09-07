import { describe, expect, it } from 'vitest';
import { canTransition, daysWaiting, filterApprovalRowsByPeriod, isPayable, summariseApprovals, type BillApprovalRow } from './billApproval';

function bill(overrides: Partial<BillApprovalRow> = {}): BillApprovalRow {
  return {
    id: 1,
    vendorName: 'Planeti Foods',
    billNumber: 'INV-88',
    billDate: '2025-03-01',
    dueDate: '2025-03-31',
    totalCents: 1_000_00,
    approvalStatus: 'pending',
    approvedBy: null,
    approvedAt: null,
    approvalNote: null,
    isPaid: false,
    ...overrides,
  };
}

describe('isPayable', () => {
  it('lets only an approved bill be paid', () => {
    // The one gate that matters. Everything else about approval is administration.
    expect(isPayable('approved')).toBe(true);
    expect(isPayable('pending')).toBe(false);
    expect(isPayable('rejected')).toBe(false);
    expect(isPayable('onHold')).toBe(false);
  });
});

describe('canTransition', () => {
  it('moves a waiting bill to any decision', () => {
    expect(canTransition('pending', 'approved')).toBe(true);
    expect(canTransition('pending', 'rejected')).toBe(true);
    expect(canTransition('pending', 'onHold')).toBe(true);
  });

  it('lets a rejected bill come back', () => {
    // Bills get rejected over a wrong amount and the supplier reissues. Locking it shut would force
    // delete-and-re-enter, which loses the record of the rejection — the thing worth keeping.
    expect(canTransition('rejected', 'approved')).toBe(true);
    expect(canTransition('rejected', 'pending')).toBe(true);
  });

  it('lets an approval be taken back', () => {
    expect(canTransition('approved', 'onHold')).toBe(true);
    expect(canTransition('approved', 'rejected')).toBe(true);
  });

  it('treats a move to the same state as no move', () => {
    expect(canTransition('approved', 'approved')).toBe(false);
    expect(canTransition('pending', 'pending')).toBe(false);
  });
});

describe('summariseApprovals', () => {
  it('counts and totals what is waiting', () => {
    const rows = [
      bill({ id: 1, totalCents: 1_000_00 }),
      bill({ id: 2, totalCents: 500_00 }),
      bill({ id: 3, approvalStatus: 'approved' }),
    ];
    const s = summariseApprovals(rows);

    expect(s.pendingCount).toBe(2);
    expect(s.pendingCents).toBe(1_500_00);
  });

  it('puts what needs acting on first, oldest at the top', () => {
    const rows = [
      bill({ id: 1, approvalStatus: 'approved', billDate: '2025-01-01' }),
      bill({ id: 2, approvalStatus: 'pending', billDate: '2025-03-01' }),
      bill({ id: 3, approvalStatus: 'pending', billDate: '2025-02-01' }),
    ];
    expect(summariseApprovals(rows).rows.map((r) => r.id)).toEqual([3, 2, 1]);
  });

  it('flags a bill paid without ever being approved', () => {
    // Not hypothetical: approval was added to a system where bills could always be paid, and bank
    // import matching can settle one without anyone looking at it.
    const rows = [bill({ approvalStatus: 'pending', isPaid: true })];
    expect(summariseApprovals(rows).paidWithoutApprovalCount).toBe(1);
  });

  it('does not flag a paid bill that was approved', () => {
    const rows = [bill({ approvalStatus: 'approved', isPaid: true })];
    expect(summariseApprovals(rows).paidWithoutApprovalCount).toBe(0);
  });

  it('counts held and rejected separately from waiting', () => {
    const rows = [
      bill({ id: 1, approvalStatus: 'onHold' }),
      bill({ id: 2, approvalStatus: 'rejected' }),
      bill({ id: 3, approvalStatus: 'pending' }),
    ];
    const s = summariseApprovals(rows);

    expect(s.onHoldCount).toBe(1);
    expect(s.rejectedCount).toBe(1);
    expect(s.pendingCount).toBe(1);
  });

  it('handles an empty list', () => {
    const s = summariseApprovals([]);
    expect(s.rows).toEqual([]);
    expect(s.pendingCents).toBe(0);
  });
});

describe('daysWaiting', () => {
  it('counts how long a bill has sat there', () => {
    // Three days is somebody's inbox; thirty is forgotten, and forgotten bills are how suppliers
    // stop delivering.
    expect(daysWaiting('2025-03-01', '2025-03-31')).toBe(30);
  });

  it('never reports a negative wait for a future-dated bill', () => {
    expect(daysWaiting('2025-06-01', '2025-03-31')).toBe(0);
  });
});

describe('filterApprovalRowsByPeriod', () => {
  it('includes both ends of the selected bill-date range', () => {
    const rows = [
      bill({ id: 1, billDate: '2025-01-31' }),
      bill({ id: 2, billDate: '2025-02-01' }),
      bill({ id: 3, billDate: '2025-02-28' }),
      bill({ id: 4, billDate: '2025-03-01' }),
    ];
    expect(filterApprovalRowsByPeriod(rows, '2025-02-01', '2025-02-28').map((row) => row.id)).toEqual([2, 3]);
  });
});
