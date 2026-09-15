import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockApi } from '../../test/setup';
import { YearEndWorkspacePage } from './YearEndWorkspacePage';
import type { YearEndSignoffReport } from '@shared/domain/audit/yearEndSignoff';

const emptySignoff: YearEndSignoffReport = {
  periodStart: '2026-01-01', periodEnd: '2026-12-31', checks: [], counts: { green: 0, amber: 0, red: 0 }, decision: 'ready',
};

describe('Year-End Workspace', () => {
  it('shows the sign-off checklist and the final statements, without a payroll section when there is no payroll', async () => {
    mockApi('reports', 'yearEndSignoff', emptySignoff);
    mockApi('reports', 'yearEndSignoffHistory', []);
    mockApi('payrollRuns', 'list', []);
    mockApi('employees', 'list', []);

    render(<YearEndWorkspacePage />);

    expect(await screen.findByText('Sign-off checklist — data entry through to the balance sheet')).toBeInTheDocument();
    expect(screen.getByText('Final statements')).toBeInTheDocument();
    expect(screen.getByText('Balance Sheet')).toBeInTheDocument();
    expect(screen.queryByText('Payroll info slips and regional filings')).not.toBeInTheDocument();
  });
});
