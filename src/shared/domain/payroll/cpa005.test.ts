import { describe, expect, it } from 'vitest';
import { CPA005_RECORD_LENGTH, buildCpa005File, cpaJulianDate, validateCpa005 } from './cpa005';

const originator = { originatorId: 'NWBK000123', originatorShortName: 'NORTHWIND BK', originatorLongName: 'Northwind Bookkeeping Test Co.', dataCentre: '00400', fileCreationNumber: 7, settlementInstitution: '004', settlementTransit: '12345', settlementAccount: '1234567' };
const credits = [
  { payeeName: 'Sam Patel', institution: '004', transit: '00012', account: '5555555', amountCents: 173_244, dueDate: '2026-09-11', crossReference: 'PAY 2026-09-11' },
  { payeeName: 'Kim Nguyen', institution: '010', transit: '00022', account: '6666666', amountCents: 406_695, dueDate: '2026-09-11', crossReference: 'PAY 2026-09-11' },
];

describe('CPA-005 direct deposit file', () => {
  it('writes Julian dates the CPA way', () => {
    expect(cpaJulianDate('2026-01-01')).toBe('026001');
    expect(cpaJulianDate('2026-09-11')).toBe('026254');
    expect(cpaJulianDate('2024-12-31')).toBe('024366');
  });

  it('produces fixed-width A, C and Z records with the right counts and totals', () => {
    const file = buildCpa005File(originator, credits, '2026-09-10');
    const lines = file.content.split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(3);
    for (const line of lines) expect(line).toHaveLength(CPA005_RECORD_LENGTH);
    expect(lines[0].slice(0, 1)).toBe('A');
    expect(lines[0].slice(1, 10)).toBe('000000001');
    expect(lines[0].slice(10, 24)).toBe('NWBK0001230007');
    expect(lines[0].slice(24, 30)).toBe('026253');
    expect(lines[0].slice(30, 35)).toBe('00400');
    expect(lines[1].slice(0, 1)).toBe('C');
    expect(lines[1].slice(24, 27)).toBe('200');
    expect(lines[1].slice(27, 37)).toBe('0000173244');
    expect(lines[1].slice(37, 43)).toBe('026254');
    expect(lines[1].slice(43, 52)).toBe('000400012');
    expect(lines[1].slice(52, 64)).toBe('5555555     ');
    expect(lines[1].slice(24 + 240, 24 + 240 + 3)).toBe('200');
    expect(lines[2].slice(0, 1)).toBe('Z');
    expect(lines[2].slice(46, 60)).toBe('00000000579939');
    expect(lines[2].slice(60, 68)).toBe('00000002');
    expect(file.totalCents).toBe(579_939);
    expect(file.recordCount).toBe(3);
  });

  it('lists what the bank would reject before writing anything', () => {
    const problems = validateCpa005({ ...originator, originatorId: 'SHORT' }, [{ ...credits[0], transit: '12' }, { ...credits[1], amountCents: 0 }]);
    expect(problems.map((p) => p.payee)).toEqual(['Company', 'Sam Patel', 'Kim Nguyen']);
    expect(() => buildCpa005File({ ...originator, originatorId: 'SHORT' }, credits, '2026-09-10')).toThrow(/Originator ID/);
  });
});
