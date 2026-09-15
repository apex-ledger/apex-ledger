import { readAppSettings, readSmtpPassword } from '../appSettings';
import { composeOutlookEmailWithAttachment } from '../forms/emailWithOutlook';
import { sendSmtp, type SmtpOptions } from './smtpClient';

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

/** The platform's own mail relay (same Gmail account that sends trial-request notices), read from
 * environment: APEX_SMTP_HOST/PORT/SECURITY/USER/PASSWORD/FROM. Used for "Send email" on documents
 * so it works the same on the web app as on desktop, without every firm needing its own mail
 * server set up first — replies go back to whoever sent it via replyTo, not to Apex Ledger. */
function platformSmtpConfigFromEnv(env: NodeJS.ProcessEnv): SmtpOptions | null {
  const host = (env.APEX_SMTP_HOST ?? '').trim();
  const fromAddress = (env.APEX_SMTP_FROM ?? env.APEX_SMTP_USER ?? '').trim();
  if (!host || !fromAddress) return null;
  const port = Number(env.APEX_SMTP_PORT ?? 587);
  const security = (env.APEX_SMTP_SECURITY ?? '').trim().toLowerCase() === 'tls' || (!env.APEX_SMTP_SECURITY && port === 465) ? 'tls' : 'starttls';
  return { host, port: Number.isFinite(port) && port > 0 ? port : 587, security, user: (env.APEX_SMTP_USER ?? '').trim(), password: env.APEX_SMTP_PASSWORD ?? '', fromName: 'Apex Ledger', fromAddress };
}

export async function sendPlatformEmailWithAttachment(pdfPath: string, toEmail: string, subject: string, body: string, replyTo?: string): Promise<void> {
  const smtp = platformSmtpConfigFromEnv(process.env);
  if (!smtp) throw new Error('Direct email is not set up on this server yet — the APEX_SMTP_* environment variables are missing.');
  await sendSmtp(smtp, { to: toEmail, subject, body, attachmentPath: pdfPath, replyTo: replyTo || undefined });
}
