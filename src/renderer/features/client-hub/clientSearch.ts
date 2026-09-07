import type { AppointmentRecord, ClientRecord, ReminderRecord } from '@shared/domain/types';

function text(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'yes true completed received filed' : 'no false outstanding pending not filed';
  return String(value);
}

function searchableForms(value: unknown): string[] {
  const normalized = text(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  if (!normalized) return [];
  const compact = normalized.replace(/[^a-z0-9]/g, '');
  return compact && compact !== normalized ? [normalized, compact] : [normalized];
}

function dateSearchValues(value: string | null): string[] {
  if (!value) return [];
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return [value];
  const [, year, month, day] = match;
  return [value, `${month}/${day}/${year}`, `${day}/${month}/${year}`, `${year}/${month}/${day}`];
}

function linkedCompanyName(filePath: string | null): string {
  if (!filePath) return '';
  const fileName = filePath.split(/[\\/]/).at(-1) ?? '';
  return fileName.replace(/\.(company|sqlite|db)$/i, '');
}

/** Searches the entire practice-wide client record plus work linked to that client. Each word in
 * the query may match a different field, so "patel rrsp overdue" works even though no one field
 * contains that whole phrase. Compact forms make 4165551234 match (416) 555-1234. */
export function clientMatchesSearch(
  client: ClientRecord,
  query: string,
  reminders: ReminderRecord[] = [],
  appointments: AppointmentRecord[] = [],
): boolean {
  const queryTokens = query.trim().split(/\s+/).flatMap(searchableForms);
  if (queryTokens.length === 0) return true;

  const clientReminders = reminders.filter((item) => item.clientId === client.id);
  const clientAppointments = appointments.filter((item) => item.clientId === client.id);
  const values: unknown[] = [
    client.id,
    client.clientName,
    client.firstName,
    client.lastName,
    client.phone,
    client.email,
    client.address,
    client.companyFilePath,
    linkedCompanyName(client.companyFilePath),
    client.fiscalYearEndMonth,
    client.fiscalYearEndDay,
    client.hstFilingFrequency,
    client.notes,
    client.createdAt,
    client.sin,
    ...dateSearchValues(client.dateOfBirth),
    client.gender,
    client.maritalStatus,
    client.spouseFirstName,
    client.spouseLastName,
    client.spouseSin,
    ...dateSearchValues(client.spouseDateOfBirth),
    client.employmentStatus,
    client.homeOwnership,
    client.returnType,
    client.returnCompleted ? 'return completed' : 'return not completed',
    client.returnFiled ? 'return filed' : 'return not filed',
    ...client.dependents.flatMap((dependent) => [dependent.firstName, dependent.lastName, ...dateSearchValues(dependent.dateOfBirth)]),
    ...client.outstandingDocuments.flatMap((document) => [document.label, document.received ? 'document received' : 'document outstanding missing']),
    ...client.insuranceTypes,
    client.policyExpiryDate,
    ...client.comments.flatMap((comment) => [comment.date, comment.text]),
    ...clientReminders.flatMap((reminder) => [
      reminder.title,
      reminder.dueDate,
      reminder.notes,
      reminder.completed ? 'reminder completed' : 'reminder active overdue pending',
    ]),
    ...clientAppointments.flatMap((appointment) => [
      appointment.title,
      appointment.date,
      appointment.time,
      appointment.durationMinutes,
      appointment.urgency,
      appointment.notes,
      appointment.snoozedUntil,
      appointment.completed ? 'appointment completed' : 'appointment upcoming active',
    ]),
  ];
  const haystack = values.flatMap(searchableForms);
  return queryTokens.every((token) => haystack.some((field) => field.includes(token)));
}
