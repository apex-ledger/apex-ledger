import { describe, it, expect } from 'vitest';
import { buildClientSheetCsv } from './buildClientSheetCsv';
import type { ClientRecord } from '../types';

function makeClient(overrides: Partial<ClientRecord>): ClientRecord {
  return {
    id: '1',
    clientName: 'Test Client',
    phone: null,
    email: null,
    companyFilePath: null,
    fiscalYearEndMonth: 12,
    fiscalYearEndDay: 31,
    hstFilingFrequency: 'Quarterly',
    notes: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    firstName: null,
    lastName: null,
    address: null,
    sin: null,
    dateOfBirth: null,
    gender: 'Unspecified',
    maritalStatus: null,
    spouseFirstName: null,
    spouseLastName: null,
    spouseSin: null,
    spouseDateOfBirth: null,
    dependents: [],
    employmentStatus: null,
    homeOwnership: null,
    returnType: null,
    returnCompleted: false,
    returnFiled: false,
    outstandingDocuments: [],
    insuranceTypes: [],
    policyExpiryDate: null,
    comments: [],
    ...overrides,
  };
}

describe('buildClientSheetCsv', () => {
  it('writes a header row plus one row per client', () => {
    const csv = buildClientSheetCsv([
      makeClient({ firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-05-01', phone: '416-555-1234', address: '1 Main St', email: 'jane@example.com', returnType: 'T1' }),
      makeClient({ id: '2', clientName: 'Acme Corp', returnType: 'T2', insuranceTypes: ['Life', 'RRSP'] }),
    ]);
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('Name,Date of Birth,Phone,Address,Email,Service (Tax Return Type),Insurance Type');
    expect(lines[1]).toBe('Jane Doe,1990-05-01,416-555-1234,1 Main St,jane@example.com,T1,');
    expect(lines[2]).toBe('Acme Corp,,,,,T2,Life; RRSP');
  });

  it('falls back to clientName when first/last name are unset', () => {
    const csv = buildClientSheetCsv([makeClient({ clientName: 'Bob' })]);
    expect(csv).toContain('Bob,');
  });

  it('quotes fields containing a comma', () => {
    const csv = buildClientSheetCsv([makeClient({ clientName: 'Bob', address: '1 Main St, Suite 2' })]);
    expect(csv).toContain('"1 Main St, Suite 2"');
  });
});
