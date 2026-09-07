import type { AccessRole } from '../access';

/**
 * Approval workflow — a second pair of eyes before a large manual journal entry posts or a large
 * purchase order goes out. Bills already carry their own approval; this brings journals and
 * purchase orders to the same standard, with one queue for the approver. Thresholds are per
 * company and optional: a threshold of null means the document type never needs approval.
 */
export type ApprovalStatus = 'notRequired' | 'pending' | 'approved' | 'rejected';
export type ApprovalKind = 'journal' | 'purchaseOrder' | 'bill';

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  notRequired: 'No approval needed',
  pending: 'Awaiting approval',
  approved: 'Approved',
  rejected: 'Rejected',
};

/** Roles allowed to approve. Bookkeepers prepare; administrators and accountants approve. */
export const APPROVER_ROLES: AccessRole[] = ['administrator', 'accountant'];

export function canApprove(role: AccessRole): boolean {
  return APPROVER_ROLES.includes(role);
}

/** The status a freshly saved document starts with. Re-saving an approved document above the
 * threshold sends it back for approval only when the amount changed — handled by the caller. */
export function initialApprovalStatus(amountCents: number, thresholdCents: number | null | undefined): ApprovalStatus {
  if (thresholdCents === null || thresholdCents === undefined) return 'notRequired';
  return amountCents >= thresholdCents ? 'pending' : 'notRequired';
}

/** Why the document cannot proceed (post, send), or null if it can. */
export function approvalBlockReason(status: ApprovalStatus, what: string): string | null {
  if (status === 'pending') return `This ${what} is above the approval threshold and is awaiting approval. An administrator or accountant must approve it first.`;
  if (status === 'rejected') return `This ${what} was rejected by the approver. Read the note, correct it, and resubmit.`;
  return null;
}

export function canTransitionApproval(from: ApprovalStatus, to: ApprovalStatus): boolean {
  if (from === 'notRequired') return false;
  if (to === 'notRequired') return false;
  if (from === to) return false;
  return true;
}

export interface ApprovalQueueItem {
  kind: ApprovalKind;
  id: number;
  date: string;
  title: string;
  detail: string;
  amountCents: number;
  requestedBy: string | null;
  status: ApprovalStatus;
}
