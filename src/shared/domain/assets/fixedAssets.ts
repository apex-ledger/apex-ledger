/**
 * Fixed asset register — each capital asset on its own record with book depreciation posted month
 * by month, and a disposal that clears the asset and its accumulated depreciation and books the
 * gain or loss. Book depreciation (this file) and tax CCA (the pool schedule) are different
 * numbers by design: the register carries the CCA class so the year's additions can be read off,
 * but the CCA pool is where the tax deduction lives.
 */
export type DepreciationMethod = 'straightLine' | 'decliningBalance';

export const DEPRECIATION_METHOD_LABELS: Record<DepreciationMethod, string> = {
  straightLine: 'Straight-line',
  decliningBalance: 'Declining balance',
};

/** The common CCA classes a small business meets, for the register's reference column. */
export const CCA_CLASS_OPTIONS: Array<{ code: string; label: string; rate: number }> = [
  { code: '1', label: 'Class 1 — Buildings (4%)', rate: 0.04 },
  { code: '8', label: 'Class 8 — Furniture, equipment (20%)', rate: 0.2 },
  { code: '10', label: 'Class 10 — Vehicles, general computer hardware (30%)', rate: 0.3 },
  { code: '10.1', label: 'Class 10.1 — Passenger vehicle over the cap (30%)', rate: 0.3 },
  { code: '12', label: 'Class 12 — Tools under $500, software (100%)', rate: 1 },
  { code: '13', label: 'Class 13 — Leasehold improvements (straight-line)', rate: 0 },
  { code: '14.1', label: 'Class 14.1 — Goodwill, intangibles (5%)', rate: 0.05 },
  { code: '50', label: 'Class 50 — Computer equipment (55%)', rate: 0.55 },
  { code: '53', label: 'Class 53 — Manufacturing equipment (50%)', rate: 0.5 },
  { code: '54', label: 'Class 54 — Zero-emission vehicles (30%)', rate: 0.3 },
];

export interface FixedAssetLike {
  costCents: number;
  salvageCents: number;
  inServiceDate: string;
  method: DepreciationMethod;
  usefulLifeMonths: number;
  /** Annual rate for declining balance, e.g. 0.2 for 20%. */
  decliningRate: number;
}

/** Months are addressed as 'YYYY-MM'. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function nextMonth(key: string): string {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

export function lastDayOfMonth(key: string): string {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** The first month depreciation is taken: the month the asset went into service. */
export function firstDepreciationMonth(asset: Pick<FixedAssetLike, 'inServiceDate'>): string {
  return monthKey(asset.inServiceDate);
}

/**
 * One month's depreciation given what has been taken so far. Straight-line spreads cost less
 * salvage evenly over the life; declining balance takes rate/12 of the remaining book value.
 * Both stop at salvage value, and the last straight-line month absorbs rounding so the asset
 * lands exactly on salvage.
 */
export function monthlyDepreciationCents(asset: FixedAssetLike, accumulatedCents: number, monthsTaken: number): number {
  const depreciable = Math.max(0, asset.costCents - asset.salvageCents);
  const remaining = Math.max(0, depreciable - accumulatedCents);
  if (remaining === 0) return 0;
  if (asset.method === 'straightLine') {
    const life = Math.max(1, asset.usefulLifeMonths);
    const monthsLeft = Math.max(1, life - monthsTaken);
    return Math.min(remaining, Math.round(remaining / monthsLeft));
  }
  const bookValue = asset.costCents - accumulatedCents;
  const raw = Math.round((bookValue * asset.decliningRate) / 12);
  // Declining balance never quite reaches salvage on its own; once the monthly amount becomes
  // trivial (under a dollar) or the life is exhausted, take the rest.
  if (raw < 100 || (asset.usefulLifeMonths > 0 && monthsTaken >= asset.usefulLifeMonths - 1)) return remaining;
  return Math.min(remaining, raw);
}

export interface ScheduleRow {
  month: string;
  amountCents: number;
  accumulatedCents: number;
  bookValueCents: number;
}

/** The month-by-month schedule from in-service through `throughMonth` (inclusive), starting from
 * whatever has already been taken. */
export function depreciationSchedule(asset: FixedAssetLike, throughMonth: string, alreadyTaken: Array<{ month: string; amountCents: number }> = []): ScheduleRow[] {
  const taken = new Map(alreadyTaken.map((t) => [t.month, t.amountCents]));
  const rows: ScheduleRow[] = [];
  let accumulated = 0;
  let monthsTaken = 0;
  for (let month = firstDepreciationMonth(asset); month <= throughMonth; month = nextMonth(month)) {
    const amount = taken.has(month) ? taken.get(month)! : monthlyDepreciationCents(asset, accumulated, monthsTaken);
    accumulated += amount;
    monthsTaken += 1;
    rows.push({ month, amountCents: amount, accumulatedCents: accumulated, bookValueCents: asset.costCents - accumulated });
    if (rows.length > 1200) break; // a century is enough
  }
  return rows;
}

/** Months from in-service through `throughMonth` that have no depreciation row yet. */
export function missingMonths(asset: FixedAssetLike, throughMonth: string, alreadyTaken: Array<{ month: string }>): string[] {
  const have = new Set(alreadyTaken.map((t) => t.month));
  return depreciationSchedule(asset, throughMonth).map((r) => r.month).filter((m) => !have.has(m));
}

export interface DisposalResult {
  proceedsCents: number;
  costCents: number;
  accumulatedCents: number;
  bookValueCents: number;
  /** Positive = gain, negative = loss. */
  gainLossCents: number;
}

export function disposalFigures(costCents: number, accumulatedCents: number, proceedsCents: number): DisposalResult {
  const bookValueCents = costCents - accumulatedCents;
  return { proceedsCents, costCents, accumulatedCents, bookValueCents, gainLossCents: proceedsCents - bookValueCents };
}
