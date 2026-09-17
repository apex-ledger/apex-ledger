// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ForgotPasswordForm, ResetPasswordForm } from './PasswordReset';

afterEach(() => vi.unstubAllGlobals());
const respond = (body: unknown) => vi.fn(async () => ({ json: async () => body }) as Response);

describe('forgot password on the sign-in page', () => {
  it('asks for the email and says a link is on its way, whatever the email', async () => {
    const fetchMock = respond({ ok: true, data: { message: 'If that email has an Apex Ledger sign-in, a link to set a new password is on its way.' } });
    vi.stubGlobal('fetch', fetchMock);
    render(<ForgotPasswordForm initialEmail="nisha.janjua+bookkeeper@gmail.com" onBack={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText(/a link to set a new password is on its way/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/password-reset/request', expect.objectContaining({ body: JSON.stringify({ email: 'nisha.janjua+bookkeeper@gmail.com' }) }));
  });

  it('sets the new password from the link, and refuses two different passwords', async () => {
    const fetchMock = respond({ ok: true, data: { email: 'nisha.janjua+bookkeeper@gmail.com' } });
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn();
    render(<ResetPasswordForm token="abc123" onDone={onDone} />);
    await userEvent.type(screen.getByLabelText('New password'), 'first-password');
    await userEvent.type(screen.getByLabelText('Type it again'), 'other-password');
    await userEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(await screen.findByText('The two passwords are not the same.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText('Type it again'));
    await userEvent.type(screen.getByLabelText('Type it again'), 'first-password');
    await userEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.stringMatching(/Your password is changed/)));
  });
});
