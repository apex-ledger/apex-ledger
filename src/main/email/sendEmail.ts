import { readAppSettings, readSmtpPassword } from '../appSettings';
import { composeOutlookEmailWithAttachment } from '../forms/emailWithOutlook';
import { sendSmtp } from './smtpClient';

/**
 * One door for every email the app sends — statements, reminders, invoices, receipts, forms.
 *
 * With a mail server set up in Settings the message goes straight out and the result says so.
 * Otherwise it opens a draft in desktop Outlook for the person to review and send, which is how
 * the app has always worked. Callers get the same shape either way, so nothing they show the
 * user has to know which route was taken beyond the word "sent" or "opened".
 */
export type EmailOutcome = { route: 'smtp'; sent: true } | { route: 'outlook'; opened: true };

export async function sendEmailWithAttachment(pdfPath: string, toEmail: string, subject: string, body: string): Promise<EmailOutcome> {
  const settings = readAppSettings();
  if (settings.email.mode === 'smtp') {
    const password = readSmtpPassword() ?? '';
    await sendSmtp({ ...settings.email, password }, { to: toEmail, subject, body, attachmentPath: pdfPath });
    return { route: 'smtp', sent: true };
  }
  try {
    await composeOutlookEmailWithAttachment(pdfPath, toEmail, subject, body);
  } catch (err) {
    throw new Error(`Couldn't open Outlook (${err instanceof Error ? err.message : String(err)}). Either install desktop Outlook, or set up a mail server under Settings → Email so messages send directly.`);
  }
  return { route: 'outlook', opened: true };
}
