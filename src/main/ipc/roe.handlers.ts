import { dialog, shell, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import { z } from 'zod';
import { buildRoeXml, computeRoe, type RoeInput, type RoeResult } from '@shared/domain/payroll/recordOfEmployment';
import { employeeAddressLines } from '@shared/domain/payroll/employeeAddress';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { getCurrentDb } from '../companyFile';
import { getAllPayrollRuns, getEmployeeById } from '../db/queries';
import { companyGet } from './company.handlers';
import { companyAddressLines } from '../forms/pdfStyle';
import { generateRoePdf } from '../forms/generateRoePdf';
import { safeFileNamePart, savePdfAndOpen } from '../forms/savePdfAndOpen';

export const roeRequestSchema = z.object({
  employeeId: z.number().int().positive(),
  reasonCode: z.string().trim().min(1).max(3),
  lastDayPaid: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expectedRecall: z.union([z.literal('unknown'), z.literal('notReturning'), z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })]),
  comments: z.string().max(160).nullable().optional(),
  contactName: z.string().max(80).nullable().optional(),
  contactPhone: z.string().max(30).nullable().optional(),
  standardWeeklyHours: z.number().min(1).max(80).optional(),
});
export type RoeRequest = z.infer<typeof roeRequestSchema>;

export interface RoePreview {
  input: RoeInput;
  roe: RoeResult;
}

/** Gathers everything the ROE needs from the company, the employee and their posted pay runs. */
async function buildRoeInput(raw: unknown): Promise<RoeInput> {
  const req = roeRequestSchema.parse(raw);
  const db = getCurrentDb();
  const employee = await getEmployeeById(db, req.employeeId);
  if (!employee) throw new Error(`Employee ${req.employeeId} not found.`);
  const company = await companyGet();
  const runs = (await getAllPayrollRuns(db, req.employeeId)).filter((r) => r.status === 'posted');
  return {
    employee: { name: employee.name, sin: employee.sin, payPeriodsPerYear: employee.payPeriodsPerYear, payType: employee.payType, addressLines: employeeAddressLines(employee) },
    employer: { legalName: company.legalName, payrollNumber: company.payrollNumber, addressLines: companyAddressLines(company), contactName: req.contactName ?? null, contactPhone: req.contactPhone ?? null },
    runs: runs.map((r) => ({ payPeriodStart: r.payPeriodStart, payPeriodEnd: r.payPeriodEnd, payDate: r.payDate, regularHours: r.regularHours, overtimeHours: r.overtimeHours, grossPayCents: r.grossPayCents, vacationPayCents: r.vacationPayCents, isVacationPayout: r.isVacationPayout })),
    reasonCode: req.reasonCode,
    lastDayPaid: req.lastDayPaid,
    expectedRecall: req.expectedRecall,
    comments: req.comments ?? null,
    standardWeeklyHours: req.standardWeeklyHours,
  };
}

export async function roePreview(raw: unknown): Promise<RoePreview> {
  const input = await buildRoeInput(raw);
  return { input, roe: computeRoe(input) };
}

export async function roeSavePdf(window: BrowserWindow, raw: unknown) {
  const input = await buildRoeInput(raw);
  const roe = computeRoe(input);
  const bytes = await generateRoePdf(input, roe, localIsoDate());
  return savePdfAndOpen(window, 'Save ROE Worksheet', `ROE - ${safeFileNamePart(input.employee.name)} - ${input.lastDayPaid}.pdf`, bytes);
}

/** Writes the ROE Web bulk-upload XML where the firm chooses. The firm uploads it to ROE Web
 * under its own Service Canada credentials; nothing is transmitted from here. */
export async function roeSaveXml(window: BrowserWindow, raw: unknown) {
  const input = await buildRoeInput(raw);
  const roe = computeRoe(input);
  const xml = buildRoeXml(input, roe, localIsoDate());
  const result = await dialog.showSaveDialog(window, {
    title: 'Save ROE Web XML',
    defaultPath: `ROE - ${safeFileNamePart(input.employee.name)} - ${input.lastDayPaid}.xml`,
    filters: [{ name: 'ROE Web XML', extensions: ['xml'] }],
  });
  if (result.canceled || !result.filePath) return { saved: false as const };
  fs.writeFileSync(result.filePath, xml, 'utf8');
  await shell.showItemInFolder(result.filePath);
  return { saved: true as const, filePath: result.filePath };
}
