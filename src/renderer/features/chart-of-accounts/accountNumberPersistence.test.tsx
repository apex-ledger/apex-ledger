import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Account } from '@shared/domain/types';
import { AccountNumberCell } from './ChartOfAccountsPage';
import { generalLedgerAccountLabel } from '../reports/GeneralLedgerPage';

const ACCOUNT: Account = {
  id: 10,
  code: '1000',
  name: 'Operating Chequing',
  accountType: 'Asset',
  accountSubtype: 'Cash and Bank',
  normalBalance: 'Debit',
  parentId: null,
  gifiCode: null,
  isActive: true,
  isSystem: false,
  description: null,
  accountNumber: null,
  isTransferEligible: true,
};

describe('Chart of Accounts account number', () => {
  it('commits the account number with Enter and preserves it in the controlled cell', async () => {
    const onSave = vi.fn(async () => true);
    const { rerender } = render(<AccountNumberCell account={ACCOUNT} className="" onSave={onSave} />);
    const input = screen.getByRole('textbox', { name: 'Account number for Operating Chequing' });

    await userEvent.type(input, '123456');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('123456'));

    rerender(<AccountNumberCell account={{ ...ACCOUNT, accountNumber: '123456' }} className="" onSave={onSave} />);
    expect(input).toHaveValue('123456');
  });

  it('includes a saved account number in the General Ledger account heading', () => {
    expect(generalLedgerAccountLabel({ ...ACCOUNT, accountNumber: '123456' })).toBe('Operating Chequing · Account # 123456');
    expect(generalLedgerAccountLabel(ACCOUNT)).toBe('Operating Chequing');
  });
});
