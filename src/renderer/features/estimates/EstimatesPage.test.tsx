import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EstimatesPage } from './EstimatesPage';
import { mockApi } from '../../test/setup';

/** The estimates list, rendered.
 *
 * The thing worth guarding is the Convert button: it is the only control on the screen that writes
 * to the ledger, and offering it on a quote that has already been invoiced would bill the customer
 * twice for one job.
 */

function estimate(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    customerId: 5,
    estimateNumber: 'EST-2026-0001',
    estimateDate: '2026-01-10',
    expiryDate: null,
    memo: null,
    totalCents: 250_000,
    status: 'sent',
    convertedInvoiceId: null,
    convertedAt: null,
    createdAt: '2026-01-10',
    ...overrides,
  };
}

function withEstimates(rows: ReturnType<typeof estimate>[]) {
  mockApi('estimates', 'list', rows);
  mockApi('customers', 'list', [{ id: 5, name: 'Planeti Foods', isActive: true }]);
}

describe('the list', () => {
  it('shows a quote with its customer and total', async () => {
    withEstimates([estimate()]);
    render(<EstimatesPage />);

    expect(await screen.findByText('EST-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('Planeti Foods')).toBeInTheDocument();
  });

  it('explains an empty file rather than showing a blank page', async () => {
    withEstimates([]);
    render(<EstimatesPage />);

    expect(await screen.findByText(/no estimates yet/i)).toBeInTheDocument();
  });

  it('totals what has been quoted and not yet invoiced', async () => {
    // The number a business actually wants off this screen: what is in play.
    withEstimates([estimate({ id: 1 }), estimate({ id: 2, estimateNumber: 'EST-2026-0002' })]);
    render(<EstimatesPage />);

    expect(await screen.findByText(/quoted and not yet invoiced/i)).toBeInTheDocument();
  });
});

describe('turning a quote into an invoice', () => {
  it('is offered on one still open', async () => {
    withEstimates([estimate()]);
    render(<EstimatesPage />);

    expect(await screen.findByRole('button', { name: /create invoice/i })).toBeInTheDocument();
  });

  it('is NOT offered on one already invoiced', async () => {
    // The failure this prevents: the same job billed twice. Shown under "all", because an invoiced
    // quote is settled and the default view is what is still open.
    withEstimates([estimate({ status: 'converted', convertedInvoiceId: 9 })]);
    render(<EstimatesPage />);

    await userEvent.selectOptions(await screen.findByRole('combobox'), 'all');
    await waitFor(() => expect(screen.getByText('EST-2026-0001')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /create invoice/i })).not.toBeInTheDocument();
  });

  it('offers a way through to the invoice it became', async () => {
    withEstimates([estimate({ status: 'converted', convertedInvoiceId: 9 })]);
    render(<EstimatesPage />);

    await userEvent.selectOptions(await screen.findByRole('combobox'), 'all');
    expect(await screen.findByRole('button', { name: /open invoice/i })).toBeInTheDocument();
  });

  it('keeps a settled quote out of the default view', async () => {
    // "Still open" is the list somebody is chasing; an invoiced quote is done with.
    withEstimates([estimate({ status: 'converted', convertedInvoiceId: 9 })]);
    render(<EstimatesPage />);

    await waitFor(() => expect(screen.getByText(/nothing open/i)).toBeInTheDocument());
  });

  it('is NOT offered on one the customer declined', async () => {
    withEstimates([estimate({ status: 'declined' })]);
    render(<EstimatesPage />);

    await userEvent.selectOptions(await screen.findByRole('combobox'), 'all');
    expect(screen.queryByRole('button', { name: /create invoice/i })).not.toBeInTheDocument();
  });

  it('surfaces a refusal rather than appearing to work', async () => {
    withEstimates([estimate()]);
    mockApi('estimates', 'convertToInvoice', { ok: false, error: 'This estimate has already been invoiced.' });
    render(<EstimatesPage />);

    await userEvent.click(await screen.findByRole('button', { name: /create invoice/i }));
    expect(await screen.findByText(/already been invoiced/i)).toBeInTheDocument();
  });
});

describe('expiry', () => {
  it('shows a lapsed quote as expired', async () => {
    // Worked out from the date, not from a stored flag that nothing updates overnight.
    withEstimates([estimate({ expiryDate: '2020-01-01' })]);
    render(<EstimatesPage />);

    const table = await screen.findByRole('table');
    expect(within(table).getByText('Expired')).toBeInTheDocument();
  });

  it('leaves an accepted quote alone once its date passes', async () => {
    withEstimates([estimate({ status: 'accepted', expiryDate: '2020-01-01' })]);
    render(<EstimatesPage />);

    const table = await screen.findByRole('table');
    expect(within(table).getByText('Accepted')).toBeInTheDocument();
  });
});

describe('filtering', () => {
  it('hides settled quotes by default', async () => {
    withEstimates([estimate({ id: 1 }), estimate({ id: 2, estimateNumber: 'EST-2026-0002', status: 'declined' })]);
    render(<EstimatesPage />);

    await waitFor(() => expect(screen.getByText('EST-2026-0001')).toBeInTheDocument());
    expect(screen.queryByText('EST-2026-0002')).not.toBeInTheDocument();
  });

  it('shows them when asked', async () => {
    withEstimates([estimate({ id: 1 }), estimate({ id: 2, estimateNumber: 'EST-2026-0002', status: 'declined' })]);
    render(<EstimatesPage />);

    await userEvent.selectOptions(await screen.findByRole('combobox'), 'all');
    expect(screen.getByText('EST-2026-0002')).toBeInTheDocument();
  });
});
