/**
 * What each subscriber owes and when: worked out from the seats in use and the seat rates, not
 * from a payment processor, so the administrator can see the position today with e-transfers and
 * cheques recorded by hand. Rules, as published on apexledger.ca:
 *
 *   - A seat is one active person; the rate follows the seat type.
 *   - The first month is free: billing starts one month after the billing start date.
 *   - Monthly billing charges each month in advance; yearly billing charges twelve months at 20% off.
 *   - A founding firm pays `discountPct` less for the months up to `discountUntil`.
 *   - A paused or cancelled subscription stops charging from its end date.
 */
export type BillingCycle = 'monthly' | 'yearly';
export type BillingStatus = 'trial' | 'active' | 'paused' | 'cancelled';
export const YEARLY_DISCOUNT_PCT = 20;

export interface BillingOrg {
  id: number;
  name: string;
  createdAt: string;
  discountPct: number;
  discountUntil: string | null;
  billingStart: string | null;
  billingCycle: BillingCycle;
  billingStatus: 'active' | 'paused' | 'cancelled';
  billingEnd: string | null;
}
export interface BillingSeat { seatType: string; isActive: boolean }
export interface Payment { id: number; orgId: number; paidOn: string; amountCents: number; method: string; reference: string; periodFrom: string | null; periodTo: string | null; note: string; createdAt: string }

export interface Charge { periodFrom: string; periodTo: string; listCents: number; discountCents: number; amountCents: number; discountPct: number }
export interface OrgBilling {
  orgId: number;
  status: BillingStatus;
  billingStart: string;
  firstChargeDate: string;
  monthlyListCents: number;
  monthlyNowCents: number;
  seatCounts: Record<string, number>;
  charges: Charge[];
  billedCents: number;
  paidCents: number;
  owingCents: number;
  nextCharge: { date: string; amountCents: number } | null;
  discountEndsOn: string | null;
}

export const isoDay = (d: Date): string => d.toISOString().slice(0, 10);
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return isoDay(target);
}
const dayBefore = (iso: string): string => { const t = new Date(`${iso}T00:00:00Z`); t.setUTCDate(t.getUTCDate() - 1); return isoDay(t); };

/** The monthly list price for the seats in use: one rate per active person. */
export function monthlyListCents(seats: BillingSeat[], rates: Record<string, number>): number {
  return seats.filter((s) => s.isActive).reduce((sum, s) => sum + (rates[s.seatType] ?? 0), 0);
}

function pctFor(org: BillingOrg, monthStart: string): number {
  return org.discountPct > 0 && org.discountUntil && monthStart <= org.discountUntil ? org.discountPct : 0;
}

/** One charge per period from the first charge date through `today`, plus the next one coming. */
export function computeOrgBilling(org: BillingOrg, seats: BillingSeat[], rates: Record<string, number>, payments: Payment[], today: string): OrgBilling {
  const billingStart = (org.billingStart ?? org.createdAt).slice(0, 10);
  const firstChargeDate = addMonths(billingStart, 1);
  const list = monthlyListCents(seats, rates);
  const stop = org.billingStatus === 'active' ? null : (org.billingEnd ?? today);
  const seatCounts: Record<string, number> = {};
  for (const s of seats) if (s.isActive) seatCounts[s.seatType] = (seatCounts[s.seatType] ?? 0) + 1;

  const charges: Charge[] = [];
  let nextCharge: OrgBilling['nextCharge'] = null;
  const step = org.billingCycle === 'yearly' ? 12 : 1;
  for (let k = 0; k < 600; k++) {
    const from = addMonths(firstChargeDate, k * step);
    const to = dayBefore(addMonths(from, step));
    if (stop && from >= stop) break;
    // Month by month inside the period, so a founding discount that ends mid-year is exact.
    let listCents = 0;
    let discountCents = 0;
    for (let m = 0; m < step; m++) {
      const monthStart = addMonths(from, m);
      const pct = pctFor(org, monthStart);
      listCents += list;
      discountCents += Math.round((list * pct) / 100);
    }
    let amountCents = listCents - discountCents;
    if (org.billingCycle === 'yearly') amountCents = Math.round((amountCents * (100 - YEARLY_DISCOUNT_PCT)) / 100);
    const pct = listCents > 0 ? Math.round((discountCents / listCents) * 100) : 0;
    if (from <= today) charges.push({ periodFrom: from, periodTo: to, listCents, discountCents, amountCents, discountPct: pct });
    else { nextCharge = { date: from, amountCents }; break; }
  }

  const billedCents = charges.reduce((s, c) => s + c.amountCents, 0);
  const paidCents = payments.reduce((s, p) => s + p.amountCents, 0);
  const status: BillingStatus = org.billingStatus !== 'active' ? org.billingStatus : today < firstChargeDate ? 'trial' : 'active';
  const nowPct = pctFor(org, today);
  return {
    orgId: org.id,
    status,
    billingStart,
    firstChargeDate,
    monthlyListCents: list,
    monthlyNowCents: list - Math.round((list * nowPct) / 100),
    seatCounts,
    charges,
    billedCents,
    paidCents,
    owingCents: billedCents - paidCents,
    nextCharge: status === 'paused' || status === 'cancelled' ? null : nextCharge,
    discountEndsOn: org.discountPct > 0 ? org.discountUntil : null,
  };
}

export interface BillingTotals { firms: number; trial: number; active: number; paused: number; cancelled: number; monthlyRecurringCents: number; owingCents: number; paidCents: number; billedCents: number }
export function billingTotals(rows: OrgBilling[]): BillingTotals {
  const t: BillingTotals = { firms: rows.length, trial: 0, active: 0, paused: 0, cancelled: 0, monthlyRecurringCents: 0, owingCents: 0, paidCents: 0, billedCents: 0 };
  for (const r of rows) {
    t[r.status] += 1;
    if (r.status === 'active' || r.status === 'trial') t.monthlyRecurringCents += r.monthlyNowCents;
    t.owingCents += r.owingCents;
    t.paidCents += r.paidCents;
    t.billedCents += r.billedCents;
  }
  return t;
}
