import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../../test/setup';
import { useUiStore } from '../../app/store/uiStore';
import { GeneralLedgerPage } from './GeneralLedgerPage';
import type { GeneralLedgerLine } from '@shared/domain/ledger/generalLedger';
import type { Account } from '@shared/domain/types';

const account: Account = {
  id: 7, code: '1002', name: 'Cheque Account', accountNumber: '1002', accountType: 'Asset', accountSubtype: 'Cash and Bank',
  normalBalance: 'Debit', isActive: true, isSystem: false, parentId: null, gifiCode: null, description: null,
  isTransferEligible: true,
};

function line(overrides: Partial<GeneralLedgerLine>): GeneralLedgerLine {
  return {
    entryId: 1, createdBy: null, entryDate: '2026-03-04', createdAt: '2026-03-04T12:00:00Z', memo: null, reference: null,
    description: null, transactionType: 'Invoice', isAdjustment: false, name: null, split: '—',
    debitCents: 0, creditCents: 0, runningBalanceCents: 0, taxAmountCents: 0, currency: 'CAD', exchangeRate: null,
    foreignAmountCents: null,
    ...overrides,
  };
}

describe('General Ledger, filtered by where the entry came from', () => {
  it('offers only the groups this account actually has, and narrows to one with its own total', async () => {
    mockApi('accounts', 'list', [account]);
    mockApi('company', 'get', { legalName: 'Northwind Ltd', displayName: null });
    mockApi('access', 'getIdentity', { name: 'Reviewer' });
    mockApi('reports', 'generalLedger', {
      account,
      openingBalanceCents: 100_00,
      closingBalanceCents: 375_00,
      lines: [
        line({ entryId: 1, transactionType: 'Invoice', debitCents: 200_00, description: 'Invoice 1001' }),
        line({ entryId: 2, transactionType: 'Bill', creditCents: 50_00, description: 'Hydro bill' }),
        line({ entryId: 3, transactionType: 'Journal Entry', debitCents: 75_00, description: 'Year-end accrual' }),
        line({ entryId: 4, transactionType: 'Quick Entry', debitCents: 50_00, description: 'Keyed expense' }),
      ],
    });
    useUiStore.setState({ view: { kind: 'report', report: 'generalLedger', drillDown: { accountId: account.id } } });

    render(<GeneralLedgerPage />);

    // Every line shows until a group is picked, and a group with no lines gets no button.
    expect(await screen.findByText('Everything (4)')).toBeInTheDocument();
    expect(screen.getByText('Manual entries (2)')).toBeInTheDocument();
    expect(screen.getByText('Sales (1)')).toBeInTheDocument();
    expect(screen.getByText('Bills & expenses (1)')).toBeInTheDocument();
    expect(screen.queryByText(/^Payroll & tax/)).not.toBeInTheDocument();
    expect(screen.getByText('Hydro bill')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Manual entries (2)'));

    // The journal entry and the quick entry are both hand-keyed; the invoice and bill are not.
    expect(screen.getByText('Year-end accrual')).toBeInTheDocument();
    expect(screen.getByText('Keyed expense')).toBeInTheDocument();
    expect(screen.queryByText('Invoice 1001')).not.toBeInTheDocument();
    expect(screen.queryByText('Hydro bill')).not.toBeInTheDocument();

    // The subset gets its own debit/credit total, while the account's own closing balance stands.
    const total = screen.getByText('Manual entries total').closest('tr')!;
    expect(within(total).getByText('125.00')).toBeInTheDocument();
    expect(screen.getByText('Closing Balance').closest('tr')).toBeTruthy();
  });

  it('runs every account that moved in one go, each with its own ledger', async () => {
    const payables: Account = { ...account, id: 9, code: '2100', name: 'Accounts Payable', accountNumber: '2100', accountType: 'Liability', accountSubtype: null, normalBalance: 'Credit' };
    mockApi('accounts', 'list', [account, payables]);
    mockApi('company', 'get', { legalName: 'Northwind Ltd', displayName: null });
    mockApi('access', 'getIdentity', { name: 'Reviewer' });
    mockApi('reports', 'generalLedgerAllAccounts', [
      { account, openingBalanceCents: 0, closingBalanceCents: 200_00, lines: [line({ transactionType: 'Invoice', debitCents: 200_00, description: 'Invoice 1001' })] },
      { account: payables, openingBalanceCents: 0, closingBalanceCents: 50_00, lines: [line({ entryId: 2, transactionType: 'Bill', creditCents: 50_00, description: 'Hydro bill' })] },
    ]);
    useUiStore.setState({ view: { kind: 'report', report: 'generalLedger' } });

    render(<GeneralLedgerPage />);

    // Nothing is selected, so the page waits rather than guessing an account.
    expect(screen.getByText('Choose an account to view its ledger, or pick All accounts.')).toBeInTheDocument();

    await userEvent.click(screen.getByText('All accounts'));

    expect(await screen.findByText('Cheque Account · Account # 1002')).toBeInTheDocument();
    expect(screen.getByText('Accounts Payable · Account # 2100')).toBeInTheDocument();
    expect(screen.getByText('Invoice 1001')).toBeInTheDocument();
    expect(screen.getByText('Hydro bill')).toBeInTheDocument();
  });
});
