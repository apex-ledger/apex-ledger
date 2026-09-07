/** Mileage claimed on business travel, at the CRA's per-kilometre rates.
 *
 * Two different CRA figures share the word "mileage" and they are not interchangeable:
 *
 *  - The **automobile allowance rates** (ITR 7306) are what a business may pay an employee, tax-free,
 *    per kilometre driven for work. That is the figure here.
 *  - The **taxable benefit** rates for personal use of a company car are a separate calculation
 *    entirely and are not covered by this.
 *
 * The allowance rate steps DOWN after the first 5,000 km in a calendar year, and resets each
 * January. Getting that wrong overstates the deduction on anyone who drives a lot, which is exactly
 * the person most likely to be looked at.
 */

export interface MileageRate {
  year: number;
  /** Cents per kilometre for the first 5,000 km in the year. */
  firstTierCentsPerKm: number;
  /** Cents per kilometre after that. */
  afterFirstTierCentsPerKm: number;
  /** Extra cents per km in the territories, where the CRA allows 4¢ more. */
  territorySupplementCentsPerKm: number;
}

/** CRA automobile allowance rates (ITR 7306), newest first.
 *
 * Rates are set annually. An unknown year falls back to the most recent known one rather than
 * refusing to compute — a claim at last year's rate is wrong by a cent or two and obviously
 * fixable; a blank screen at year end is neither. The result says which year it used. */
export const MILEAGE_RATES: MileageRate[] = [
  // 2026: 73¢/67¢ in the provinces, 77¢/71¢ in the territories (Finance Canada, January 2026).
  { year: 2026, firstTierCentsPerKm: 73, afterFirstTierCentsPerKm: 67, territorySupplementCentsPerKm: 4 },
  { year: 2025, firstTierCentsPerKm: 72, afterFirstTierCentsPerKm: 66, territorySupplementCentsPerKm: 4 },
  { year: 2024, firstTierCentsPerKm: 70, afterFirstTierCentsPerKm: 64, territorySupplementCentsPerKm: 4 },
  { year: 2023, firstTierCentsPerKm: 68, afterFirstTierCentsPerKm: 62, territorySupplementCentsPerKm: 4 },
  { year: 2022, firstTierCentsPerKm: 61, afterFirstTierCentsPerKm: 55, territorySupplementCentsPerKm: 4 },
];

/** Where the first-tier rate stops applying, per calendar year. */
export const FIRST_TIER_KM = 5000;

const TERRITORIES = new Set(['YT', 'NT', 'NU', 'yukon', 'northwest territories', 'nunavut']);

export function isTerritory(province: string | null | undefined): boolean {
  if (!province) return false;
  return TERRITORIES.has(province.trim()) || TERRITORIES.has(province.trim().toLowerCase());
}

export interface RateLookup {
  rate: MileageRate;
  /** True when the year asked for had no published rate and an older one was used. */
  fellBack: boolean;
}

export function rateForYear(year: number): RateLookup {
  const exact = MILEAGE_RATES.find((r) => r.year === year);
  if (exact) return { rate: exact, fellBack: false };
  // Newest known rate. MILEAGE_RATES is kept newest-first.
  return { rate: MILEAGE_RATES[0], fellBack: true };
}

export interface Trip {
  /** When the trip was keyed in (stored UTC) — the Entered column beside Date. */
  createdAt?: string;
  id: number;
  tripDate: string;
  kilometres: number;
  purpose: string;
  vehicle: string | null;
}

export interface TripClaim extends Trip {
  /** Kilometres of this trip that fell in the first tier. */
  firstTierKm: number;
  afterFirstTierKm: number;
  amountCents: number;
  /** Running total for the year up to and including this trip. */
  cumulativeKm: number;
}

export interface MileageClaimResult {
  year: number;
  rate: MileageRate;
  rateFellBack: boolean;
  isTerritory: boolean;
  trips: TripClaim[];
  totalKm: number;
  totalCents: number;
  /** Kilometres past the 5,000 km step, where the lower rate applies. */
  kmAtLowerRate: number;
}

/**
 * Works out the claim for one calendar year's trips.
 *
 * Trips are taken in date order, because the 5,000 km step depends on what came before: the same
 * trip is worth more in March than in November. Sorting by anything else would make the total
 * depend on the order rows happened to be entered.
 */
export function computeMileageClaim(trips: Trip[], year: number, province: string | null): MileageClaimResult {
  const { rate, fellBack } = rateForYear(year);
  const territory = isTerritory(province);
  const supplement = territory ? rate.territorySupplementCentsPerKm : 0;

  const inYear = trips
    .filter((t) => t.tripDate.slice(0, 4) === String(year))
    .sort((a, b) => a.tripDate.localeCompare(b.tripDate) || a.id - b.id);

  let cumulative = 0;
  const claimed: TripClaim[] = [];

  for (const t of inYear) {
    // Negative distances are meaningless and would silently reduce the claim.
    const km = Math.max(0, t.kilometres);

    // A single trip can straddle the step, so it is split rather than charged wholly at one rate.
    const roomInFirstTier = Math.max(0, FIRST_TIER_KM - cumulative);
    const firstTierKm = Math.min(km, roomInFirstTier);
    const afterFirstTierKm = km - firstTierKm;

    const amountCents = Math.round(
      firstTierKm * (rate.firstTierCentsPerKm + supplement) + afterFirstTierKm * (rate.afterFirstTierCentsPerKm + supplement),
    );

    cumulative += km;
    claimed.push({ ...t, firstTierKm, afterFirstTierKm, amountCents, cumulativeKm: cumulative });
  }

  return {
    year,
    rate,
    rateFellBack: fellBack,
    isTerritory: territory,
    trips: claimed,
    totalKm: claimed.reduce((sum, t) => sum + t.kilometres, 0),
    totalCents: claimed.reduce((sum, t) => sum + t.amountCents, 0),
    kmAtLowerRate: claimed.reduce((sum, t) => sum + t.afterFirstTierKm, 0),
  };
}
