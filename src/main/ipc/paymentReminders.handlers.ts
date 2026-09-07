import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { z } from 'zod';
import { buildReminderDraft, formatDollars, type ReminderDraft } from '@shared/domain/sales/paymentReminders';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { getCurrentDb } from '../companyFile';
import { getAllInvoices } from '../db/queries';
import { mapContactRow } from '../db/mappers';
import { sendEmailWithAttachment } from '../email/sendEmail';
import { BORDER, BRAND_900, PAGE_HEIGHT, PAGE_WIDTH, TEXT_DARK, TEXT_MUTED, companyAddressLines, drawCompanyLogo } from '../forms/pdfStyle';
import { companyGet } from './company.handlers';
import { recordUserActivity } from '../userActivity';

const inputSchema = z.object({ customerId: z.number().int().positive() });

export interface ReminderPreview extends ReminderDraft {
  customerId: number;
  customerName: string;
  customerEmail: string | null;
}

async function draftFor(customerId: number): Promise<ReminderPreview | null> {
  const db = getCurrentDb();
  const row = await db.selectFrom('customers').selectAll().where('id', '=', customerId).executeTakeFirst();
  if (!row) throw new Error('Customer not found.');
  const customer = mapContactRow(row);
  const company = await companyGet();
  const invoices = (await getAllInvoices(db)).filter((inv) => inv.customerId === customerId && inv.balanceDueCents > 0);
  const draft = buildReminderDraft({
    customerName: customer.name,
    companyName: company.displayName || company.legalName,
    invoices: invoices.map((inv) => ({ invoiceNumber: inv.invoiceNumber, invoiceDate: inv.invoiceDate, dueDate: inv.dueDate, balanceDueCents: inv.balanceDueCents, totalCents: inv.totalCents })),
    today: localIsoDate(),
  });
  if (!draft) return null;
  return { ...draft, customerId, customerName: customer.name, customerEmail: customer.email };
}

/** The email as it would be sent — for the "Send reminder" confirmation. */
export async function paymentRemindersPreview(input: unknown): Promise<ReminderPreview | null> {
  const { customerId } = inputSchema.parse(input);
  return draftFor(customerId);
}

/** One-page statement of account: every open invoice, days overdue, total. Attached to the email. */
/** The same statement sheet, for the month-end batch in customerStatements.handlers. */
export async function statementPdfFor(preview: ReminderPreview): Promise<Uint8Array> {
  return statementPdf(preview);
}

async function statementPdf(preview: ReminderPreview): Promise<Uint8Array> {
  const company = await companyGet();
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = PAGE_HEIGHT - 60;
  await drawCompanyLogo(doc, page, company.logoDataUrl, PAGE_WIDTH - 50, PAGE_HEIGHT - 40, 50, 160);
  page.drawText(company.displayName || company.legalName, { x: 50, y, size: 16, font: bold, color: BRAND_900 });
  y -= 16;
  for (const line of companyAddressLines(company)) { page.drawText(line, { x: 50, y, size: 9, font, color: TEXT_MUTED }); y -= 12; }
  y -= 10;
  page.drawText('STATEMENT OF ACCOUNT', { x: 50, y, size: 14, font: bold, color: TEXT_DARK });
  page.drawText(`As at ${localIsoDate()}`, { x: PAGE_WIDTH - 50 - font.widthOfTextAtSize(`As at ${localIsoDate()}`, 10), y, size: 10, font, color: TEXT_MUTED });
  y -= 24;
  page.drawText(preview.customerName, { x: 50, y, size: 11, font: bold, color: TEXT_DARK });
  y -= 26;
  const cols = [50, 150, 250, 340, 440, 520];
  const headers = ['Invoice', 'Date', 'Due', 'Days overdue', 'Amount', ''];
  headers.forEach((h, i) => page.drawText(h, { x: cols[i], y, size: 9, font: bold, color: TEXT_MUTED }));
  y -= 6;
  page.drawLine({ start: { x: 50, y }, end: { x: PAGE_WIDTH - 50, y }, thickness: 0.8, color: BORDER });
  y -= 14;
  for (const inv of preview.invoices) {
    page.drawText(inv.invoiceNumber, { x: cols[0], y, size: 10, font, color: TEXT_DARK });
    page.drawText(inv.invoiceDate, { x: cols[1], y, size: 10, font, color: TEXT_DARK });
    page.drawText(inv.dueDate, { x: cols[2], y, size: 10, font, color: TEXT_DARK });
    page.drawText(inv.daysLate > 0 ? String(inv.daysLate) : '—', { x: cols[3], y, size: 10, font, color: TEXT_DARK });
    const amount = formatDollars(inv.balanceDueCents);
    page.drawText(amount, { x: cols[5] + 40 - font.widthOfTextAtSize(amount, 10), y, size: 10, font, color: TEXT_DARK });
    y -= 16;
  }
  y -= 4;
  page.drawLine({ start: { x: 50, y }, end: { x: PAGE_WIDTH - 50, y }, thickness: 0.8, color: BORDER });
  y -= 18;
  const total = `Total outstanding ${formatDollars(preview.totalCents)}`;
  page.drawText(total, { x: PAGE_WIDTH - 50 - bold.widthOfTextAtSize(total, 11), y, size: 11, font: bold, color: TEXT_DARK });
  if (preview.overdueCents > 0) {
    y -= 16;
    const overdue = `Of which overdue ${formatDollars(preview.overdueCents)}`;
    page.drawText(overdue, { x: PAGE_WIDTH - 50 - font.widthOfTextAtSize(overdue, 10), y, size: 10, font, color: TEXT_MUTED });
  }
  y -= 40;
  page.drawText('Please quote the invoice number with your payment. Thank you for your business.', { x: 50, y, size: 9, font, color: TEXT_MUTED });
  return doc.save();
}

/** Opens Outlook with the reminder addressed, written and the statement attached. The person
 * reviews and presses Send — nothing leaves the firm without a human looking at it. */
export async function paymentRemindersEmailViaOutlook(input: unknown): Promise<{ opened: true; tier: ReminderDraft['tier']; totalCents: number }> {
  const { customerId } = inputSchema.parse(input);
  const preview = await draftFor(customerId);
  if (!preview) throw new Error('This customer has nothing outstanding.');
  if (!preview.customerEmail) throw new Error('This customer has no email address on file — add one in Customers first.');
  const bytes = await statementPdf(preview);
  const tempPath = path.join(os.tmpdir(), `${crypto.randomUUID()}-Statement-${preview.customerName.replace(/[^A-Za-z0-9]+/g, '_')}.pdf`);
  fs.writeFileSync(tempPath, bytes);
  try {
    await sendEmailWithAttachment(tempPath, preview.customerEmail, preview.subject, preview.body);
  } catch (err) {
    throw new Error(`Email could not be sent (${err instanceof Error ? err.message : String(err)}).`);
  }
  await recordUserActivity('paymentReminder', { name: `${preview.customerName} — ${preview.tier}` });
  return { opened: true, tier: preview.tier, totalCents: preview.totalCents };
}

/** Every customer with an overdue balance, with the reminder tier each would get — the bulk view. */
export async function paymentRemindersOverdueCustomers(): Promise<Array<{ customerId: number; customerName: string; customerEmail: string | null; tier: ReminderDraft['tier']; totalCents: number; overdueCents: number; oldestDaysLate: number }>> {
  const db = getCurrentDb();
  const company = await companyGet();
  const today = localIsoDate();
  const [customers, invoices] = await Promise.all([db.selectFrom('customers').selectAll().execute(), getAllInvoices(db)]);
  const out = [];
  for (const row of customers) {
    const open = invoices.filter((inv) => inv.customerId === row.id && inv.balanceDueCents > 0);
    if (open.length === 0) continue;
    const draft = buildReminderDraft({ customerName: row.name, companyName: company.displayName || company.legalName, invoices: open.map((inv) => ({ invoiceNumber: inv.invoiceNumber, invoiceDate: inv.invoiceDate, dueDate: inv.dueDate, balanceDueCents: inv.balanceDueCents, totalCents: inv.totalCents })), today });
    if (!draft || draft.overdueCents === 0) continue;
    out.push({ customerId: row.id, customerName: row.name, customerEmail: row.email, tier: draft.tier, totalCents: draft.totalCents, overdueCents: draft.overdueCents, oldestDaysLate: draft.oldestDaysLate });
  }
  return out.sort((a, b) => b.oldestDaysLate - a.oldestDaysLate);
}
