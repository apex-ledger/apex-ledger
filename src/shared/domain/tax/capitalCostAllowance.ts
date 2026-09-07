/** Capital cost allowance — tax depreciation on the T2 (schedule 8) and the T2125.
 *
 * The arithmetic is not depreciation as the books know it. CCA runs on a pool per class rather than
 * per asset, the first year of an addition is deliberately restricted, and disposing of something
 * reduces the pool by its proceeds rather than by its book value. Doing it by hand in a spreadsheet
 * every year is where errors come from, so it lives here with the rules written down.
 *
 * Rates and the accelerated investment incentive were verified against the CRA's published CCA
 * classes and the AII phase-out schedule. Where a rule has a date in it, the date is the year the
 * property became AVAILABLE FOR USE, which is not always the year it was bought.
 */

export interface CcaClassDefinition {
  /** The class number as the CRA writes it — "8", "10.1", "43.1". A string because of the decimals. */
  code: string;
  rate: number;
  description: string;
  /** A few classes are outside the half-year rule entirely (Class 12 small tools, for instance). */
  exemptFromHalfYear?: boolean;
}

/** The classes a small business actually meets. Not the full CRA list, which runs past class 60 —
 * anything unusual can be entered with its own rate rather than pretending this is exhaustive. */
export const CCA_CLASSES: CcaClassDefinition[] = [
  { code: '1', rate: 0.04, description: 'Buildings acquired after 1987' },
  { code: '3', rate: 0.05, description: 'Buildings acquired before 1988' },
  { code: '6', rate: 0.10, description: 'Frame, log, stucco buildings; fences; greenhouses' },
  { code: '8', rate: 0.20, description: 'Furniture, fixtures, equipment, machinery not in another class' },
  { code: '10', rate: 0.30, description: 'Vehicles, vans, trucks, general-purpose computer hardware' },
  { code: '10.1', rate: 0.30, description: 'Passenger vehicle above the prescribed cost limit' },
  { code: '12', rate: 1.00, description: 'Tools, utensils, software, items under the small-cost limit', exemptFromHalfYear: true },
  { code: '13', rate: 0, description: 'Leasehold improvements — straight-line over the lease term' },
  { code: '14.1', rate: 0.05, description: 'Goodwill and other intangibles (formerly eligible capital property)' },
  { code: '16', rate: 0.40, description: 'Taxis, rental vehicles, freight trucks over 11 788 kg' },
  { code: '43', rate: 0.30, description: 'Manufacturing and processing machinery' },
  { code: '43.1', rate: 0.30, description: 'Clean energy generation equipment' },
  { code: '43.2', rate: 0.50, description: 'Clean energy generation equipment, higher-efficiency' },
  { code: '44', rate: 0.25, description: 'Patents' },
  { code: '45', rate: 0.45, description: 'Computer hardware acquired 2004–2005' },
  { code: '50', rate: 0.55, description: 'Computer hardware and systems software acquired after March 2007' },
  { code: '53', rate: 0.50, description: 'Manufacturing and processing machinery acquired 2016–2025' },
];

const BY_CODE = new Map(CCA_CLASSES.map((c) => [c.code, c]));

export function ccaClass(code: string): CcaClassDefinition | undefined {
  return BY_CODE.get(code);
}

/** The multiplier applied to a year's NET ADDITIONS before the class rate.
 *
 * Three regimes, keyed on the year the property became available for use:
 *
 *   before 2024   the accelerated investment incentive at full strength: the half-year rule is
 *                 suspended and the net addition is grossed up by half again, so 1.5.
 *   2024 to 2027  the incentive is phasing out. The half-year rule stays suspended but the gross-up
 *                 is gone, leaving 1.0 — which is still twice the ordinary half-year deduction.
 *   2028 onward   the incentive has ended and the half-year rule is back: 0.5.
 *
 * Property that was never subject to the half-year rule has nothing to suspend, so it gets the
 * gross-up alone: 1.5, then 1.25 through the phase-out, then 1.0.
 */
export function firstYearFactor(availableForUseYear: number, exemptFromHalfYear = false): number {
  if (availableForUseYear <= 2023) return 1.5;
  if (availableForUseYear <= 2027) return exemptFromHalfYear ? 1.25 : 1.0;
  return exemptFromHalfYear ? 1.0 : 0.5;
}

export interface CcaClassInput {
  /** Class code, e.g. '8'. */
  code: string;
  /** Undepreciated capital cost brought forward. */
  openingUccCents: number;
  additionsCents: number;
  /** Proceeds of disposition, capped at original cost by the caller if that matters. */
  dispositionsCents: number;
  /** Overrides the table rate — for class 13, or a class not listed above. */
  rateOverride?: number;
  /** Claim less than the maximum. Undefined claims the maximum, which is the usual choice; a loss
   * year is the case where claiming less and preserving the pool is worth more. */
  claimCents?: number;
  /** Year the additions became available for use. Drives the first-year factor. */
  availableForUseYear: number;
}

export interface CcaClassResult {
  code: string;
  description: string;
  rate: number;
  openingUccCents: number;
  additionsCents: number;
  dispositionsCents: number;
  /** Additions less dispositions — what the first-year restriction applies to. */
  netAdditionsCents: number;
  /** The adjustment the first-year factor makes to the base before the rate is applied. */
  firstYearAdjustmentCents: number;
  /** UCC the rate is actually applied to. */
  baseForCcaCents: number;
  maximumCcaCents: number;
  claimedCcaCents: number;
  closingUccCents: number;
  /** Pool went negative: more was recovered on sale than remained in it. Taxable income. */
  recaptureCents: number;
  /** Class emptied of assets with UCC left in it. Deductible in full. */
  terminalLossCents: number;
}

function roundCents(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** Works one class through a year.
 *
 * The order is the order Schedule 8 uses, and it matters: dispositions come off before the
 * first-year adjustment, so selling one asset and buying another in the same year restricts only
 * the excess rather than the whole purchase.
 */
export function computeCcaForClass(input: CcaClassInput): CcaClassResult {
  const definition = ccaClass(input.code);
  const rate = input.rateOverride ?? definition?.rate ?? 0;
  const netAdditionsCents = input.additionsCents - input.dispositionsCents;

  const uccBeforeAdjustment = input.openingUccCents + netAdditionsCents;

  // Recapture: the pool is negative, meaning more came back on disposal than was left to write off.
  // The excess is income, and the pool is emptied rather than carried forward negative.
  if (uccBeforeAdjustment < 0) {
    return {
      code: input.code,
      description: definition?.description ?? 'Custom class',
      rate,
      openingUccCents: input.openingUccCents,
      additionsCents: input.additionsCents,
      dispositionsCents: input.dispositionsCents,
      netAdditionsCents,
      firstYearAdjustmentCents: 0,
      baseForCcaCents: 0,
      maximumCcaCents: 0,
      claimedCcaCents: 0,
      closingUccCents: 0,
      recaptureCents: -uccBeforeAdjustment,
      terminalLossCents: 0,
    };
  }

  // The first-year restriction applies only to a NET addition. A year that disposed of more than it
  // bought has nothing to restrict.
  const factor = firstYearFactor(input.availableForUseYear, definition?.exemptFromHalfYear);
  const firstYearAdjustmentCents = netAdditionsCents > 0 ? roundCents(netAdditionsCents * (factor - 1)) : 0;

  const baseForCcaCents = uccBeforeAdjustment + firstYearAdjustmentCents;
  const maximumCcaCents = Math.max(0, roundCents(baseForCcaCents * rate));
  // Never more than the maximum, never less than nothing, and never more than the pool holds.
  const requested = input.claimCents ?? maximumCcaCents;
  const claimedCcaCents = Math.min(Math.max(0, requested), maximumCcaCents, Math.max(0, uccBeforeAdjustment));

  return {
    code: input.code,
    description: definition?.description ?? 'Custom class',
    rate,
    openingUccCents: input.openingUccCents,
    additionsCents: input.additionsCents,
    dispositionsCents: input.dispositionsCents,
    netAdditionsCents,
    firstYearAdjustmentCents,
    baseForCcaCents,
    maximumCcaCents,
    claimedCcaCents,
    closingUccCents: uccBeforeAdjustment - claimedCcaCents,
    recaptureCents: 0,
    terminalLossCents: 0,
  };
}

export interface CcaScheduleResult {
  fiscalYearEnd: string;
  rows: CcaClassResult[];
  totalOpeningUccCents: number;
  totalAdditionsCents: number;
  totalDispositionsCents: number;
  totalClaimedCents: number;
  totalClosingUccCents: number;
  totalRecaptureCents: number;
  totalTerminalLossCents: number;
}

export function ccaSchedule(classes: CcaClassInput[], fiscalYearEnd: string): CcaScheduleResult {
  const rows = classes
    .map(computeCcaForClass)
    .sort((a, b) => Number(a.code) - Number(b.code) || a.code.localeCompare(b.code));

  return {
    fiscalYearEnd,
    rows,
    totalOpeningUccCents: rows.reduce((sum, r) => sum + r.openingUccCents, 0),
    totalAdditionsCents: rows.reduce((sum, r) => sum + r.additionsCents, 0),
    totalDispositionsCents: rows.reduce((sum, r) => sum + r.dispositionsCents, 0),
    totalClaimedCents: rows.reduce((sum, r) => sum + r.claimedCcaCents, 0),
    totalClosingUccCents: rows.reduce((sum, r) => sum + r.closingUccCents, 0),
    totalRecaptureCents: rows.reduce((sum, r) => sum + r.recaptureCents, 0),
    totalTerminalLossCents: rows.reduce((sum, r) => sum + r.terminalLossCents, 0),
  };
}
