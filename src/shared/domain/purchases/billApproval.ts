/** Bill approval: the step between a vendor sending something and money leaving the account.
 *
 * Kept separate from whether the bill is paid. They answer different questions — has anyone agreed
 * to this, and has it been settled — and a bill spends most of its life "approved but unpaid",
 * which one combined field could not express.
 */

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'onHold';

export const APPROVAL_LABELS: Record<ApprovalStatus, string> = {
  pending: 'Awaiting approval',
  approved: 'Approved',
  rejected: 'Rejected',
  onHold: 'On hold',
};

/** Which states a bill can move to from where it is.
 *
 * Rejected is not a dead end: bills get rejected over a wrong amount, the vendor reissues, and
 * the same bill is then approved. Locking it shut would force people to delete and re-enter, which
 * loses the record of the rejection — the very thing worth keeping. */
const ALLOWED: Record<ApprovalStatus, ApprovalStatus[]> = {
  pending: ['approved', 'rejected', 'onHold'],
  onHold: ['approved', 'rejected', 'pending'],
  rejected: ['pending', 'approved'],
  approved: ['onHold', 'pending', 'rejected'],
};

export function canTransition(from: ApprovalStatus, to: ApprovalStatus): boolean {
  if (from === to) return false;
  return ALLOWED[from]?.includes(to) ?? false;
}

/** Whether a bill in this state should be paid.
 *
 * The only gate that matters. Everything else about approval is administration; this is the line
 * money should not cross. */
export function isPayable(status: ApprovalStatus): boolean {
  return status === 'approved';
}

export interface BillApprovalRow {
  id: number;
  vendorName: string;
  billNumber: string | null;
  billDate: string;
  dueDate: string | null;
  totalCents: number;
  approvalStatus: ApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalNote: string | null;
  isPaid: boolean;
}

export interface BillApprovalSummary {
  rows: BillApprovalRow[];
  pendingCount: number;
  pendingCents: number;
  onHoldCount: number;
  rejectedCount: number;
  /** Paid despite never being approved. Not a hypothetical: approval was added to a system where
   * bills could always be paid, and a bill can be paid by bank import matching without anyone
   * looking at it. Worth surfacing rather than leaving to be discovered. */
  paidWithoutApprovalCount: number;
}

/** Days a bill has been waiting, so the ones going stale are visible.
 *
 * A bill waiting three days is in someone's inbox; one waiting thirty is forgotten, and forgotten
 * bills are how vendors stop delivering. */
export function daysWaiting(billDate: string, asOfDate: string): number {
  const from = Date.parse(`${billDate}T00:00:00Z`);
  const to = Date.parse(`${asOfDate}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

export function summariseApprovals(rows: BillApprovalRow[]): BillApprovalSummary {
  return {
    rows: [...rows].sort(
      (a, b) =>
        // Waiting first — that is the list somebody has to act on — then oldest, since those are
        // the ones going stale.
        Number(b.approvalStatus === 'pending') - Number(a.approvalStatus === 'pending') ||
        a.billDate.localeCompare(b.billDate) ||
        a.id - b.id,
    ),
    pendingCount: rows.filter((r) => r.approvalStatus === 'pending').length,
    pendingCents: rows.filter((r) => r.approvalStatus === 'pending').reduce((sum, r) => sum + r.totalCents, 0),
    onHoldCount: rows.filter((r) => r.approvalStatus === 'onHold').length,
    rejectedCount: rows.filter((r) => r.approvalStatus === 'rejected').length,
    paidWithoutApprovalCount: rows.filter((r) => r.isPaid && r.approvalStatus !== 'approved').length,
  };
}

export function filterApprovalRowsByPeriod(rows: BillApprovalRow[], periodStart: string, periodEnd: string): BillApprovalRow[] {
  return rows.filter((row) => row.billDate >= periodStart && row.billDate <= periodEnd);
}
