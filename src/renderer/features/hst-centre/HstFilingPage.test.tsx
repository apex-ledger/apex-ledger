import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockApi } from '../../test/setup';
import { craHstAccountNumber } from '@shared/domain/company/craAccountNumber';
import { CRA_GST_HST_NETFILE_URL, craFilingClipboard, HstFilingPage } from './HstFilingPage';

describe('CRA GST/HST filing handoff', () => {
  it('uses the saved GST/HST program account without inventing an RT account', () => {
    expect(craHstAccountNumber('123 456 789 RT 0001', '123456789')).toBe('123456789RT0001');
    expect(craHstAccountNumber(null, '123456789RT0002')).toBe('123456789RT0002');
    expect(craHstAccountNumber(null, '123456789')).toBe('');
  });

  it('prepares the exact account and reporting period for copying to CRA', () => {
    expect(craFilingClipboard('123456789RT0001', '2026-04-01', '2026-06-30')).toBe(
      'GST/HST account number: 123456789RT0001\nReporting period start: 2026-04-01\nReporting period end: 2026-06-30',
    );
  });

  it('loads the company account, keeps the displayed period synchronized, and links to CRA NETFILE', async () => {
    mockApi('company', 'get', { hstNumber: '123 456 789 RT 0001', businessNumber: '123456789' });
    mockApi('hstFilings', 'list', []);
    mockApi('hstFilings', 'preview', {
      taxableIncomeCents: 100_000,
      taxablePurchasesCents: 50_000,
      collectedCents: 13_000,
      itcCents: 6_500,
      netPayableCents: 6_500,
      pendingManualCount: 0,
      overlappingFilings: [],
    });

    render(<HstFilingPage />);

    expect(await screen.findByDisplayValue('123456789RT0001')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open CRA GST/HST NETFILE' })).toHaveAttribute('href', CRA_GST_HST_NETFILE_URL);

    fireEvent.change(screen.getByLabelText('Period start'), { target: { value: '2026-04-01' } });
    fireEvent.change(screen.getByLabelText('Period end'), { target: { value: '2026-06-30' } });
    expect(screen.getByText('2026-04-01 to 2026-06-30')).toBeInTheDocument();
  });
});
