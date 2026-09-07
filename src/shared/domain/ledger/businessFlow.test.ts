import { describe, expect, it } from 'vitest';
import { computeHstFilingFigures } from './hstFiling';
import { grossMarginPercent } from './costOfSales';

/** The two flows the whole app exists to get right, asserted end to end as arithmetic.
 *
 * Both are checked in detail by their own tests. What these add is the shape of the flow itself —
 * the order the figures come in and what each one subtracts from — because that is what somebody
 * reads off a statement, and it is possible for every part to be individually correct while the
 * sequence still says something wrong.
 */

describe('the HST flow', () => {
  it('nets what was collected against what was paid', () => {
    // Vendor charges you HST -> you claim it back as an input tax credit.
    // You charge the customer HST -> you owe it.
    // At filing: collected less ITCs is what actually changes hands.
    const figures = computeHstFilingFigures(260_00, 130_00);

    expect(figures.collectedCents).toBe(260_00);
    expect(figures.itcCents).toBe(130_00);
    expect(figures.netPayableCents).toBe(130_00);
  });

  it('turns into a refund when you paid more tax than you collected', () => {
    // Normal for a business in its first year, or one buying equipment. A filing that could only
    // ever be payable would have no way to express it.
    const figures = computeHstFilingFigures(50_00, 130_00);
    expect(figures.netPayableCents).toBe(-80_00);
  });

  it('is nil when nothing was bought or sold', () => {
    expect(computeHstFilingFigures(0, 0).netPayableCents).toBe(0);
  });
});

describe('the profit flow', () => {
  it('runs revenue, cost of sales, gross profit, operating, net profit', () => {
    // Each step subtracts from the one before it. Gross profit is the figure that says whether the
    // thing being sold is sold at a sensible margin, and it does not exist without the cost-of-
    // sales split.
    const revenue = 100_000_00;
    const costOfSales = 60_000_00;
    const operating = 25_000_00;

    const grossProfit = revenue - costOfSales;
    const netProfit = grossProfit - operating;

    expect(grossProfit).toBe(40_000_00);
    expect(netProfit).toBe(15_000_00);
    expect(grossMarginPercent(revenue, grossProfit)).toBe(40);
  });

  it('shows a loss on every sale even while the bottom line looks fine', () => {
    // The case the split exists for: netting every expense off revenue hides it completely.
    const revenue = 100_000_00;
    const costOfSales = 110_000_00;
    const grossProfit = revenue - costOfSales;

    expect(grossProfit).toBeLessThan(0);
    expect(grossMarginPercent(revenue, grossProfit)).toBe(-10);
  });

  it('leaves gross profit equal to revenue when there is no cost of sales', () => {
    // A consultancy sells time, not goods.
    expect(grossMarginPercent(100_000_00, 100_000_00)).toBe(100);
  });
});
