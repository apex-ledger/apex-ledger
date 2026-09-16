/**
 * The email a CPA firm sends a business, recommending Apex Ledger through the firm's referral link.
 * It goes out through the platform mail relay with the firm's person as the reply-to, so the business
 * answers its accountant, not us. The link carries the firm's code: a trial requested from it is
 * linked to the firm when the subscription is set up.
 */
export interface ReferralInvite {
  firmName: string;
  senderName: string;
  businessName?: string;
  contactName?: string;
  link: string;
  note?: string;
}

export function referralInviteMail(i: ReferralInvite): { subject: string; body: string } {
  const greeting = i.contactName?.trim() ? `Hi ${i.contactName.trim()},` : i.businessName?.trim() ? `Hi ${i.businessName.trim()} team,` : 'Hello,';
  const note = i.note?.trim();
  return {
    subject: `${i.firmName} recommends Apex Ledger for your books`,
    body: [
      greeting,
      '',
      note || `We use Apex Ledger to look after our clients' books, and we'd like to work with you in it too. It's Canadian accounting software in your browser: invoices, bills, bank statement import, GST/HST and payroll, with your data kept in Canada.`,
      '',
      'Start your free one-month trial here (no card needed):',
      i.link,
      '',
      `Signing up through this link connects your books to ${i.firmName}, so we can see the same numbers you do and help at year end. You can end that connection at any time and keep your books.`,
      '',
      'Regards,',
      i.senderName,
      i.firmName,
    ].join('\n'),
  };
}
