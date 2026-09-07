import { describe, expect, it } from 'vitest';
import { computeQuickMethodRemittance } from './hstQuickMethod';

describe('computeQuickMethodRemittance', () => {
  it('adds HST collected on top of base sales for the tax-included figure', () => {
    const result = computeQuickMethodRemittance(10_000_00, 1_300_00, 8.5);
    expect(result.taxIncludedSalesCents).toBe(11_300_00);
  });

  it('computes remittance as tax-included sales times the rate', () => {
    const result = computeQuickMethodRemittance(10_000_00, 1_300_00, 8.5);
    // 11,300.00 * 8.5% = 960.50
    expect(result.remittanceCents).toBe(96_050);
  });

  it('kept amount is HST collected minus the remittance', () => {
    const result = computeQuickMethodRemittance(10_000_00, 1_300_00, 8.5);
    expect(result.keptCents).toBe(result.hstCollectedCents - result.remittanceCents);
    expect(result.keptCents).toBe(130_000 - 96_050);
  });

  it('handles zero sales without error', () => {
    const result = computeQuickMethodRemittance(0, 0, 8.5);
    expect(result.taxIncludedSalesCents).toBe(0);
    expect(result.remittanceCents).toBe(0);
    expect(result.keptCents).toBe(0);
  });

  it('rounds the remittance to the nearest cent', () => {
    const result = computeQuickMethodRemittance(333_33, 43_33, 8.8);
    const expected = Math.round((333_33 + 43_33) * 0.088);
    expect(result.remittanceCents).toBe(expected);
  });
});
