import type { Employee, PayrollRun } from '../types';

/**
 * Ontario Employer Health Tax (EHT).
 *
 * Charged on total Ontario remuneration — salary, wages, bonuses, vacation pay, taxable benefits —
 * paid to employees who report to work in Ontario. Eligible private-sector employers get an
 * exemption on the first $1,000,000 of annual remuneration (shared across an associated group)
 * and pay 1.95% on the rest. Employers not eligible for the exemption — most public-sector bodies
 * and any employer with over $5 million of remuneration — pay a graduated rate on the whole
 * amount. The annual return is due March 15 of the following year; monthly instalments are
 * required once remuneration passes $1.2 million.
 *
 * The rate table is the Ontario Ministry of Finance schedule in force for 2024 onward. Confirm
 * against the ministry's current bulletin before filing; the figure here is the accrual.
 */
export const EHT_DEFAULT_EXEMPTION_CENTS = 100_000_000;
export const EHT_INSTALMENT_THRESHOLD_CENTS = 120_000_000;
export const EHT_EXEMPTION_CEILING_CENTS = 500_000_000;
export const EHT_TOP_RATE = 0.0195;

/** Graduated rates for employers without the exemption, by total Ontario remuneration. */
const GRADUATED_RATES: Array<{ upToCents: number; rate: number }> = [
  { upToCents: 20_000_000, rate: 0.0098 },
  { upToCents: 23_000_000, rate: 0.01101 },
  { upToCents: 25_000_000, rate: 0.01223 },
  { upToCents: 26_000_000, rate: 0.01344 },
  { upToCents: 28_000_000, rate: 0.01465 },
  { upToCents: 30_000_000, rate: 0.01586 },
  { upToCents: 32_000_000, rate: 0.01708 },
  { upToCents: 34_000_000, rate: 0.01829 },
  { upToCents: 36_000_000, rate: 0.0195 },
  { upToCents: 38_000_000, rate: 0.02072 },
  { upToCents: 40_000_000, rate: 0.02193 },
  { upToCents: Number.POSITIVE_INFINITY, rate: EHT_TOP_RATE },
];

export function ehtGraduatedRate(remunerationCents: number): number {
  return GRADUATED_RATES.find((band) => remunerationCents <= band.upToCents)?.rate ?? EHT_TOP_RATE;
}

export interface EhtInput {
  /** Total Ontario remuneration for the year so far, in cents. */
  remunerationCents: number;
  /** Whether the employer may claim the exemption (private sector, under $5M). */
  exemptionEligible: boolean;
  /** The employer's share of the exemption; the full $1,000,000 unless split with associates. */
  exemptionCents: number;
}

export interface EhtResult {
  remunerationCents: number;
  exemptionAppliedCents: number;
  taxableCents: number;
  rate: number;
  taxCents: number;
  /** Over $1.2M of remuneration Ontario requires monthly instalments rather than one annual payment. */
  instalmentsRequired: boolean;
}

export function computeEht(input: EhtInput): EhtResult {
  const remuneration = Math.max(0, Math.round(input.remunerationCents));
  // The exemption is lost entirely once remuneration passes $5 million, not just reduced.
  const eligible = input.exemptionEligible && remuneration <= EHT_EXEMPTION_CEILING_CENTS;
  const exemptionApplied = eligible ? Math.min(Math.max(0, input.exemptionCents), remuneration) : 0;
  const taxable = remuneration - exemptionApplied;
  const rate = eligible ? EHT_TOP_RATE : ehtGraduatedRate(remuneration);
  return {
    remunerationCents: remuneration,
    exemptionAppliedCents: exemptionApplied,
    taxableCents: taxable,
    rate,
    taxCents: Math.round(taxable * rate),
    instalmentsRequired: remuneration > EHT_INSTALMENT_THRESHOLD_CENTS,
  };
}

/** Posted pay to Ontario employees with a pay date inside the range: gross plus vacation pay,
 * which is what Ontario counts. Draft runs are not yet remuneration. */
export function ontarioRemunerationCents(runs: PayrollRun[], employees: Employee[], from: string, to: string): number {
  const ontario = new Set(employees.filter((e) => e.province === 'ON').map((e) => e.id));
  return runs
    .filter((r) => r.status === 'posted' && ontario.has(r.employeeId) && r.payDate >= from && r.payDate <= to)
    .reduce((sum, r) => sum + r.grossPayCents + r.vacationPayCents, 0);
}

export interface EhtMonth {
  month: string;
  remunerationCents: number;
  /** EHT on the year to the end of this month, less EHT to the end of the previous month. */
  taxCents: number;
}

/** Year-to-date EHT month by month. Because the exemption is annual, the tax is computed on the
 * cumulative figure and the month's share is the increase, so early months show nothing until
 * the exemption is used up. */
export function ehtByMonth(runs: PayrollRun[], employees: Employee[], year: number, exemptionEligible: boolean, exemptionCents: number): EhtMonth[] {
  const months: EhtMonth[] = [];
  let previousTax = 0;
  for (let m = 1; m <= 12; m += 1) {
    const month = `${year}-${String(m).padStart(2, '0')}`;
    const monthEnd = `${month}-31`;
    const ytd = ontarioRemunerationCents(runs, employees, `${year}-01-01`, monthEnd);
    const monthOnly = ontarioRemunerationCents(runs, employees, `${month}-01`, monthEnd);
    const tax = computeEht({ remunerationCents: ytd, exemptionEligible, exemptionCents }).taxCents;
    months.push({ month, remunerationCents: monthOnly, taxCents: tax - previousTax });
    previousTax = tax;
  }
  return months;
}
