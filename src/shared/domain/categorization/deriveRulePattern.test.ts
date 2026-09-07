import { describe, expect, it } from 'vitest';
import { deriveRulePattern } from './deriveRulePattern';

describe('deriveRulePattern', () => {
  it('strips reference numbers and POS/PURCHASE noise, keeping just the vendor', () => {
    expect(deriveRulePattern('SHELL #4471 POS PURCHASE 8842')).toBe('SHELL');
  });

  it('keeps a distinctive two-word vendor name', () => {
    expect(deriveRulePattern('BELL CANADA PAYMENT 00123456')).toBe('BELL CANADA');
  });

  it('strips punctuation but keeps the words', () => {
    expect(deriveRulePattern('TIM HORTONS #331 TORONTO ON')).toBe('TIM HORTONS');
  });

  it('returns null when nothing distinctive remains', () => {
    expect(deriveRulePattern('POS PURCHASE 12345')).toBeNull();
    expect(deriveRulePattern('')).toBeNull();
    expect(deriveRulePattern('   ')).toBeNull();
  });

  it('is case-insensitive on input, always returns uppercase', () => {
    expect(deriveRulePattern('shell gas station')).toBe('SHELL GAS');
  });

  it('filters generic banking-channel words so they never eat the pattern budget', () => {
    expect(deriveRulePattern('Online Transfer to Savings Account')).toBe('SAVINGS ACCOUNT');
    expect(deriveRulePattern('Online Banking Payment - Bell Canada')).toBe('BELL CANADA');
  });
});
