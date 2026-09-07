import { describe, it, expect } from 'vitest';
import { parseClientImportCsv } from './parseClientImportCsv';

describe('parseClientImportCsv', () => {
  it('parses a CSV matching this app\'s own export format', () => {
    const csv = [
      'Name,Date of Birth,Phone,Address,Email,Service (Tax Return Type),Insurance Type',
      'Jane Doe,1990-05-01,416-555-1234,1 Main St,jane@example.com,T1,',
      'Acme Corp,,,,,T2,Life; RRSP',
    ].join('\r\n');
    const result = parseClientImportCsv(csv);
    expect(result.skippedRowNumbers).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({
      clientName: 'Jane Doe',
      dateOfBirth: '1990-05-01',
      phone: '416-555-1234',
      address: '1 Main St',
      email: 'jane@example.com',
      returnType: 'T1',
      insuranceTypes: [],
      homeOwnership: null,
    });
    expect(result.rows[1].insuranceTypes).toEqual(['Life', 'RRSP']);
    expect(result.rows[1].returnType).toBe('T2');
  });

  it('matches alternate header spellings case-insensitively', () => {
    const csv = ['Client Name,DOB,Phone Number,Email ID', 'Bob Smith,1985-01-01,555-1111,bob@x.com'].join('\n');
    const result = parseClientImportCsv(csv);
    expect(result.rows).toEqual([
      {
        clientName: 'Bob Smith',
        dateOfBirth: '1985-01-01',
        phone: '555-1111',
        address: null,
        email: 'bob@x.com',
        returnType: null,
        insuranceTypes: [],
        homeOwnership: null,
      },
    ]);
  });

  it('skips rows with no usable name and reports the row number', () => {
    const csv = ['Name,Phone', 'Jane,555-1111', ',555-2222', 'Bob,555-3333'].join('\n');
    const result = parseClientImportCsv(csv);
    expect(result.rows.map((r) => r.clientName)).toEqual(['Jane', 'Bob']);
    expect(result.skippedRowNumbers).toEqual([2]);
  });

  it('ignores unrecognized columns instead of erroring', () => {
    const csv = ['Name,Some Random Column', 'Jane,whatever'].join('\n');
    const result = parseClientImportCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].clientName).toBe('Jane');
  });

  it('returns empty on an empty file', () => {
    expect(parseClientImportCsv('')).toEqual({ rows: [], skippedRowNumbers: [] });
  });
});
