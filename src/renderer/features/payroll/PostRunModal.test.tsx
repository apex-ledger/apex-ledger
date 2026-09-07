import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PayrollRun } from '@shared/domain/types';
import { mockApi } from '../../test/setup';
import { PostRunModal } from './PostRunModal';

const zeroRun: PayrollRun = {
  id: 8,
  employeeId: 2,
  payPeriodStart: '2026-08-01',
  payPeriodEnd: '2026-08-15',
  payDate: '2026-08-20',
  regularHours: null,
  overtimeHours: null,
  regularPayCents: 0,
  overtimePayCents: 0,
  grossPayCents: 0,
  vacationPayCents: 0,
  cpp1EmployeeCents: 0,
  cpp1EmployerCents: 0,
  cpp2EmployeeCents: 0,
  cpp2EmployerCents: 0,
  eiEmployeeCents: 0,
  eiEmployerCents: 0,
  wsibEmployerCents: 0,
  rrspEmployerMatchCents: 0,
  healthBenefitCents: 0,
  incomeTaxCents: 0,
  netPayCents: 0,
  status: 'draft',
  journalEntryId: null,
  isVacationPayout: false,
};

describe('PostRunModal', () => {
  it('explains an existing zero-value draft and prevents posting it', async () => {
    mockApi('accounts', 'list', [
      { id: 7, name: 'Chequing Account', accountType: 'Asset', accountSubtype: 'Bank', isActive: true },
    ]);
    mockApi('payrollRuns', 'get', zeroRun);

    render(<PostRunModal open onClose={vi.fn()} onPosted={vi.fn()} runId={zeroRun.id} />);

    expect(await screen.findByText(/This pay run has no payroll amount/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled();
  });
});
