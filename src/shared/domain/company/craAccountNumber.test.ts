import { describe, expect, it } from 'vitest';
import { craHstAccountNumber, isValidHstProgramAccount, normalizeCraProgramAccount } from './craAccountNumber';

describe('CRA GST/HST program account', () => {
  it('normalizes spaces, hyphens, and case', () => {
    expect(normalizeCraProgramAccount('123 456 789-rt-0001')).toBe('123456789RT0001');
  });

  it('requires a complete RT program account', () => {
    expect(isValidHstProgramAccount('123456789RT0001')).toBe(true);
    expect(isValidHstProgramAccount('123456789')).toBe(false);
    expect(isValidHstProgramAccount('123456789RP0001')).toBe(false);
  });

  it('uses a general business number only when it is already a complete RT account', () => {
    expect(craHstAccountNumber(null, '123456789RT0002')).toBe('123456789RT0002');
    expect(craHstAccountNumber(null, '123456789')).toBe('');
  });
});
