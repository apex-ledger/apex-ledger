import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi } from '../test/setup';
import { SendReminderButton } from './SendReminderButton';

const preview = {
  customerId: 3, customerName: 'Om Financial', customerEmail: 'om@example.com', tier: 'overdue', totalCents: 28_250, overdueCents: 28_250, oldestDaysLate: 21,
  subject: 'Overdue: invoice INV-2026-0002', body: 'Hi Om Financial,\n\nInvoice INV-2026-0002 is 21 days overdue.', invoices: [],
};

describe('sending a payment reminder', () => {
  it('opens the send box with the reminder written, lets it be changed, and sends it through the relay rather than Outlook', async () => {
    mockApi('paymentReminders', 'preview', preview);
    mockApi('paymentReminders', 'sendDirect', { sent: true, tier: 'overdue', totalCents: 28_250 });
    render(<SendReminderButton customerId={3} />);

    await userEvent.click(screen.getByRole('button', { name: 'Send reminder' }));

    expect(await screen.findByText('Overdue notice')).toBeInTheDocument();
    expect(screen.getByDisplayValue('om@example.com')).toBeInTheDocument();
    const subject = screen.getByDisplayValue('Overdue: invoice INV-2026-0002');
    await userEvent.clear(subject);
    await userEvent.type(subject, 'Friendly nudge');

    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(window.api.paymentReminders.sendDirect).toHaveBeenCalledWith(expect.objectContaining({ customerId: 3, to: 'om@example.com', subject: 'Friendly nudge' })));
    expect(await screen.findByText('Reminder sent to om@example.com.')).toBeInTheDocument();
  });

  it('lets a customer with no email on file still be reached, and says to add it to their record', async () => {
    mockApi('paymentReminders', 'preview', { ...preview, customerEmail: null });
    render(<SendReminderButton customerId={3} />);
    await userEvent.click(screen.getByRole('button', { name: 'Send reminder' }));
    expect(await screen.findByText(/No email on file — type one below/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });
});
