import { describe, expect, it } from 'vitest';
import { referralInviteMail } from './referralInvite';

describe('the referral invitation a CPA firm sends', () => {
  it('names the firm, carries the referral link, and says the business can end the connection', () => {
    const m = referralInviteMail({ firmName: 'Maple CPA', senderName: 'Nisha Janjua', contactName: 'Dev', link: 'https://apexledger.ca/?ref=ABCD2345' });
    expect(m.subject).toBe('Maple CPA recommends Apex Ledger for your books');
    expect(m.body.startsWith('Hi Dev,')).toBe(true);
    expect(m.body).toContain('https://apexledger.ca/?ref=ABCD2345');
    expect(m.body).toContain('end that connection at any time and keep your books');
    expect(m.body.trim().endsWith('Nisha Janjua\nMaple CPA')).toBe(true);
  });

  it("uses the firm's own words when it writes a note", () => {
    const m = referralInviteMail({ firmName: 'Maple CPA', senderName: 'Nisha', businessName: 'Lakeshore Plumbing', link: 'https://apexledger.ca/?ref=ABCD2345', note: 'As discussed, here is the software.' });
    expect(m.body.startsWith('Hi Lakeshore Plumbing team,')).toBe(true);
    expect(m.body).toContain('As discussed, here is the software.');
    expect(m.body).not.toContain('We use Apex Ledger');
  });
});
