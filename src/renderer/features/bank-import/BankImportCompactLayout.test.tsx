import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockApi } from '../../test/setup';
import { BankImportPage } from './BankImportPage';

describe('compact Bank Import layout', () => {
  it('keeps account shortcuts and categorization rules together at the top of the sheet', async () => {
    mockApi('accounts', 'list', [{
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
      accountNumber: '1200',
      isTransferEligible: true,
    }]);

    render(<BankImportPage />);

    const toolbar = screen.getByTestId('bank-import-account-toolbar');
    expect(await within(toolbar).findByRole('button', { name: /Operating Chequing/ })).toBeInTheDocument();
    expect(within(toolbar).getByRole('button', { name: 'Manage Categorization Rules' })).toBeInTheDocument();
  });
});
