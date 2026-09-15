import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import { computeT4SlipsForYear } from '@shared/domain/payroll/computeT4Slip';
import { computeT4ASlipsForYear } from '@shared/domain/payroll/computeT4ASlip';
import { computeT5018SlipsForYear } from '@shared/domain/payroll/computeT5018Slip';
import { computeT5SlipsForYear } from '@shared/domain/payroll/computeT5Slip';
import { maskSinForEmail } from '@shared/domain/payroll/slipDelivery';
import { getCurrentDb } from '../companyFile';
import { getAllBills, getAllEmployees, getAllPayrollRuns, getAllShareholders, getAllT5Payments, getAllVendors } from '../db/queries';
import { generateT4Pdf } from '../forms/generateT4Pdf';
import { generateT4APdf } from '../forms/generateT4APdf';
import { generateT5018Pdf } from '../forms/generateT5018Pdf';
import { generateT5Pdf } from '../forms/generateT5Pdf';
import { generatePaystubPdf } from '../forms/generatePaystubPdf';
import { sendPlatformEmailWithAttachment } from '../email/sendEmail';
import { recordUserActivity } from '../userActivity';
import { companyGet } from './company.handlers';
import { payrollRunsGetPaystub } from './payroll.handlers';

/**
 * Emailing year-end information slips and pay stubs to the people they describe.
 *
 * Three rules, because these carry pay, SINs and dividends rather than a price list:
 *
 *   1. One slip per email, to that person only. The batch PDF puts every slip and the T4 Summary
 *      in one file for the employer; an employee's copy never carries anyone else's pay.
 *   2. The SIN on the emailed copy is masked to its last three digits. Email is not a secure
 *      channel; the full SIN belongs on the copy filed with the CRA, not in an inbox.
 *   3. The sender confirms the recipient agreed to electronic delivery. The CRA allows slips to be
 *      given electronically with the recipient's consent; the send is refused without that
 *      confirmation, on the server, whatever the screen did.
 *
 * Pay stubs already show only the last four digits of the SIN, and provincial employment standards
 * allow wage statements to be given electronically, so they need no separate consent step.
 */
export type SlipKind = 't4' | 't4a' | 't5018' | 't5';

const SLIP_LABEL: Record<SlipKind, string> = { t4: 'T4', t4a: 'T4A', t5018: 'T5018', t5: 'T5' };

interface Recipient {
  key: number;
  name: string;
  email: string | null;
  amountCents: number;
  render: () => Promise<Uint8Array>;
}

async function recipientsFor(kind: SlipKind, taxYear: number): Promise<Recipient[]> {
  const db = getCurrentDb();
  const company = await companyGet();
  if (kind === 't4') {
    const [runs, employees] = await Promise.all([getAllPayrollRuns(db), getAllEmployees(db)]);
    return computeT4SlipsForYear(runs, employees, taxYear).map((slip) => ({
      key: slip.employeeId,
      name: slip.employeeName,
      email: employees.find((e) => e.id === slip.employeeId)?.email ?? null,
      amountCents: slip.employmentIncomeCents,
      render: () => generateT4Pdf(company, [{ ...slip, sin: maskSinForEmail(slip.sin) }], null, taxYear),
    }));
  }
  if (kind === 't4a' || kind === 't5018') {
    const [bills, vendors, payments] = await Promise.all([getAllBills(db), getAllVendors(db), db.selectFrom('billPayments').selectAll().execute()]);
    const vendorEmail = (id: number) => vendors.find((v) => v.id === id)?.email ?? null;
    if (kind === 't4a') {
      return computeT4ASlipsForYear(bills, vendors, taxYear, payments).map((slip) => ({
        key: slip.vendorId,
        name: slip.vendorName,
        email: vendorEmail(slip.vendorId),
        amountCents: slip.feesForServicesCents,
        render: () => generateT4APdf(company, [{ ...slip, sin: maskSinForEmail(slip.sin) }], taxYear),
      }));
    }
    return computeT5018SlipsForYear(bills, vendors, taxYear, payments).map((slip) => ({
      key: slip.vendorId,
      name: slip.vendorName,
      email: vendorEmail(slip.vendorId),
      amountCents: slip.totalPaymentsCents,
      render: () => generateT5018Pdf(company, [{ ...slip, sin: maskSinForEmail(slip.sin) }], taxYear),
    }));
  }
  const [payments, shareholders] = await Promise.all([getAllT5Payments(db), getAllShareholders(db)]);
  return computeT5SlipsForYear(payments, shareholders, taxYear).map((slip) => ({
    key: slip.shareholderId,
    name: slip.shareholderName,
    email: shareholders.find((s) => s.id === slip.shareholderId)?.email ?? null,
    amountCents: slip.nonEligibleDividendsCents + slip.eligibleDividendsCents + slip.interestCents,
    render: () => generateT5Pdf(company, [{ ...slip, sin: maskSinForEmail(slip.sin) }], taxYear),
  }));
}

function defaultMessage(kind: SlipKind, taxYear: number, name: string, companyName: string) {
  return {
    subject: `Your ${taxYear} ${SLIP_LABEL[kind]} slip — ${companyName}`,
    body: `Hi ${name},\n\nAttached is your ${SLIP_LABEL[kind]} slip for ${taxYear}, for your income tax return.\n\nFor your privacy, the SIN on this emailed copy shows only its last three digits; the slip filed with the CRA carries it in full. If anything on the slip looks wrong, please reply before you file.\n\nRegards,\n${companyName}`,
  };
}

const kindSchema = z.enum(['t4', 't4a', 't5018', 't5']);
const CONSENT_REFUSAL = 'Confirm that the recipient has agreed to receive their slip electronically before it is emailed.';

async function sendPdf(bytes: Uint8Array, fileName: string, to: string, subject: string, body: string, replyTo?: string) {
  const tempPath = path.join(os.tmpdir(), `${crypto.randomUUID()}-${fileName.replace(/[\\/:*?"<>|]/g, '')}`);
  fs.writeFileSync(tempPath, bytes);
  try {
    await sendPlatformEmailWithAttachment(tempPath, to, subject, body, replyTo);
  } finally {
    // A slip with pay and a partial SIN should not outlive the send in a temp folder.
    fs.rmSync(tempPath, { force: true });
  }
}

/** Who would get a slip of this kind for the year, with the address on file — for the send list. */
export async function slipsRecipients(input: unknown) {
  const { kind, taxYear } = z.object({ kind: kindSchema, taxYear: z.number().int() }).parse(input);
  const company = await companyGet();
  return (await recipientsFor(kind, taxYear)).map(({ key, name, email, amountCents }) => ({
    key, name, email, amountCents, ...defaultMessage(kind, taxYear, name, company.displayName || company.legalName),
  }));
}

/** One person's slip, to the address typed in the send box. */
export async function slipsSendOne(input: unknown) {
  const { kind, taxYear, key, to, subject, body, replyTo, consentConfirmed } = z.object({
    kind: kindSchema, taxYear: z.number().int(), key: z.number().int().positive(),
    to: z.string().trim().min(1, 'Enter an email address to send to.'), subject: z.string().max(300), body: z.string().max(20_000),
    replyTo: z.string().trim().optional(), consentConfirmed: z.boolean().optional(),
  }).parse(input);
  if (!consentConfirmed) throw new Error(CONSENT_REFUSAL);
  const recipient = (await recipientsFor(kind, taxYear)).find((r) => r.key === key);
  if (!recipient) throw new Error(`No ${SLIP_LABEL[kind]} slip for that person in ${taxYear}.`);
  await sendPdf(await recipient.render(), `${SLIP_LABEL[kind]} ${taxYear} - ${recipient.name}.pdf`, to, subject, body, replyTo);
  await recordUserActivity('slips', { name: `${SLIP_LABEL[kind]} ${taxYear} emailed to ${recipient.name}` });
  return { sent: true as const };
}

/** Every slip of the kind for the year, each to its own recipient with the standard note. People
 * with no email on file are skipped and named; one failed address does not stop the rest. */
export async function slipsSendAll(input: unknown) {
  const { kind, taxYear, replyTo, consentConfirmed } = z.object({ kind: kindSchema, taxYear: z.number().int(), replyTo: z.string().trim().optional(), consentConfirmed: z.boolean().optional() }).parse(input);
  if (!consentConfirmed) throw new Error(CONSENT_REFUSAL);
  const company = await companyGet();
  const companyName = company.displayName || company.legalName;
  const sent: string[] = [];
  const skipped: string[] = [];
  const failed: Array<{ name: string; error: string }> = [];
  for (const recipient of await recipientsFor(kind, taxYear)) {
    if (!recipient.email) { skipped.push(recipient.name); continue; }
    const { subject, body } = defaultMessage(kind, taxYear, recipient.name, companyName);
    try {
      await sendPdf(await recipient.render(), `${SLIP_LABEL[kind]} ${taxYear} - ${recipient.name}.pdf`, recipient.email, subject, body, replyTo);
      sent.push(recipient.name);
    } catch (err) {
      failed.push({ name: recipient.name, error: err instanceof Error ? err.message : String(err) });
    }
  }
  await recordUserActivity('slips', { name: `${SLIP_LABEL[kind]} ${taxYear}: ${sent.length} emailed` });
  return { sent, skipped, failed };
}

/** The addressee and wording for one pay stub's send box. */
export async function paystubEmailDefaults(input: unknown) {
  const { id } = z.object({ id: z.number().int().positive() }).parse(input);
  const data = await payrollRunsGetPaystub(id);
  const companyName = data.company.displayName || data.company.legalName;
  return {
    to: data.employee.email ?? null,
    subject: `Pay stub for ${data.run.payDate} — ${companyName}`,
    body: `Hi ${data.employee.name},\n\nAttached is your pay stub for the pay period ${data.run.payPeriodStart} to ${data.run.payPeriodEnd}, paid ${data.run.payDate}.\n\nRegards,\n${companyName}`,
  };
}

/** Sends one pay stub. The stub shows only the last four digits of the SIN. */
export async function paystubSend(input: unknown) {
  const { id, to, subject, body, replyTo } = z.object({
    id: z.number().int().positive(), to: z.string().trim().min(1, 'Enter an email address to send to.'), subject: z.string().max(300), body: z.string().max(20_000), replyTo: z.string().trim().optional(),
  }).parse(input);
  const data = await payrollRunsGetPaystub(id);
  await sendPdf(await generatePaystubPdf(data), `Pay Stub - ${data.employee.name} - ${data.run.payDate}.pdf`, to, subject, body, replyTo);
  await recordUserActivity('payroll', { name: `Pay stub ${data.run.payDate} emailed to ${data.employee.name}` });
  return { sent: true as const };
}
