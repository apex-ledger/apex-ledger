import { dialog, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import { saveAppointmentSchema, saveClientSchema, saveReminderSchema, setDeadlineInformedSchema, snoozeAppointmentSchema } from '@shared/validation/schemas';
import { buildClientSheetCsv } from '@shared/domain/clients/buildClientSheetCsv';
import { parseClientImportCsv } from '@shared/domain/clients/parseClientImportCsv';
import { generateClientSheetPdf } from '../forms/generateClientSheetPdf';
import { savePdfAndOpen } from '../forms/savePdfAndOpen';
import * as registry from '../clientsRegistry';

export function clientsList() {
  return registry.listClients();
}

export async function clientsExportSheet(window: BrowserWindow) {
  const clients = registry.listClients();
  const csv = buildClientSheetCsv(clients);
  const saveResult = await dialog.showSaveDialog(window, {
    title: 'Export Client Sheet',
    defaultPath: 'client-sheet.csv',
    filters: [{ name: 'CSV (Excel)', extensions: ['csv'] }],
  });
  if (saveResult.canceled || !saveResult.filePath) return { saved: false as const };
  fs.writeFileSync(saveResult.filePath, csv, 'utf-8');
  return { saved: true as const, filePath: saveResult.filePath, clientCount: clients.length };
}

export async function clientsExportPdf(window: BrowserWindow) {
  const clients = registry.listClients();
  const bytes = await generateClientSheetPdf(clients);
  const result = await savePdfAndOpen(window, 'Export Client Sheet', 'client-sheet.pdf', bytes);
  if (!result.saved) return { saved: false as const };
  return { saved: true as const, filePath: result.filePath, clientCount: clients.length };
}

/** Fiscal-year-end and HST filing frequency have no equivalent column in the client sheet (it's a
 * basic roster, not a full client profile), so imported clients get safe defaults — a Dec 31
 * year-end and no HST obligation on record — and can be corrected per-client afterward in Client
 * Hub. Leaving HST at 'None' avoids silently assuming a filing obligation that may not exist. */
export async function clientsImportCsv(window: BrowserWindow) {
  const openResult = await dialog.showOpenDialog(window, {
    title: 'Import Clients from CSV',
    properties: ['openFile'],
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });
  if (openResult.canceled || openResult.filePaths.length === 0) return { imported: false as const };

  const csvText = fs.readFileSync(openResult.filePaths[0], 'utf-8');
  const { rows, skippedRowNumbers } = parseClientImportCsv(csvText);

  for (const row of rows) {
    registry.saveClient({
      clientName: row.clientName,
      phone: row.phone,
      email: row.email,
      companyFilePath: null,
      fiscalYearEndMonth: 12,
      fiscalYearEndDay: 31,
      hstFilingFrequency: 'None',
      notes: '',
      firstName: null,
      lastName: null,
      address: row.address,
      sin: null,
      dateOfBirth: row.dateOfBirth,
      gender: 'Unspecified',
      maritalStatus: null,
      spouseFirstName: null,
      spouseLastName: null,
      spouseSin: null,
      spouseDateOfBirth: null,
      dependents: [],
      employmentStatus: null,
      homeOwnership: row.homeOwnership,
      returnType: row.returnType,
      returnCompleted: false,
      returnFiled: false,
      outstandingDocuments: [],
      insuranceTypes: row.insuranceTypes,
      policyExpiryDate: null,
      comments: [],
    });
  }

  return { imported: true as const, importedCount: rows.length, skippedCount: skippedRowNumbers.length };
}

export function clientsSave(input: unknown) {
  const payload = saveClientSchema.parse(input);
  return registry.saveClient(payload);
}

export function clientsDelete(id: string) {
  registry.deleteClient(id);
  return { deleted: true } as const;
}

export function remindersList() {
  return registry.listReminders();
}

export function remindersSave(input: unknown) {
  const payload = saveReminderSchema.parse(input);
  return registry.saveReminder(payload);
}

export function remindersDelete(id: string) {
  registry.deleteReminder(id);
  return { deleted: true } as const;
}

export function appointmentsList() {
  return registry.listAppointments();
}

export function appointmentsSave(input: unknown) {
  const payload = saveAppointmentSchema.parse(input);
  return registry.saveAppointment(payload);
}

export function appointmentsDelete(id: string) {
  registry.deleteAppointment(id);
  return { deleted: true } as const;
}

/** Snoozing only ever touches snoozedUntil — never the appointment's own date/time/urgency —
 * so re-snoozing repeatedly can't accidentally drift other fields. */
export function appointmentsSnooze(input: unknown) {
  const { id, snoozedUntil } = snoozeAppointmentSchema.parse(input);
  const appointments = registry.listAppointments();
  const existing = appointments.find((a) => a.id === id);
  if (!existing) throw new Error(`Appointment ${id} not found.`);
  return registry.saveAppointment({ ...existing, snoozedUntil });
}

export function deadlineAcksList() {
  return registry.listInformedDeadlineKeys();
}

export function deadlineAcksSetInformed(input: unknown) {
  const { key, informed } = setDeadlineInformedSchema.parse(input);
  registry.setDeadlineInformed(key, informed);
  return { key, informed };
}
