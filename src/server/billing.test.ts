import { describe, expect, it } from 'vitest';
import { addMonths, billingTotals, computeOrgBilling, monthlyListCents, type BillingOrg, type Payment } from './billing';

const RATES = { business: 3900, payroll: 4500, bookkeeper: 5900, full: 7900 };
const org = (over: Partial<BillingOrg> = {}): BillingOrg => ({ id: 1, name: 'Maple CPA', createdAt: '2026-09-01 10:00:00', discountPct: 0, discountUntil: null, billingStart: null, billingCycle: 'monthly', billingStatus: 'active', billingEnd: null, ...over });
const SEATS = [{ seatType: 'full', isActive: true }, { seatType: 'bookkeeper', isActive: true }, { seatType: 'bookkeeper', isActive: true }, { seatType: 'business', isActive: false }];
const pay = (amountCents: number, paidOn: string): Payment => ({ id: 1, orgId: 1, paidOn, amountCents, method: 'etransfer', reference: '', periodFrom: null, periodTo: null, note: '', createdAt: paidOn });

describe('addMonths', () => {
  it('keeps the day and clamps to the month end', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-09-12', 1)).toBe('2026-10-12');
    expect(addMonths('2026-12-15', 2)).toBe('2027-02-15');
  });
});

describe('computeOrgBilling', () => {
  it('bills one rate per active person and nothing for empty or inactive seats', () => {
    expect(monthlyListCents(SEATS, RATES)).toBe(7900 + 5900 + 5900);
  });

  it('is on trial for the first month, then charges monthly in advance', () => {
    const inTrial = computeOrgBilling(org(), SEATS, RATES, [], '2026-09-20');
    expect(inTrial.status).toBe('trial');
    expect(inTrial.charges).toEqual([]);
    expect(inTrial.nextCharge).toEqual({ date: '2026-10-01', amountCents: 19700 });

    const later = computeOrgBilling(org(), SEATS, RATES, [pay(19700, '2026-10-03')], '2026-11-15');
    expect(later.status).toBe('active');
    expect(later.charges.map((c) => [c.periodFrom, c.periodTo, c.amountCents])).toEqual([['2026-10-01', '2026-10-31', 19700], ['2026-11-01', '2026-11-30', 19700]]);
    expect(later.billedCents).toBe(39400);
    expect(later.paidCents).toBe(19700);
    expect(later.owingCents).toBe(19700);
    expect(later.nextCharge).toEqual({ date: '2026-12-01', amountCents: 19700 });
  });

  it('applies the founding discount to the months it covers and not after', () => {
    const founding = org({ discountPct: 50, discountUntil: '2027-03-01' });
    const r = computeOrgBilling(founding, SEATS, RATES, [], '2027-04-10');
    const amounts = r.charges.map((c) => c.amountCents);
    expect(amounts.slice(0, 6)).toEqual([9850, 9850, 9850, 9850, 9850, 9850]); // Oct to Mar at half price
    expect(amounts[6]).toBe(19700); // April full price
    expect(r.monthlyNowCents).toBe(19700);
    expect(r.discountEndsOn).toBe('2027-03-01');
  });

  it('bills a year at once at 20% off, with the founding months inside it discounted', () => {
    const yearly = org({ billingCycle: 'yearly', discountPct: 50, discountUntil: '2027-03-01' });
    const r = computeOrgBilling(yearly, SEATS, RATES, [], '2026-10-02');
    expect(r.charges).toHaveLength(1);
    // 6 months at 9850 + 6 months at 19700 = 177300, less 20% = 141840
    expect(r.charges[0].amountCents).toBe(141840);
    expect(r.charges[0].periodTo).toBe('2027-09-30');
    expect(r.nextCharge).toEqual({ date: '2027-10-01', amountCents: Math.round(19700 * 12 * 0.8) });
  });

  it('stops charging when cancelled or paused, from the end date', () => {
    const gone = org({ billingStatus: 'cancelled', billingEnd: '2026-12-01' });
    const r = computeOrgBilling(gone, SEATS, RATES, [], '2027-03-01');
    expect(r.status).toBe('cancelled');
    expect(r.charges.map((c) => c.periodFrom)).toEqual(['2026-10-01', '2026-11-01']);
    expect(r.nextCharge).toBeNull();
  });

  it('honours an explicit billing start date over the creation date', () => {
    const r = computeOrgBilling(org({ billingStart: '2026-11-15' }), SEATS, RATES, [], '2026-12-20');
    expect(r.firstChargeDate).toBe('2026-12-15');
    expect(r.charges).toHaveLength(1);
  });
});

describe('billingTotals', () => {
  it('adds up the firms by status and the money', () => {
    const a = computeOrgBilling(org(), SEATS, RATES, [pay(19700, '2026-10-01')], '2026-11-15');
    const b = computeOrgBilling(org({ id: 2 }), SEATS, RATES, [], '2026-09-20');
    const t = billingTotals([a, b]);
    expect(t).toMatchObject({ firms: 2, active: 1, trial: 1, monthlyRecurringCents: 39400, billedCents: 39400, paidCents: 19700, owingCents: 19700 });
  });
});
