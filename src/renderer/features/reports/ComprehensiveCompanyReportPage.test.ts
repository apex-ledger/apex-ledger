import { describe, expect, it } from 'vitest';
import { CUSTOM_REPORT_COLUMNS } from './ComprehensiveCompanyReportPage';

describe('comprehensive report column catalogue', () => {
  it('offers unique columns from every connected source report area', () => {
    const keys = CUSTOM_REPORT_COLUMNS.map((column) => column.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(CUSTOM_REPORT_COLUMNS.map((column) => column.group))).toEqual(new Set([
      'Journal', 'Audit', 'General Ledger', 'Contacts', 'Sales Tax', 'Foreign Currency',
    ]));
  });
});
