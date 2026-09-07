import { describe, expect, it } from 'vitest';
import { buildMime } from './smtpClient';

const options = { host: 'smtp.example.ca', port: 587, security: 'starttls' as const, user: 'accounts@firm.ca', password: 'x', fromName: 'Apex Firm', fromAddress: 'accounts@firm.ca' };

describe('outgoing mail', () => {
  it('builds a plain-text message with the headers a mail server needs', () => {
    const mime = buildMime(options, { to: 'client@example.com', subject: 'Statement', body: 'Hello' });
    expect(mime).toContain('From: Apex Firm <accounts@firm.ca>');
    expect(mime).toContain('To: client@example.com');
    expect(mime).toContain('Subject: Statement');
    expect(mime).toContain('Content-Type: multipart/mixed');
    expect(mime).toContain(Buffer.from('Hello').toString('base64'));
  });

  it('encodes a subject with accents so it survives every server', () => {
    const mime = buildMime(options, { to: 'a@b.c', subject: 'Relevé de compte', body: '' });
    expect(mime).toContain('Subject: =?UTF-8?B?');
  });

  it('never lets a body line of a single dot end the message early', () => {
    const mime = buildMime(options, { to: 'a@b.c', subject: 's', body: 'x' });
    expect(mime).not.toMatch(/\r\n\.\r\n/);
  });
});
