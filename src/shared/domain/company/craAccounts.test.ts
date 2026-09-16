import { describe, expect, it } from 'vitest';
import { businessNumberProblem, compactCraNumber, mismatchedBusinessNumber, parseProgramAccount, programAccountProblem } from './craAccounts';

describe("the CRA's numbers for a business", () => {
  it('accepts a nine-digit Business Number, however it was spaced', () => {
    expect(businessNumberProblem('123 456 789')).toBeNull();
    expect(businessNumberProblem('')).toBeNull();
    expect(businessNumberProblem('12345678')).toMatch(/9 digits/);
    expect(businessNumberProblem('123456789RT0001')).toMatch(/9 digits/);
  });

  it('holds each program account to its own letters', () => {
    expect(programAccountProblem('123456789 RT 0001', 'RT')).toBeNull();
    expect(programAccountProblem('123456789RP0001', 'RT')).toMatch(/Business Number, RT, then 4 digits/);
    expect(programAccountProblem('123456789RP0001', 'RP')).toBeNull();
    expect(programAccountProblem('123456789RT0001', 'RP')).toMatch(/RP/);
    expect(programAccountProblem('123456789RC0001', 'RC')).toBeNull();
    expect(programAccountProblem('123456789RC001', 'RC')).toMatch(/RC/);
    expect(programAccountProblem(null, 'RC')).toBeNull();
  });

  it('insists every program account is under the company Business Number', () => {
    expect(mismatchedBusinessNumber('123456789', '123456789RT0001', 'RT')).toBeNull();
    expect(mismatchedBusinessNumber('123456789', '987654321RT0001', 'RT')).toMatch(/must be the same nine digits/);
    expect(mismatchedBusinessNumber('', '987654321RT0001', 'RT')).toBeNull();
  });

  it('reads an account into its parts', () => {
    expect(compactCraNumber(' 123-456-789 rp 0002 ')).toBe('123456789RP0002');
    expect(parseProgramAccount('123456789 RP 0002')).toEqual({ businessNumber: '123456789', program: 'RP', reference: '0002' });
    expect(parseProgramAccount('RP0002')).toBeNull();
  });
});
