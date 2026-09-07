import { describe, expect, it } from 'vitest';
import { chequeAmountWords } from './chequeAmountWords';

describe('chequeAmountWords', () => {
  it('writes dollars and cents in cheque form', () => {
    expect(chequeAmountWords(123_45)).toBe('One Hundred Twenty-Three and 45/100 Dollars');
  });

  it('supports thousands and zero cents', () => {
    expect(chequeAmountWords(12_000_00)).toBe('Twelve Thousand and 00/100 Dollars');
  });

  it('handles a zero cheque safely', () => {
    expect(chequeAmountWords(0)).toBe('Zero and 00/100 Dollars');
  });
});
