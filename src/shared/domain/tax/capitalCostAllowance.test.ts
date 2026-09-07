import { describe, expect, it } from 'vitest';
import { CCA_CLASSES, ccaSchedule, computeCcaForClass, firstYearFactor } from './capitalCostAllowance';

describe('firstYearFactor', () => {
  it('grosses the addition up by half again while the incentive was at full strength', () => {
    // Before 2024 the half-year rule was suspended AND the net addition grossed up.
    expect(firstYearFactor(2019)).toBe(1.5);
    expect(firstYearFactor(2023)).toBe(1.5);
  });

  it('drops the gross-up but keeps the half-year rule suspended through the phase-out', () => {
    // 1.0 is still twice the ordinary half-year deduction of 0.5.
    for (const year of [2024, 2025, 2026, 2027]) {
      expect(firstYearFactor(year), `${year}`).toBe(1.0);
    }
  });

  it('puts the half-year rule back once the incentive ends', () => {
    expect(firstYearFactor(2028)).toBe(0.5);
    expect(firstYearFactor(2030)).toBe(0.5);
  });

  it('treats property that never had a half-year rule differently', () => {
    // Nothing to suspend, so it only ever gets the gross-up.
    expect(firstYearFactor(2023, true)).toBe(1.5);
    expect(firstYearFactor(2026, true)).toBe(1.25);
    expect(firstYearFactor(2028, true)).toBe(1.0);
  });
});

describe('computeCcaForClass', () => {
  it('applies the class rate to an opening pool with no activity', () => {
    // Class 8 at 20% on 10,000 with nothing bought or sold.
    const r = computeCcaForClass({
      code: '8',
      openingUccCents: 10_000_00,
      additionsCents: 0,
      dispositionsCents: 0,
      availableForUseYear: 2026,
    });
    expect(r.maximumCcaCents).toBe(2_000_00);
    expect(r.closingUccCents).toBe(8_000_00);
  });

  it('doubles the ordinary first-year claim on a 2026 purchase', () => {
    // 10,000 of class 8 bought in 2026. The half-year rule would give 20% × 5,000 = 1,000; with the
    // rule suspended it is 20% × 10,000 = 2,000.
    const r = computeCcaForClass({
      code: '8',
      openingUccCents: 0,
      additionsCents: 10_000_00,
      dispositionsCents: 0,
      availableForUseYear: 2026,
    });
    expect(r.firstYearAdjustmentCents).toBe(0); // factor is exactly 1.0
    expect(r.maximumCcaCents).toBe(2_000_00);
  });

  it('halves the first-year claim once the incentive has ended', () => {
    const r = computeCcaForClass({
      code: '8',
      openingUccCents: 0,
      additionsCents: 10_000_00,
      dispositionsCents: 0,
      availableForUseYear: 2028,
    });
    // Base becomes 5,000 — the half-year rule is back.
    expect(r.baseForCcaCents).toBe(5_000_00);
    expect(r.maximumCcaCents).toBe(1_000_00);
  });

  it('grosses a pre-2024 addition up by half again', () => {
    const r = computeCcaForClass({
      code: '8',
      openingUccCents: 0,
      additionsCents: 10_000_00,
      dispositionsCents: 0,
      availableForUseYear: 2022,
    });
    expect(r.baseForCcaCents).toBe(15_000_00);
    expect(r.maximumCcaCents).toBe(3_000_00);
  });

  it('restricts only the excess when something was sold in the same year', () => {
    // Bought 10,000, sold 4,000: only the net 6,000 is a first-year addition.
    const r = computeCcaForClass({
      code: '8',
      openingUccCents: 20_000_00,
      additionsCents: 10_000_00,
      dispositionsCents: 4_000_00,
      availableForUseYear: 2028,
    });
    expect(r.netAdditionsCents).toBe(6_000_00);
    expect(r.firstYearAdjustmentCents).toBe(-3_000_00); // half of the net addition held back
    expect(r.baseForCcaCents).toBe(23_000_00);
  });

  it('does not restrict a year that sold more than it bought', () => {
    const r = computeCcaForClass({
      code: '8',
      openingUccCents: 20_000_00,
      additionsCents: 1_000_00,
      dispositionsCents: 5_000_00,
      availableForUseYear: 2028,
    });
    expect(r.firstYearAdjustmentCents).toBe(0);
    expect(r.baseForCcaCents).toBe(16_000_00);
  });

  it('reports recapture when the pool is emptied past zero', () => {
    // Sold for more than was left in the pool: the excess is income, not a negative asset.
    const r = computeCcaForClass({
      code: '10',
      openingUccCents: 3_000_00,
      additionsCents: 0,
      dispositionsCents: 8_000_00,
      availableForUseYear: 2026,
    });
    expect(r.recaptureCents).toBe(5_000_00);
    expect(r.closingUccCents).toBe(0);
    expect(r.claimedCcaCents).toBe(0);
  });

  it('lets a loss year claim less than the maximum and keep the pool', () => {
    const r = computeCcaForClass({
      code: '8',
      openingUccCents: 10_000_00,
      additionsCents: 0,
      dispositionsCents: 0,
      claimCents: 500_00,
      availableForUseYear: 2026,
    });
    expect(r.maximumCcaCents).toBe(2_000_00);
    expect(r.claimedCcaCents).toBe(500_00);
    expect(r.closingUccCents).toBe(9_500_00);
  });

  it('refuses a claim larger than the maximum', () => {
    const r = computeCcaForClass({
      code: '8',
      openingUccCents: 10_000_00,
      additionsCents: 0,
      dispositionsCents: 0,
      claimCents: 9_999_00,
      availableForUseYear: 2026,
    });
    expect(r.claimedCcaCents).toBe(2_000_00);
  });

  it('never lets the claim push the pool below zero', () => {
    // The gross-up can make the computed maximum exceed what is actually in the pool.
    const r = computeCcaForClass({
      code: '12',
      openingUccCents: 0,
      additionsCents: 1_000_00,
      dispositionsCents: 0,
      availableForUseYear: 2022,
    });
    expect(r.closingUccCents).toBeGreaterThanOrEqual(0);
    expect(r.claimedCcaCents).toBeLessThanOrEqual(1_000_00);
  });

  it('uses a supplied rate for a class the table does not carry', () => {
    const r = computeCcaForClass({
      code: '13',
      openingUccCents: 10_000_00,
      additionsCents: 0,
      dispositionsCents: 0,
      rateOverride: 0.10,
      availableForUseYear: 2026,
    });
    expect(r.maximumCcaCents).toBe(1_000_00);
  });
});

describe('ccaSchedule', () => {
  it('totals every class and sorts them by class number', () => {
    const r = ccaSchedule(
      [
        { code: '10', openingUccCents: 20_000_00, additionsCents: 0, dispositionsCents: 0, availableForUseYear: 2026 },
        { code: '8', openingUccCents: 10_000_00, additionsCents: 0, dispositionsCents: 0, availableForUseYear: 2026 },
      ],
      '2026-12-31',
    );

    expect(r.rows.map((x) => x.code)).toEqual(['8', '10']);
    expect(r.totalOpeningUccCents).toBe(30_000_00);
    expect(r.totalClaimedCents).toBe(2_000_00 + 6_000_00);
    expect(r.totalClosingUccCents).toBe(8_000_00 + 14_000_00);
  });

  it('surfaces recapture across the schedule', () => {
    const r = ccaSchedule(
      [{ code: '10', openingUccCents: 1_000_00, additionsCents: 0, dispositionsCents: 4_000_00, availableForUseYear: 2026 }],
      '2026-12-31',
    );
    expect(r.totalRecaptureCents).toBe(3_000_00);
  });
});

describe('the class table', () => {
  it('has no duplicate class codes', () => {
    const codes = CCA_CLASSES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('carries the rates a Canadian small business meets most often', () => {
    const rate = (code: string) => CCA_CLASSES.find((c) => c.code === code)?.rate;
    expect(rate('1')).toBe(0.04); // buildings
    expect(rate('8')).toBe(0.20); // furniture and equipment
    expect(rate('10')).toBe(0.30); // vehicles and computers
    expect(rate('12')).toBe(1.00); // tools and software
    expect(rate('50')).toBe(0.55); // computer hardware
  });
});
