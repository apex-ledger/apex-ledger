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
 *   - A CPA firm earns a referral credit for each client that pays for its own subscription: a flat
 *     amount off the firm's bill for every month that client is billed while linked to the firm.
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

export interface Charge { periodFrom: string; periodTo: string; listCents: number; discountCents: number; amountCents: number; discountPct: number; creditCents: number }
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
  /** Referral credit for the current month, already taken off monthlyNowCents. */
  creditNowCents: number;
}

/** Credit in cents for the month starting on a given day. */
export type MonthlyCredit = (monthStart: string) => number;

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
export function computeOrgBilling(org: BillingOrg, seats: BillingSeat[], rates: Record<string, number>, payments: Payment[], today: string, credit: MonthlyCredit = () => 0): OrgBilling {
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
    let creditCents = 0;
    for (let m = 0; m < step; m++) {
      const monthStart = addMonths(from, m);
      const pct = pctFor(org, monthStart);
      listCents += list;
      discountCents += Math.round((list * pct) / 100);
      creditCents += credit(monthStart);
    }
    let amountCents = listCents - discountCents;
    if (org.billingCycle === 'yearly') amountCents = Math.round((amountCents * (100 - YEARLY_DISCOUNT_PCT)) / 100);
    // The referral credit is a flat amount, taken off after the yearly discount. A firm whose
    // credits exceed its bill carries the difference as a credit balance (a negative amount owing).
    amountCents -= creditCents;
    const pct = listCents > 0 ? Math.round((discountCents / listCents) * 100) : 0;
    if (from <= today) charges.push({ periodFrom: from, periodTo: to, listCents, discountCents, amountCents, discountPct: pct, creditCents });
    else { nextCharge = { date: from, amountCents }; break; }
  }

  const billedCents = charges.reduce((s, c) => s + c.amountCents, 0);
  const paidCents = payments.reduce((s, p) => s + p.amountCents, 0);
  const status: BillingStatus = org.billingStatus !== 'active' ? org.billingStatus : today < firstChargeDate ? 'trial' : 'active';
  const creditNowCents = status === 'paused' || status === 'cancelled' ? 0 : credit(today);
  const nowPct = pctFor(org, today);
  return {
    orgId: org.id,
    status,
    billingStart,
    firstChargeDate,
    monthlyListCents: list,
    monthlyNowCents: list - Math.round((list * nowPct) / 100) - creditNowCents,
    seatCounts,
    charges,
    billedCents,
    paidCents,
    owingCents: billedCents - paidCents,
    nextCharge: status === 'paused' || status === 'cancelled' ? null : nextCharge,
    discountEndsOn: org.discountPct > 0 ? org.discountUntil : null,
    creditNowCents,
  };
}

/** A client paying for its own subscription, linked to the CPA firm that referred it. */
export interface Referral { clientOrgId: number; firmOrgId: number; startedOn: string; endedOn: string | null }

/** True when a subscription is billed for the month starting `monthStart`: past its free first
 * month, and not stopped by a pause or cancellation before that month. */
export function isBilledMonth(org: BillingOrg, monthStart: string): boolean {
  const firstChargeDate = addMonths((org.billingStart ?? org.createdAt).slice(0, 10), 1);
  if (monthStart < firstChargeDate) return false;
  if (org.billingStatus !== 'active' && org.billingEnd && monthStart >= org.billingEnd) return false;
  if (org.billingStatus !== 'active' && !org.billingEnd) return false;
  return true;
}

/**
 * The firm's referral credit for a month: `creditCents` for each linked client that is billed that
 * month and was linked to this firm on that day. A link that ended before the month earns nothing;
 * a client still in its free month earns nothing, because it has not paid yet.
 */
export function referralCredit(firmOrgId: number, referrals: Referral[], clientOrgs: Map<number, BillingOrg>, creditCents: number): MonthlyCredit {
  const mine = referrals.filter((r) => r.firmOrgId === firmOrgId);
  return (monthStart) => {
    let total = 0;
    for (const r of mine) {
      if (r.startedOn > monthStart) continue;
      if (r.endedOn && monthStart >= r.endedOn) continue;
      const client = clientOrgs.get(r.clientOrgId);
      if (client && isBilledMonth(client, monthStart)) total += creditCents;
    }
    return total;
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
