import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { ProfitAndLossByTagPage } from './ProfitAndLossByTagPage';
import { mockApi } from '../../test/setup';

/** P&L by tag group, rendered.
 *
 * The report's own tests prove the arithmetic. What they cannot prove is that the untagged column
 * survives to the screen — and untagged silently disappearing is the failure that matters here,
 * because the remaining columns still look plausible and no longer add up to the total.
 */

const ACCOUNT = {
  id: 5,
  code: '4000',
  name: 'Sales',
  accountType: 'Revenue',
  accountSubtype: null,
  normalBalance: 'Credit',
  parentId: null,
  gifiCode: null,
  isActive: true,
  isSystem: false,
  description: null,
  accountNumber: null,
  isTransferEligible: false,
};

const EXPENSE = { ...ACCOUNT, id: 6, code: '5000', name: 'Rent', accountType: 'Expense', normalBalance: 'Debit' };

function report(overrides: Record<string, unknown> = {}) {
  return {
    periodStart: '2025-01-01',
    periodEnd: '2025-12-31',
    tagIds: [10, 11],
    groupName: 'Store',
    tags: [
      { id: 10, name: 'Dundas' },
      { id: 11, name: 'Kipling' },
    ],
    revenue: {
      label: 'Revenue',
      rows: [{ account: ACCOUNT, byTag: new Map([[10, 600_00], [11, 400_00]]), untaggedCents: 0, totalCents: 1_000_00 }],
      totalByTag: new Map([[10, 600_00], [11, 400_00]]),
      totalUntaggedCents: 0,
      totalCents: 1_000_00,
    },
    expenses: {
      label: 'Expenses',
      rows: [{ account: EXPENSE, byTag: new Map([[10, 100_00]]), untaggedCents: 250_00, totalCents: 350_00 }],
      totalByTag: new Map([[10, 100_00]]),
      totalUntaggedCents: 250_00,
      totalCents: 350_00,
    },
    netByTag: new Map([[10, 500_00], [11, 400_00]]),
    netUntaggedCents: -250_00,
    netIncomeCents: 650_00,
    ...overrides,
  };
}

function withReport(data: ReturnType<typeof report>) {
  mockApi('tags', 'groups', [
    { id: 1, name: 'Store', description: null, isActive: true, createdAt: '2025-01-01', tags: [] },
  ]);
  mockApi('reports', 'profitAndLossByTag', data);
}

describe('the columns', () => {
  it('puts a column up for each tag in the group', async () => {
    withReport(report());
    render(<ProfitAndLossByTagPage />);

    const table = await screen.findByRole('table');
    expect(within(table).getByText('Dundas')).toBeInTheDocument();
    expect(within(table).getByText('Kipling')).toBeInTheDocument();
  });

  it('keeps untagged as its own column', async () => {
    // Spreading it across the tags would invent an allocation nobody decided on, and quietly
    // dropping it would leave columns that no longer sum to the total.
    withReport(report());
    render(<ProfitAndLossByTagPage />);

    const table = await screen.findByRole('table');
    expect(within(table).getByText('Untagged')).toBeInTheDocument();
  });

  it('shows both sections and the net line', async () => {
    withReport(report());
    render(<ProfitAndLossByTagPage />);

    const table = await screen.findByRole('table');
    expect(within(table).getByText('Revenue')).toBeInTheDocument();
    expect(within(table).getByText('Expenses')).toBeInTheDocument();
    expect(within(table).getByText('Net income')).toBeInTheDocument();
  });

  it('names the accounts down the side', async () => {
    withReport(report());
    render(<ProfitAndLossByTagPage />);

    const table = await screen.findByRole('table');
    expect(within(table).getByText('Sales')).toBeInTheDocument();
    expect(within(table).getByText('Rent')).toBeInTheDocument();
  });
});

describe('when there is nothing to report on', () => {
  it('explains a file with no tag groups', async () => {
    mockApi('tags', 'groups', []);
    render(<ProfitAndLossByTagPage />);

    expect(await screen.findByText(/no tag groups yet/i)).toBeInTheDocument();
  });

  it('explains a group that has no tags in it', async () => {
    withReport(report({ tags: [], tagIds: [] }));
    render(<ProfitAndLossByTagPage />);

    expect(await screen.findByText(/has no tags in it yet/i)).toBeInTheDocument();
  });
});

describe('what the reader is told', () => {
  it('calls out untagged profit rather than leaving it to be noticed', async () => {
    withReport(report());
    render(<ProfitAndLossByTagPage />);

    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    expect(screen.getByText(/carries no “Store” tag/i)).toBeInTheDocument();
  });
});
