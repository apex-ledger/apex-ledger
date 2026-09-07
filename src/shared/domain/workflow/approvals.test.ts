import { describe, expect, it } from 'vitest';
import { approvalBlockReason, canApprove, canTransitionApproval, initialApprovalStatus } from './approvals';

describe('approvals', () => {
  it('starts pending only at or above a set threshold', () => {
    expect(initialApprovalStatus(150_000, null)).toBe('notRequired');
    expect(initialApprovalStatus(99_999, 100_000)).toBe('notRequired');
    expect(initialApprovalStatus(100_000, 100_000)).toBe('pending');
  });
  it('blocks pending and rejected documents with a reason', () => {
    expect(approvalBlockReason('notRequired', 'journal entry')).toBeNull();
    expect(approvalBlockReason('approved', 'journal entry')).toBeNull();
    expect(approvalBlockReason('pending', 'journal entry')).toMatch(/awaiting approval/);
    expect(approvalBlockReason('rejected', 'purchase order')).toMatch(/rejected/);
  });
  it('lets administrators and accountants decide, and only moves between pending, approved and rejected', () => {
    expect(canApprove('administrator')).toBe(true);
    expect(canApprove('accountant')).toBe(true);
    expect(canApprove('bookkeeper')).toBe(false);
    expect(canTransitionApproval('pending', 'approved')).toBe(true);
    expect(canTransitionApproval('rejected', 'approved')).toBe(true);
    expect(canTransitionApproval('notRequired', 'approved')).toBe(false);
    expect(canTransitionApproval('approved', 'approved')).toBe(false);
  });
});
