import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Account } from '@shared/domain/types';
import { NewProductModal } from './NewProductModal';

function account(id: number, name: string, accountType: Account['accountType']): Account {
  return {
    id,
    code: String(id),
    name,
    accountType,
    accountSubtype: null,
    normalBalance: accountType === 'Asset' || accountType === 'Expense' ? 'Debit' : 'Credit',
    parentId: null,
    gifiCode: null,
    isActive: true,
    isSystem: false,
    description: null,
    accountNumber: null,
    isTransferEligible: false,
  };
}

describe('NewProductModal account picker', () => {
  it('offers every Chart of Accounts type instead of revenue accounts only', async () => {
    const accounts = [
      account(1, 'Chequing', 'Asset'),
      account(2, 'Credit Card', 'Liability'),
      account(3, 'Owner Equity', 'Equity'),
      account(4, 'Sales', 'Revenue'),
      account(5, 'Cost of Goods Sold', 'Expense'),
    ];

    render(
      <NewProductModal
        accounts={accounts}
        initialName="Glass"
        initialIncomeAccountId={null}
        onClose={() => undefined}
        onCreated={() => undefined}
      />,
    );

    await userEvent.click(screen.getByPlaceholderText('Select account…'));

    for (const item of accounts) expect(screen.getByRole('button', { name: new RegExp(item.name) })).toBeInTheDocument();
    for (const type of ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense']) expect(screen.getAllByText(type).length).toBeGreaterThan(0);
    expect(screen.queryByText('Revenue Account')).not.toBeInTheDocument();
  });
});
