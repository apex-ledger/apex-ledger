import { describe, expect, it } from 'vitest';
import { billHeaderFigures, billLinesFromPayload, billLinesRefusalReason, lineFromEnteredAmount, type BillLineInput } from './billLines';

const line = (over: Partial<BillLineInput> = {}): BillLineInput => ({ categoryAccountId: 10, description: null, baseCents: 10000, taxCode: 'HST', taxCents: 1300, productId: null, quantity: null, ...over });

describe('billLinesFromPayload', () => {
  it('uses the lines when given', () => {
    expect(billLinesFromPayload({ lines: [line()], categoryAccountId: 99, baseCents: 1 })).toEqual([line()]);
  });
  it('builds one line from the single-line fields older callers send', () => {
    expect(billLinesFromPayload({ categoryAccountId: 7, baseCents: 5000, taxCode: 'HST', taxCents: 650, memo: 'Paper', productId: 3, quantity: 2 })).toEqual([
      { categoryAccountId: 7, description: 'Paper', baseCents: 5000, taxCode: 'HST', taxCents: 650, productId: 3, quantity: 2 },
    ]);
  });
  it('drops the tax when there is no tax code', () => {
    expect(billLinesFromPayload({ categoryAccountId: 7, baseCents: 5000, taxCode: null, taxCents: 650 })[0].taxCents).toBe(0);
  });
});

describe('billLinesRefusalReason', () => {
  it('refuses an empty bill, a blank line and an uncategorised line, by line number', () => {
    expect(billLinesRefusalReason([])).toMatch(/at least one line/);
    expect(billLinesRefusalReason([line(), line({ baseCents: 0, taxCents: 0 })])).toMatch(/Line 2 has no amount/);
    expect(billLinesRefusalReason([line({ categoryAccountId: 0 })])).toMatch(/Line 1 needs a category/);
    expect(billLinesRefusalReason([line()])).toBeNull();
  });
});

describe('billHeaderFigures', () => {
  it('sums the lines and keeps one shared tax code', () => {
    expect(billHeaderFigures([line(), line({ baseCents: 2000, taxCents: 260 })])).toEqual({ categoryAccountId: 10, baseCents: 12000, taxCents: 1560, taxCode: 'HST', totalCents: 13560 });
  });
  it('reports Manual when the lines carry different tax treatments', () => {
    const figures = billHeaderFigures([line(), line({ taxCode: 'NonHST', taxCents: 0 })]);
    expect(figures.taxCode).toBe('Manual');
    expect(figures.totalCents).toBe(11300 + 10000);
  });
  it('ignores a tax figure on a line with no tax code', () => {
    expect(billHeaderFigures([line({ taxCode: null, taxCents: 999 })]).taxCents).toBe(0);
  });
});

describe('lineFromEnteredAmount', () => {
  it('exclusive: the figure is the base, tax suggested on top unless typed', () => {
    expect(lineFromEnteredAmount(10000, 'HST', 'exclusive', null)).toEqual({ baseCents: 10000, taxCents: 1300 });
    expect(lineFromEnteredAmount(10000, 'HST', 'exclusive', 1200)).toEqual({ baseCents: 10000, taxCents: 1200 });
  });
  it('inclusive: the figure is what was paid; the tax comes out of it', () => {
    expect(lineFromEnteredAmount(11300, 'HST', 'inclusive', null)).toEqual({ baseCents: 10000, taxCents: 1300 });
    // A mixed basket: the receipt's own tax figure wins over the rate.
    expect(lineFromEnteredAmount(13750, 'HST', 'inclusive', 572)).toEqual({ baseCents: 13178, taxCents: 572 });
  });
  it('no tax code: the figure is the base either way', () => {
    expect(lineFromEnteredAmount(5000, null, 'inclusive', 400)).toEqual({ baseCents: 5000, taxCents: 0 });
  });
});
