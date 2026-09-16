import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebReferralsSection } from './WebReferralsSection';

const firmInfo = {
  referralCode: 'ABCD2345',
  referralLink: 'https://apexledger.ca/?ref=ABCD2345',
  creditPerClientCents: 1500,
  clientSeatCents: 2400,
  businessSeatCents: 3900,
  earningNowCents: 1500,
  clients: [
    { clientOrgId: 7, name: 'Lakeshore Plumbing', since: '2026-09-16', endedOn: null, status: 'active', firstChargeDate: '2026-10-16' },
    { clientOrgId: 8, name: 'Old Client Ltd', since: '2026-01-01', endedOn: '2026-06-01', status: 'active', firstChargeDate: '2026-02-01' },
  ],
  linkedFirm: null,
  requests: [{ id: 3, business: 'Northside Dental', contact: 'Dr. Lee', requestedOn: '2026-09-15', status: 'new' }],
};

function mockFetch(routes: Record<string, unknown>) {
  const calls: Array<{ url: string; body: unknown }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    return { json: async () => (key ? routes[key] : { ok: false, error: 'not mocked' }) } as Response;
  }));
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe('clients and referrals for a CPA firm', () => {
  it('shows the referral link, the credit earned, clients paying for themselves and requests from the link', async () => {
    mockFetch({ '/api/org/referral?': { ok: true, data: firmInfo } });
    render(<WebReferralsSection orgId={2} files={[]} />);
    expect(await screen.findByDisplayValue('https://apexledger.ca/?ref=ABCD2345')).toBeInTheDocument();
    expect(screen.getByText('Earning $15 this month')).toBeInTheDocument();
    expect(screen.getByText('Lakeshore Plumbing')).toBeInTheDocument();
    expect(screen.getByText(/Earlier: Old Client Ltd \(until 2026-06-01\)/)).toBeInTheDocument();
    expect(screen.getByText('Northside Dental')).toBeInTheDocument();
    expect(screen.getByText('Being set up')).toBeInTheDocument();
  });

  it('emails the link to a business, with replies going to the sender', async () => {
    const calls = mockFetch({ '/api/org/referral?': { ok: true, data: firmInfo }, '/api/org/referral/invite': { ok: true, data: { sent: true, to: 'dev@lakeshore.ca' } } });
    render(<WebReferralsSection orgId={2} files={[]} />);
    await userEvent.type(await screen.findByPlaceholderText('Business email'), 'dev@lakeshore.ca');
    await userEvent.type(screen.getByPlaceholderText('Contact name (optional)'), 'Dev');
    await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }));
    expect(await screen.findByText('Invitation sent to dev@lakeshore.ca. Replies come to you.')).toBeInTheDocument();
    expect(calls.find((c) => c.url.startsWith('/api/org/referral/invite'))?.body).toEqual(expect.objectContaining({ to: 'dev@lakeshore.ca', contactName: 'Dev' }));
  });

  it('moves a client onto its own subscription from one of the firm company files', async () => {
    const calls = mockFetch({ '/api/org/referral?': { ok: true, data: firmInfo }, '/api/org/clients': { ok: true, data: { org: { name: 'Corner Bakery' }, user: { email: 'rana@bakery.ca' } } } });
    render(<WebReferralsSection orgId={2} files={[{ name: 'Corner Bakery.company' }]} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Move a client to their own subscription' }));
    await userEvent.selectOptions(screen.getByLabelText('Their company file'), 'Corner Bakery.company');
    expect(screen.getByLabelText('Business name')).toHaveValue('Corner Bakery');
    await userEvent.type(screen.getByLabelText("Owner's email (their sign-in)"), 'rana@bakery.ca');
    await userEvent.type(screen.getByLabelText('First password (8+)'), 'long-enough');
    await userEvent.click(screen.getByRole('button', { name: 'Set up their subscription' }));
    expect(await screen.findByText(/Corner Bakery now pays for its own subscription/)).toBeInTheDocument();
    expect(calls.find((c) => c.url.startsWith('/api/org/clients'))?.body).toEqual(expect.objectContaining({ companyFile: 'Corner Bakery.company', personEmail: 'rana@bakery.ca' }));
  });

  it('lets a business see its linked firm and end the link', async () => {
    const calls = mockFetch({ '/api/org/referral?': { ok: true, data: { ...firmInfo, clients: [], requests: [], linkedFirm: { firmOrgId: 2, name: 'Maple CPA', since: '2026-09-16' } } }, '/api/org/referral/end': { ok: true, data: {} } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<WebReferralsSection orgId={7} files={[]} />);
    expect(await screen.findByText('Maple CPA')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('https://apexledger.ca/?ref=ABCD2345')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'End the link' }));
    await waitFor(() => expect(calls.find((c) => c.url === '/api/org/referral/end')?.body).toEqual({ clientOrgId: 7 }));
  });
});
