import { sendSmtp, type SmtpOptions } from '../main/email/smtpClient';
import type { TrialRequest } from './admin';

/**
 * Emails the platform administrator when something arrives from the public website. A trial
 * request is a row in web-admin.db either way; this is what makes it reach an inbox instead of
 * waiting for someone to open Settings. Sent through the same small SMTP client the desktop app
 * uses, so no dependency is added.
 *
 * Environment (all optional; nothing is sent until the host and from address are set):
 *   APEX_SMTP_HOST, APEX_SMTP_PORT (587), APEX_SMTP_SECURITY (starttls | tls)
 *   APEX_SMTP_USER, APEX_SMTP_PASSWORD
 *   APEX_SMTP_FROM        the from address, e.g. admin@apexledger.ca
 *   APEX_NOTIFY_EMAIL     where notices go (default admin@apexledger.ca)
 */
export const DEFAULT_NOTIFY_EMAIL = 'admin@apexledger.ca';

export interface NotifyConfig { smtp: SmtpOptions; to: string }

export function notifyConfigFromEnv(env: NodeJS.ProcessEnv): NotifyConfig | null {
  const host = (env.APEX_SMTP_HOST ?? '').trim();
  const fromAddress = (env.APEX_SMTP_FROM ?? env.APEX_SMTP_USER ?? '').trim();
  if (!host || !fromAddress) return null;
  const port = Number(env.APEX_SMTP_PORT ?? 587);
  const security = (env.APEX_SMTP_SECURITY ?? '').trim().toLowerCase() === 'tls' || (!env.APEX_SMTP_SECURITY && port === 465) ? 'tls' : 'starttls';
  return {
    smtp: { host, port: Number.isFinite(port) && port > 0 ? port : 587, security, user: (env.APEX_SMTP_USER ?? '').trim(), password: env.APEX_SMTP_PASSWORD ?? '', fromName: 'Apex Ledger', fromAddress },
    to: (env.APEX_NOTIFY_EMAIL ?? '').trim() || DEFAULT_NOTIFY_EMAIL,
  };
}

/** The message for a trial request: everything the administrator needs to set the firm up, in one read. */
export function trialRequestMail(t: TrialRequest): { subject: string; body: string } {
  const subject = `Trial request: ${t.firm} (${t.edition}, ${t.seats} seat${t.seats === 1 ? '' : 's'})`;
  const lines = [
    `A trial request came in from apexledger.ca.`,
    '',
    `Firm:      ${t.firm}`,
    `Name:      ${t.name}`,
    `Email:     ${t.email}`,
    `Phone:     ${t.phone || '-'}`,
    `Seat type: ${t.edition}`,
    `Seats:     ${t.seats}`,
    `Received:  ${t.createdAt} (server time)`,
    `Signed:    ${t.agreedName ? `${t.agreedName}, typed as signature under the Subscription Agreement at ${t.agreedAt ?? t.createdAt}` : 'accepted without a typed signature'}`,
    '',
    'Notes:',
    t.message ? t.message : '-',
    '',
    `Set them up under Settings, Organisation & seats on https://online.apexledger.ca/ and mark request #${t.id} done there.`,
  ];
  return { subject, body: lines.join('\n') };
}

const config = notifyConfigFromEnv(process.env);
if (config) console.log(`[notify] website notices go to ${config.to} via ${config.smtp.host}:${config.smtp.port}`);
else console.log(`[notify] APEX_SMTP_HOST and APEX_SMTP_FROM are not set; trial requests are kept in web-admin.db only`);

/** Fire and forget: the website already has its answer, and a mail failure is a log line, not an error for the visitor. */
export function notifyTrialRequest(t: TrialRequest): void {
  if (!config) return;
  const { subject, body } = trialRequestMail(t);
  sendSmtp(config.smtp, { to: config.to, subject, body })
    .then(() => console.log(`[notify] trial request #${t.id} emailed to ${config.to}`))
    .catch((e: unknown) => console.error(`[notify] could not email trial request #${t.id} to ${config.to}: ${e instanceof Error ? e.message : String(e)}`));
}
