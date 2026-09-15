import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi } from '../../test/setup';
import { SlipEmailModal } from './SlipEmailModal';

const rows = [
  { key: 1, name: 'Asha Patel', email: 'asha@example.com', amountCents: 200_000, subject: 'Your 2026 T4 slip — Scenario Co', body: 'Hi Asha' },
  { key: 2, name: 'Ben Ortiz', email: null, amountCents: 200_000, subject: 'Your 2026 T4 slip — Scenario Co', body: 'Hi Ben' },
];

describe('emailing T4 slips', () => {
  it('keeps Email all off until the consent box is ticked, then reports who was sent and who was skipped', async () => {
    mockApi('slips', 'recipients', rows);
    mockApi('slips', 'sendAll', { sent: ['Asha Patel'], skipped: ['Ben Ortiz'], failed: [] });
    render(<SlipEmailModal kind="t4" taxYear={2026} open onClose={() => undefined} />);

    expect(await screen.findByText('no email on file')).toBeInTheDocument();
    const emailAll = screen.getByRole('button', { name: 'Email all 1' });
    expect(emailAll).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(emailAll);

    await waitFor(() => expect(window.api.slips.sendAll).toHaveBeenCalledWith(expect.objectContaining({ kind: 't4', taxYear: 2026, consentConfirmed: true })));
    expect(await screen.findByText('Sent 1 T4 slip. Skipped (no email on file): Ben Ortiz.')).toBeInTheDocument();
  });

  it("one person's slip cannot be sent until their consent is confirmed in the send box", async () => {
    mockApi('slips', 'recipients', rows);
    mockApi('slips', 'sendOne', { sent: true });
    render(<SlipEmailModal kind="t4" taxYear={2026} open onClose={() => undefined} />);

    await userEvent.click((await screen.findAllByRole('button', { name: 'Email' }))[0]);
    const send = await screen.findByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: /This employee has agreed/ }));
    await userEvent.click(send);

    await waitFor(() => expect(window.api.slips.sendOne).toHaveBeenCalledWith(expect.objectContaining({ key: 1, to: 'asha@example.com', consentConfirmed: true })));
  });
});
