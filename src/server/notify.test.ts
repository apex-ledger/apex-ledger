import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTIFY_EMAIL, notifyConfigFromEnv, trialRequestMail } from './notify';

const trial = { id: 12, firm: 'Maple & Co.', name: 'Paramjeet Janjua', email: 'pj@example.ca', phone: '', edition: 'Business', seats: 2, message: 'Moving from QuickBooks, 14 client files.', status: 'new' as const, createdAt: '2026-09-09 14:02:11', agreedName: 'Paramjeet Janjua', agreedAt: '2026-09-09 14:02:11' };

describe('website notices', () => {
  it('stays off until a mail host and a from address are set', () => {
    expect(notifyConfigFromEnv({})).toBeNull();
    expect(notifyConfigFromEnv({ APEX_SMTP_HOST: 'smtp.office365.com' })).toBeNull();
  });

  it('defaults to admin@apexledger.ca on port 587 with STARTTLS', () => {
    const c = notifyConfigFromEnv({ APEX_SMTP_HOST: 'smtp.office365.com', APEX_SMTP_USER: 'admin@apexledger.ca', APEX_SMTP_PASSWORD: 'x' })!;
    expect(c.to).toBe(DEFAULT_NOTIFY_EMAIL);
    expect(c.smtp).toMatchObject({ host: 'smtp.office365.com', port: 587, security: 'starttls', user: 'admin@apexledger.ca', fromAddress: 'admin@apexledger.ca', fromName: 'Apex Ledger' });
  });

  it('takes the recipient, port and security from the environment', () => {
    const c = notifyConfigFromEnv({ APEX_SMTP_HOST: 'mail.example.ca', APEX_SMTP_FROM: 'noreply@example.ca', APEX_SMTP_PORT: '465', APEX_NOTIFY_EMAIL: 'owner@example.ca' })!;
    expect(c.to).toBe('owner@example.ca');
    expect(c.smtp.port).toBe(465);
    expect(c.smtp.security).toBe('tls');
  });

  it('writes a message the administrator can set the firm up from', () => {
    const m = trialRequestMail(trial);
    expect(m.subject).toBe('Trial request: Maple & Co. (Business, 2 seats)');
    expect(m.body).toContain('Firm:      Maple & Co.');
    expect(m.body).toContain('Email:     pj@example.ca');
    expect(m.body).toContain('Phone:     -');
    expect(m.body).toContain('Moving from QuickBooks, 14 client files.');
    expect(m.body).toContain('request #12');
    expect(m.body).toContain('Signed:    Paramjeet Janjua, typed as signature');
  });

  it('says so when a request carries no typed signature', () => {
    expect(trialRequestMail({ ...trial, agreedName: null, agreedAt: null }).body).toContain('accepted without a typed signature');
  });
});
