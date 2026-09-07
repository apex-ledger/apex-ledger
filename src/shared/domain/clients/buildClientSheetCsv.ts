import type { ClientRecord } from '../types';

function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** A basic, spreadsheet-openable client roster — Name/DOB/Phone/Address/Email plus what the
 * client is a client *for* (a T1/T2 tax-return type and/or an insurance product list), separate
 * from the full per-client record which has far more fields than a quick roster needs. */
export function buildClientSheetCsv(clients: ClientRecord[]): string {
  const header = ['Name', 'Date of Birth', 'Phone', 'Address', 'Email', 'Service (Tax Return Type)', 'Insurance Type'];
  const rows = clients.map((client) => {
    const name = [client.firstName, client.lastName].filter(Boolean).join(' ') || client.clientName;
    return [name, client.dateOfBirth ?? '', client.phone ?? '', client.address ?? '', client.email ?? '', client.returnType ?? '', client.insuranceTypes.join('; ')]
      .map(csvField)
      .join(',');
  });
  return [header.join(','), ...rows].join('\r\n') + '\r\n';
}
