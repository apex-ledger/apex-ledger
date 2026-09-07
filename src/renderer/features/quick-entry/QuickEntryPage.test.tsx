import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockApi } from '../../test/setup';
import { QuickEntryPage } from './QuickEntryPage';

const quickEntryAccounts = [
  {
    id: 1,
    code: '1000',
    name: 'Checking Account',
    accountType: 'Asset',
    accountSubtype: 'Bank',
    normalBalance: 'Debit',
    parentId: null,
    gifiCode: null,
    isActive: true,
    isSystem: false,
    description: null,
    accountNumber: null,
    isTransferEligible: true,
  },
  {
    id: 2,
    code: '5000',
    name: 'Cost of Goods Sold',
    accountType: 'Expense',
    accountSubtype: 'Cost of Goods Sold',
    normalBalance: 'Debit',
    parentId: null,
    gifiCode: null,
    isActive: true,
    isSystem: false,
    description: null,
    accountNumber: null,
    isTransferEligible: false,
  },
];

async function completeExpenseRow(container: HTMLElement) {
  const moneyAccount = screen.getByPlaceholderText('Select bank, cash, or credit card…');
  fireEvent.focus(moneyAccount);
  fireEvent.change(moneyAccount, { target: { value: 'Checking Account' } });
  fireEvent.keyDown(moneyAccount, { key: 'Enter' });
  const category = screen.getByPlaceholderText('Expense category…');
  fireEvent.focus(category);
  fireEvent.change(category, { target: { value: 'Cost of Goods Sold' } });
  fireEvent.keyDown(category, { key: 'Enter' });
  const [baseInput] = Array.from(container.querySelectorAll<HTMLInputElement>('input[inputmode="decimal"]'));
  fireEvent.change(baseInput, { target: { value: '125.00' } });
  fireEvent.blur(baseInput);
  await waitFor(() => expect(baseInput).toHaveValue('125.00'));
}

describe('Quick Entry HST display', () => {
  it('warns about a filed return without treating its date range as an accountant lock', async () => {
    mockApi('accounts', 'list', quickEntryAccounts);
    mockApi('fiscalPeriods', 'list', [
      { id: 62, periodStart: '2026-07-01', periodEnd: '2026-09-30', label: 'GST/HST filed — 2026-07-01 to 2026-09-30', isLocked: true, lockedAt: '2026-08-29T12:00:00Z' },
    ]);
    mockApi('hstFilings', 'list', [
      { id: 9, periodStart: '2026-07-01', periodEnd: '2026-09-30', filingDate: '2026-08-29', collectedCents: 1000, itcCents: 500, netPayableCents: 500, paymentAccountId: null, journalEntryId: 90, fiscalPeriodId: 62, memo: null },
    ]);

    const { container } = render(<QuickEntryPage type="expense" />);
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-08-29' } });

    expect(await screen.findByText('A filed Sales Tax return covers this date, but it is not an accountant lock.')).toBeInTheDocument();
    await completeExpenseRow(container);
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /Save & Next/ }).every((button) => !button.hasAttribute('disabled'))).toBe(true),
    );
  });

  it('blocks a complete row when an accountant deliberately locked the fiscal period', async () => {
    mockApi('accounts', 'list', quickEntryAccounts);
    mockApi('fiscalPeriods', 'list', [
      { id: 63, periodStart: '2026-07-01', periodEnd: '2026-09-30', label: 'Q3 accountant close', isLocked: true, lockedAt: '2026-08-29T12:00:00Z' },
    ]);
    mockApi('hstFilings', 'list', []);

    const { container } = render(<QuickEntryPage type="expense" />);
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-08-29' } });
    expect(await screen.findByText('This transaction date is inside an accountant-locked fiscal period.')).toBeInTheDocument();
    await completeExpenseRow(container);
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /Save & Next/ }).every((button) => button.hasAttribute('disabled'))).toBe(true),
    );
  });

  it('keeps the visible Ontario fallback in real state and calculates tax and total', async () => {
    const { container } = render(<QuickEntryPage type="expense" />);

    // The default API stub returns no saved province. The UI's documented fallback is HST 13%,
    // and it must be the real selected value rather than only the browser's visual first option.
    await waitFor(() => expect(container.querySelectorAll('input[inputmode="decimal"]')).toHaveLength(2));
    const [baseInput, taxInput] = Array.from(container.querySelectorAll<HTMLInputElement>('input[inputmode="decimal"]'));

    fireEvent.change(baseInput, { target: { value: '225.00' } });
    fireEvent.blur(baseInput);

    await waitFor(() => expect(taxInput).toHaveValue('29.25'));
    expect(screen.getByText('$254.25')).toBeInTheDocument();
  });

  it.each(['expense', 'income', 'transfer'] as const)(
    'keeps %s controls and the new-entry sheet above entered rows, which stay last',
    (type) => {
      const { getByTestId } = render(<QuickEntryPage type={type} />);
      const controls = getByTestId('quick-entry-controls');
      const history = getByTestId('quick-entry-history');
      const newRow = getByTestId('quick-entry-new-row');
      const modeRow = getByTestId('quick-entry-mode-row');
      const currency = screen.getByRole('combobox', { name: 'Currency' });

      expect(controls.parentElement).toHaveClass('flex', 'flex-col');
      expect(controls.parentElement).toHaveClass('pb-4');
      expect(controls.parentElement).not.toHaveClass('pb-96');
      expect(modeRow).toContainElement(currency);
      expect(controls).not.toContainElement(currency);
      if (type === 'transfer') expect(currency).toBeDisabled();
      else expect(currency).toBeEnabled();
      expect(controls.compareDocumentPosition(newRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(history).toHaveClass('order-last');
    },
  );

  it('detects tax treatment from the description but preserves a manual tax choice', async () => {
    mockApi('company', 'get', { businessProvince: 'AB', businessType: null });
    mockApi('accounts', 'list', [
      {
        id: 101,
        code: '8811',
        name: 'Office Supplies',
        accountType: 'Expense',
        accountSubtype: 'Operating Expense',
        normalBalance: 'Debit',
        parentId: null,
        gifiCode: null,
        isActive: true,
        isSystem: false,
        description: null,
        accountNumber: null,
        isTransferEligible: false,
      },
    ]);
    mockApi('categoryRules', 'list', [
      { id: 1, pattern: 'STAPLES', accountId: 101, taxCode: 'HST', priority: 10, isActive: true },
      { id: 2, pattern: 'INSURANCE', accountId: 101, taxCode: 'NonHST', priority: 10, isActive: true },
    ]);

    const { container } = render(<QuickEntryPage type="expense" />);
    const description = container.querySelector<HTMLInputElement>('input[name="quick-entry-description"]');
    expect(description).not.toBeNull();
    const taxStatus = await screen.findByRole('combobox', { name: 'Tax status' });

    await waitFor(() => expect(taxStatus).toHaveValue('GST_AB'));
    fireEvent.change(description!, { target: { value: 'Business insurance premium' } });
    await waitFor(() => expect(taxStatus).toHaveValue('NonHST'));
    expect(await screen.findByText(/Detected from description: HST Exempt/)).toBeInTheDocument();

    fireEvent.change(description!, { target: { value: 'Staples office supplies' } });
    await waitFor(() => expect(taxStatus).toHaveValue('GST_AB'));

    fireEvent.change(taxStatus, { target: { value: 'Manual' } });
    fireEvent.change(description!, { target: { value: 'Business insurance premium' } });
    await waitFor(() => expect(taxStatus).toHaveValue('Manual'));
  });
});
