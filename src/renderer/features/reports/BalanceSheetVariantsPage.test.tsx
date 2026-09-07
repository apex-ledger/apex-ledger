import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockApi } from '../../test/setup';
import { BalanceSheetVariantsPage } from './BalanceSheetVariantsPage';

const balanceSheet = {
  assets: { lines: [], totalCents: 100_000, comparativeTotalCents: 90_000 },
  liabilities: { lines: [], totalCents: 40_000, comparativeTotalCents: 35_000 },
  equity: { lines: [], totalCents: 60_000, comparativeTotalCents: 55_000 },
  isBalanced: true,
};

describe('expanded balance-sheet variants', () => {
  it('renders the summary as three responsive section panels', async () => {
    mockApi('reports', 'balanceSheet', balanceSheet);
    mockApi('accounts', 'list', []);
    const { container } = render(<BalanceSheetVariantsPage variant="summary" />);

    expect(await screen.findByRole('heading', { name: 'Assets' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Liabilities' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Equity' })).toBeInTheDocument();
    expect(container.querySelector('.xl\\:grid-cols-3')).toBeInTheDocument();
  });

  it('keeps each detail total aligned to the same two table columns as its rows', async () => {
    mockApi('reports', 'balanceSheet', balanceSheet);
    mockApi('accounts', 'list', []);
    render(<BalanceSheetVariantsPage variant="detail" />);

    const totalRow = (await screen.findByText('Total assets')).closest('tr');
    expect(totalRow?.querySelectorAll('td')).toHaveLength(2);
  });
});
