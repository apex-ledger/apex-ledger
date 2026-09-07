import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BillApprovalPage } from './BillApprovalPage';
import { mockApi } from '../../test/setup';

/** The approval screen, rendered.
 *
 * The domain logic for approval was written and tested first, but a passing domain test says
 * nothing about whether anybody can reach it. That is exactly the gap that made inventory posting
 * unreachable while every one of its tests passed.
 */

function row(overrides: Record<string, unknown> = {}) {
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

function withReport(rows: ReturnType<typeof row>[], extra: Record<string, unknown> = {}) {
  mockApi('bills', 'approvalReport', {
    rows,
    pendingCount: rows.filter((r) => r.approvalStatus === 'pending').length,
    pendingCents: rows.filter((r) => r.approvalStatus === 'pending').reduce((s, r) => s + r.totalCents, 0),
    onHoldCount: rows.filter((r) => r.approvalStatus === 'onHold').length,
    rejectedCount: rows.filter((r) => r.approvalStatus === 'rejected').length,
    paidWithoutApprovalCount: rows.filter((r) => r.isPaid && r.approvalStatus !== 'approved').length,
    asOfDate: '2025-03-31',
    ...extra,
  });
}

describe('acting on a bill', () => {
  it('offers the decisions a waiting bill can actually take', async () => {
    withReport([row()]);
    render(<BillApprovalPage />);

    await waitFor(() => expect(screen.getByText('Planeti Foods')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hold' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  });

  it('does not offer a move the bill cannot make', async () => {
    // An approved bill cannot be approved again; offering it would be a button that errors.
    withReport([row({ approvalStatus: 'approved' })]);
    render(<BillApprovalPage />);

    await waitFor(() => expect(screen.getByText('Planeti Foods')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  it('sends the approval through', async () => {
    withReport([row()]);
    render(<BillApprovalPage />);

    await waitFor(() => expect(screen.getByText('Planeti Foods')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).api.bills.setApproval).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, approvalStatus: 'approved' }),
    );
  });

  it('will not reject without a reason', async () => {
    // A rejection nobody can explain later is the one somebody gets asked about.
    withReport([row()]);
    vi.spyOn(window, 'prompt').mockReturnValue('');
    render(<BillApprovalPage />);

    await waitFor(() => expect(screen.getByText('Planeti Foods')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).api.bills.setApproval).not.toHaveBeenCalled();
  });

  it('carries the reason with a rejection', async () => {
    withReport([row()]);
    vi.spyOn(window, 'prompt').mockReturnValue('Wrong amount');
    render(<BillApprovalPage />);

    await waitFor(() => expect(screen.getByText('Planeti Foods')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).api.bills.setApproval).toHaveBeenCalledWith(
      expect.objectContaining({ approvalStatus: 'rejected', note: 'Wrong amount' }),
    );
  });
});

describe('what the screen has to surface', () => {
  it('says when a bill was paid without ever being approved', async () => {
    // Bank import matching can settle a bill without anyone looking at it, so this is a real state
    // and not a hypothetical one.
    withReport([row({ isPaid: true, approvalStatus: 'pending' })]);
    render(<BillApprovalPage />);

    expect(await screen.findByText(/paid without ever being approved/i)).toBeInTheDocument();
  });

  it('stays quiet when every paid bill was approved', async () => {
    withReport([row({ isPaid: true, approvalStatus: 'approved' })]);
    render(<BillApprovalPage />);

    await waitFor(() => expect(screen.getByText('Planeti Foods')).toBeInTheDocument());
    expect(screen.queryByText(/paid without ever being approved/i)).not.toBeInTheDocument();
  });

  it('shows how long a bill has been waiting', async () => {
    withReport([row({ billDate: '2025-03-01' })]);
    render(<BillApprovalPage />);

    expect(await screen.findByText('30d')).toBeInTheDocument();
  });

  it('surfaces a refused transition rather than swallowing it', async () => {
    withReport([row()]);
    mockApi('bills', 'setApproval', { ok: false, error: 'A bill that is approved cannot move to approved.' });
    render(<BillApprovalPage />);

    await waitFor(() => expect(screen.getByText('Planeti Foods')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));

    expect(await screen.findByText(/cannot move to approved/i)).toBeInTheDocument();
  });

  it('shows the approval state in words', async () => {
    withReport([row({ approvalStatus: 'onHold' })]);
    render(<BillApprovalPage />);

    const table = await screen.findByRole('table');
    expect(within(table).getByText('On hold')).toBeInTheDocument();
  });
});
