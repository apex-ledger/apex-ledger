import { app, dialog, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { buildCpa005File, validateCpa005, type Cpa005Credit, type Cpa005Originator, type Cpa005Problem } from '@shared/domain/payroll/cpa005';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { getCurrentDb } from '../companyFile';
import { recordUserActivity } from '../userActivity';

/**
 * Payroll direct deposit: turns the posted pay runs for one pay date into the CPA-005 file the
 * bank's business portal takes. The preview lists every employee with their net pay and flags
 * anyone whose bank details are missing before a file is written; the save bumps the company's
 * file creation number so the next file is accepted.
 */
const dateSchema = z.object({ payDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export interface DirectDepositPreview {
  payDate: string;
  payees: Array<{ employeeId: number; name: string; netPayCents: number; institution: string | null; transit: string | null; account: string | null; runId: number }>;
  totalCents: number;
  problems: Cpa005Problem[];
  nextFileNumber: number;
}

async function loadOriginator(): Promise<{ originator: Cpa005Originator; companyName: string }> {
  const db = getCurrentDb();
  const c = await db.selectFrom('companyInfo').selectAll().where('id', '=', 1).executeTakeFirstOrThrow();
  const name = c.displayName || c.legalName;
  return {
    companyName: name,
    originator: {
      originatorId: c.eftOriginatorId ?? '',
      originatorShortName: c.eftOriginatorShortName ?? name.slice(0, 15),
      originatorLongName: name,
      dataCentre: c.eftDataCentre ?? '',
      fileCreationNumber: (c.eftFileCreationNumber ?? 0) + 1,
      settlementInstitution: c.eftSettlementInstitution ?? '',
      settlementTransit: c.eftSettlementTransit ?? '',
      settlementAccount: c.eftSettlementAccount ?? '',
    },
  };
}

async function creditsForPayDate(payDate: string): Promise<{ preview: DirectDepositPreview; credits: Cpa005Credit[]; originator: Cpa005Originator }> {
  const db = getCurrentDb();
  const { originator } = await loadOriginator();
  const runs = await db.selectFrom('payrollRuns').innerJoin('employees', 'employees.id', 'payrollRuns.employeeId')
    .select(['payrollRuns.id as runId', 'payrollRuns.employeeId as employeeId', 'payrollRuns.netPayCents as netPayCents', 'employees.name as name', 'employees.bankInstitution as institution', 'employees.bankTransit as transit', 'employees.bankAccount as account'])
    .where('payrollRuns.payDate', '=', payDate).where('payrollRuns.status', '=', 'posted').orderBy('employees.name').execute();
  const payees = runs.map((r) => ({ employeeId: r.employeeId, name: r.name, netPayCents: r.netPayCents, institution: r.institution, transit: r.transit, account: r.account, runId: r.runId }));
  const credits: Cpa005Credit[] = payees.map((p) => ({ payeeName: p.name, institution: p.institution ?? '', transit: p.transit ?? '', account: p.account ?? '', amountCents: p.netPayCents, dueDate: payDate, crossReference: `PAY ${payDate}` }));
  const problems = validateCpa005(originator, credits);
  const preview: DirectDepositPreview = { payDate, payees, totalCents: payees.reduce((s, p) => s + p.netPayCents, 0), problems, nextFileNumber: originator.fileCreationNumber };
  return { preview, credits, originator };
}

/** Pay dates with posted runs — what the panel offers. */
export async function directDepositPayDates(): Promise<Array<{ payDate: string; employees: number; totalCents: number }>> {
  const rows = await getCurrentDb().selectFrom('payrollRuns').select(['payDate', 'netPayCents']).where('status', '=', 'posted').execute();
  const map = new Map<string, { payDate: string; employees: number; totalCents: number }>();
  for (const r of rows) { const s = map.get(r.payDate) ?? { payDate: r.payDate, employees: 0, totalCents: 0 }; s.employees += 1; s.totalCents += r.netPayCents; map.set(r.payDate, s); }
  return [...map.values()].sort((a, b) => b.payDate.localeCompare(a.payDate)).slice(0, 24);
}

export async function directDepositPreview(input: unknown): Promise<DirectDepositPreview> {
  const { payDate } = dateSchema.parse(input);
  return (await creditsForPayDate(payDate)).preview;
}

/** Writes the file where the user chooses and advances the file creation number. */
export async function directDepositSaveFile(window: BrowserWindow, input: unknown): Promise<{ saved: boolean; filePath?: string; fileNumber?: number; totalCents?: number }> {
  const { payDate } = dateSchema.parse(input);
  const { credits, originator, preview } = await creditsForPayDate(payDate);
  if (preview.problems.length > 0) throw new Error(preview.problems.map((p) => `${p.payee}: ${p.problem}`).join('\n'));
  const file = buildCpa005File(originator, credits, localIsoDate());
  const result = await dialog.showSaveDialog(window, {
    title: 'Save direct deposit file',
    defaultPath: path.join(app.getPath('documents'), `Payroll-DD-${payDate}-${String(originator.fileCreationNumber).padStart(4, '0')}.txt`),
    filters: [{ name: 'Bank file', extensions: ['txt', 'dat'] }],
  });
  if (result.canceled || !result.filePath) return { saved: false };
  fs.writeFileSync(result.filePath, file.content, 'latin1');
  await getCurrentDb().updateTable('companyInfo').set({ eftFileCreationNumber: originator.fileCreationNumber }).where('id', '=', 1).execute();
  await recordUserActivity('directDeposit', { name: `Pay ${payDate} file ${originator.fileCreationNumber} — ${credits.length} payees, ${(file.totalCents / 100).toFixed(2)}` });
  return { saved: true, filePath: result.filePath, fileNumber: originator.fileCreationNumber, totalCents: file.totalCents };
}
