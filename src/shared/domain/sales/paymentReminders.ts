/**
 * Payment reminders — the email a firm sends a customer about what is outstanding.
 *
 * One reminder per customer, not per invoice: a customer with three open invoices gets one note
 * listing all three with a total, the way QuickBooks' reminders and statements work. The tone
 * steps up with how late the oldest invoice is, and the wording never threatens — a small firm's
 * clients are also its referrals. The statement of account PDF that travels with the email is
 * built from the same figures, so the letter and the attachment cannot disagree.
 */
export interface OpenInvoiceForReminder {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  balanceDueCents: number;
  totalCents: number;
}

export type ReminderTier = 'upcoming' | 'due' | 'overdue' | 'final';

export interface ReminderDraft {
  tier: ReminderTier;
  subject: string;
  body: string;
  totalCents: number;
  overdueCents: number;
  oldestDaysLate: number;
  invoices: Array<OpenInvoiceForReminder & { daysLate: number }>;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function reminderTier(oldestDaysLate: number): ReminderTier {
  if (oldestDaysLate <= 0) return 'upcoming';
  if (oldestDaysLate <= 14) return 'due';
  if (oldestDaysLate <= 60) return 'overdue';
  return 'final';
}

export function buildReminderDraft(input: { customerName: string; companyName: string; invoices: OpenInvoiceForReminder[]; today: string; signoff?: string | null }): ReminderDraft | null {
  const open = input.invoices.filter((inv) => inv.balanceDueCents > 0).map((inv) => ({ ...inv, daysLate: Math.max(0, daysBetween(inv.dueDate, input.today)) })).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (open.length === 0) return null;
  const totalCents = open.reduce((sum, inv) => sum + inv.balanceDueCents, 0);
  const overdue = open.filter((inv) => inv.daysLate > 0);
  const overdueCents = overdue.reduce((sum, inv) => sum + inv.balanceDueCents, 0);
  const oldestDaysLate = Math.max(0, ...open.map((inv) => inv.daysLate));
  const tier = reminderTier(oldestDaysLate);
  const many = open.length > 1;

  const subject =
    tier === 'upcoming' ? `Statement of account from ${input.companyName}` :
    tier === 'due' ? `Friendly reminder: ${many ? `${open.length} invoices` : `invoice ${open[0].invoiceNumber}`} from ${input.companyName}` :
    tier === 'overdue' ? `Overdue: ${formatDollars(overdueCents)} outstanding — ${input.companyName}` :
    `Final notice: ${formatDollars(overdueCents)} outstanding — ${input.companyName}`;

  const opening =
    tier === 'upcoming' ? `Here is your current statement of account with ${input.companyName}. Nothing is overdue.` :
    tier === 'due' ? `A quick reminder that the ${many ? 'invoices' : 'invoice'} below ${many ? 'are' : 'is'} now past ${many ? 'their' : 'its'} due date. If payment is already on its way, thank you — please disregard this note.` :
    tier === 'overdue' ? `Our records show the ${many ? 'invoices' : 'invoice'} below ${many ? 'are' : 'is'} outstanding. We would appreciate payment at your earliest convenience, or a quick note if there is a question about any of ${many ? 'them' : 'it'}.` :
    `Despite earlier reminders, the ${many ? 'invoices' : 'invoice'} below ${many ? 'remain' : 'remains'} unpaid. Please arrange payment within 7 days or contact us to discuss — we would much rather sort this out together.`;

  const lines = open.map((inv) => `  • ${inv.invoiceNumber}  dated ${inv.invoiceDate}  due ${inv.dueDate}  ${formatDollars(inv.balanceDueCents)}${inv.daysLate > 0 ? `  (${inv.daysLate} day${inv.daysLate === 1 ? '' : 's'} overdue)` : ''}`);
  const body = [
    `Hi ${input.customerName},`,
    '',
    opening,
    '',
    ...lines,
    '',
    `Total outstanding: ${formatDollars(totalCents)}${overdueCents > 0 && overdueCents !== totalCents ? ` (of which ${formatDollars(overdueCents)} overdue)` : ''}`,
    '',
    'A statement of account is attached. Payment can be made by e-transfer or cheque; the details are on each invoice.',
    '',
    input.signoff?.trim() ? input.signoff.trim() : `Thank you,\n${input.companyName}`,
  ].join('\n');

  return { tier, subject, body, totalCents, overdueCents, oldestDaysLate, invoices: open };
}
