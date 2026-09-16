import { describe, expect, it } from 'vitest';
import { addMonths, billingTotals, computeOrgBilling, monthlyListCents, referralCredit, type BillingOrg, type Payment } from './billing';

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

describe('referral credit for a CPA firm', () => {
  const firm = org({ id: 10, name: 'Maple CPA', billingStart: '2026-09-01' });
  const lakeshore = org({ id: 20, name: 'Lakeshore Plumbing', billingStart: '2026-10-01' });
  const bakery = org({ id: 21, name: 'Corner Bakery', billingStart: '2026-10-01' });
  const clients = new Map([[20, lakeshore], [21, bakery]]);

  it('takes $15 off the firm bill for each linked client once that client is billed', () => {
    const credit = referralCredit(10, [{ clientOrgId: 20, firmOrgId: 10, startedOn: '2026-10-01', endedOn: null }, { clientOrgId: 21, firmOrgId: 10, startedOn: '2026-10-01', endedOn: null }], clients, 1500);
    // Clients are in their free month in October, so no credit; both are billed from November.
    expect(credit('2026-10-01')).toBe(0);
    expect(credit('2026-11-01')).toBe(3000);
    const r = computeOrgBilling(firm, [{ seatType: 'full', isActive: true }], RATES, [], '2026-11-15', credit);
    expect(r.charges.map((c) => [c.periodFrom, c.creditCents, c.amountCents])).toEqual([['2026-10-01', 0, 7900], ['2026-11-01', 3000, 4900]]);
    expect(r.creditNowCents).toBe(3000);
    expect(r.monthlyNowCents).toBe(4900);
  });

  it('stops the credit when the client leaves the firm, and when the client stops paying', () => {
    const left = referralCredit(10, [{ clientOrgId: 20, firmOrgId: 10, startedOn: '2026-10-01', endedOn: '2027-01-15' }], clients, 1500);
    expect(left('2026-12-01')).toBe(1500);
    expect(left('2027-02-01')).toBe(0);
    const cancelled = new Map([[20, org({ id: 20, billingStart: '2026-10-01', billingStatus: 'cancelled', billingEnd: '2027-01-01' })]]);
    const stopped = referralCredit(10, [{ clientOrgId: 20, firmOrgId: 10, startedOn: '2026-10-01', endedOn: null }], cancelled, 1500);
    expect(stopped('2026-12-01')).toBe(1500);
    expect(stopped('2027-01-01')).toBe(0);
  });

  it('never credits another firm for a client it did not refer', () => {
    const credit = referralCredit(99, [{ clientOrgId: 20, firmOrgId: 10, startedOn: '2026-10-01', endedOn: null }], clients, 1500);
    expect(credit('2026-12-01')).toBe(0);
  });

  it('leaves a credit balance when the credits are more than the firm bill', () => {
    const many = [20, 21].map((id) => ({ clientOrgId: id, firmOrgId: 10, startedOn: '2026-10-01', endedOn: null }));
    const r = computeOrgBilling(firm, [], RATES, [], '2026-11-15', referralCredit(10, many, clients, 1500));
    expect(r.owingCents).toBe(-3000);
  });
});
