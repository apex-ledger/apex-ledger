import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { AppointmentRecord, ClientRecord, ReminderRecord } from '@shared/domain/types';

function clientsFilePath(): string {
  return path.join(app.getPath('userData'), 'clients.json');
}

function remindersFilePath(): string {
  return path.join(app.getPath('userData'), 'reminders.json');
}

function appointmentsFilePath(): string {
  return path.join(app.getPath('userData'), 'appointments.json');
}

function deadlineAcksFilePath(): string {
  return path.join(app.getPath('userData'), 'deadline-acks.json');
}

function readJsonArray<T>(filePath: string): T[] {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeJsonArray(filePath: string, data: unknown[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/** Backfills fields added after some clients were already saved to disk — 0.1.46 briefly stored a
 * single `insuranceType` string before this became a multi-select list, and `comments` didn't
 * exist before this version at all. Normalizing on read means older records never crash the UI
 * just because a newer field is missing. */
function normalizeClient(record: ClientRecord & { insuranceType?: string | null }): ClientRecord {
  const { insuranceType, ...rest } = record;
  return {
    ...rest,
    insuranceTypes: Array.isArray(record.insuranceTypes)
      ? record.insuranceTypes
      : insuranceType
        ? [insuranceType as ClientRecord['insuranceTypes'][number]]
        : [],
    comments: Array.isArray(record.comments) ? record.comments : [],
    policyExpiryDate: record.policyExpiryDate ?? null,
    homeOwnership: record.homeOwnership ?? null,
    address: record.address ?? null,
  };
}

export function listClients(): ClientRecord[] {
  return readJsonArray<ClientRecord>(clientsFilePath()).map(normalizeClient);
}

export type ClientInput = Omit<ClientRecord, 'id' | 'createdAt'> & { id?: string };

export function saveClient(input: ClientInput): ClientRecord {
  const clients = listClients();
  if (input.id) {
    const idx = clients.findIndex((c) => c.id === input.id);
    if (idx >= 0) {
      const updated: ClientRecord = { ...clients[idx], ...input, id: clients[idx].id };
      clients[idx] = updated;
      writeJsonArray(clientsFilePath(), clients);
      return updated;
    }
  }
  const record: ClientRecord = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  clients.push(record);
  writeJsonArray(clientsFilePath(), clients);
  return record;
}

export function deleteClient(id: string): void {
  writeJsonArray(clientsFilePath(), listClients().filter((c) => c.id !== id));
  // Custom reminders linked only to this client are orphaned but kept — they still show as
  // unlinked "general" reminders rather than silently disappearing.
}

export function listReminders(): ReminderRecord[] {
  return readJsonArray<ReminderRecord>(remindersFilePath());
}

export type ReminderInput = Omit<ReminderRecord, 'id' | 'createdAt'> & { id?: string };

export function saveReminder(input: ReminderInput): ReminderRecord {
  const reminders = listReminders();
  if (input.id) {
    const idx = reminders.findIndex((r) => r.id === input.id);
    if (idx >= 0) {
      const updated: ReminderRecord = { ...reminders[idx], ...input, id: reminders[idx].id };
      reminders[idx] = updated;
      writeJsonArray(remindersFilePath(), reminders);
      return updated;
    }
  }
  const record: ReminderRecord = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  reminders.push(record);
  writeJsonArray(remindersFilePath(), reminders);
  return record;
}

export function deleteReminder(id: string): void {
  writeJsonArray(remindersFilePath(), listReminders().filter((r) => r.id !== id));
}

export function listAppointments(): AppointmentRecord[] {
  return readJsonArray<AppointmentRecord>(appointmentsFilePath());
}

export type AppointmentInput = Omit<AppointmentRecord, 'id' | 'createdAt'> & { id?: string };

export function saveAppointment(input: AppointmentInput): AppointmentRecord {
  const appointments = listAppointments();
  if (input.id) {
    const idx = appointments.findIndex((a) => a.id === input.id);
    if (idx >= 0) {
      const updated: AppointmentRecord = { ...appointments[idx], ...input, id: appointments[idx].id };
      appointments[idx] = updated;
      writeJsonArray(appointmentsFilePath(), appointments);
      return updated;
    }
  }
  const record: AppointmentRecord = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  appointments.push(record);
  writeJsonArray(appointmentsFilePath(), appointments);
  return record;
}

export function deleteAppointment(id: string): void {
  writeJsonArray(appointmentsFilePath(), listAppointments().filter((a) => a.id !== id));
}

/** Which computed deadlines (see computeDeadlines.ts) the practice has already told the client
 * about. Deadlines aren't stored rows — they're recomputed fresh every time from each client's
 * fiscal data — so this just tracks a set of stable keys (`clientId::category::dueDate`) rather
 * than linking to a real record id. A new occurrence of the same category (next quarter's HST
 * filing, say) gets its own key once its dueDate changes, so "informed" never carries over to a
 * future period by accident. */
export function listInformedDeadlineKeys(): string[] {
  return readJsonArray<string>(deadlineAcksFilePath());
}

export function setDeadlineInformed(key: string, informed: boolean): void {
  const keys = new Set(listInformedDeadlineKeys());
  if (informed) keys.add(key);
  else keys.delete(key);
  writeJsonArray(deadlineAcksFilePath(), [...keys]);
}
