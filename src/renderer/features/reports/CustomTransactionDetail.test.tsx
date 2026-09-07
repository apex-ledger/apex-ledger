import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CustomCompanyReportRow } from '@shared/domain/reporting/comprehensiveCompanyReport';
import { useUiStore } from '../../app/store/uiStore';
import { CustomTransactionDetailSheet, loadColumns } from './CustomTransactionDetailPage';

const row = {
  entryId: 42,
  lineId: 7,
  entryDate: '2026-03-01',
  transactionType: 'Journal',
  reference: 'JE-42',
  user: 'Nisha',
  status: 'posted',
  adjusting: false,
  memo: 'Opening',
  accountCode: '1000',
  accountName: 'Cash',
  contactName: null,
  description: 'Opening balance',
  debitCents: 10_000,
  creditCents: 0,
  taxCode: null,
  baseCents: null,
  taxAmountCents: null,
  currency: 'CAD',
  exchangeRate: null,
  foreignAmountCents: null,
} as unknown as CustomCompanyReportRow;

describe('customizable transaction detail sheet', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUiStore.setState({ view: { kind: 'report', report: 'customTransactionDetail' } });
  });

  it('traces a line back to the entry that created it', async () => {
    render(<CustomTransactionDetailSheet rows={[row]} />);

    await userEvent.click(screen.getByText('Opening balance'));

    // No invoice, receipt, bill or payroll run claims the entry, so the journal itself is the source.
    await waitFor(() => expect(useUiStore.getState().view).toEqual({ kind: 'journalForm', id: 42 }));
  });

  it('keeps an added column out of storage until it is saved', async () => {
    render(<CustomTransactionDetailSheet rows={[row]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Add column' }));
    expect(screen.getByText('Unsaved column changes')).toBeInTheDocument();
    expect(window.localStorage.getItem('apexLedger.comprehensiveReportColumns')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Save columns' }));

    expect(loadColumns()).toContain('entryId');
    expect(screen.getByText('Column layout saved')).toBeInTheDocument();
  });
});
