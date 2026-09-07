/**
 * CRA payroll rates and thresholds for 2026, outside Quebec. Verified against canada.ca-sourced
 * summaries at build time (Jul 2026) — these change every calendar year, so re-verify against the
 * CRA's Payroll Deductions Online Calculator (PDOC) before relying on them for a new tax year.
 */
export const CRA_PAYROLL_RATES_2026 = {
  year: 2026,
  cpp1: {
    rate: 0.0595,
    annualBasicExemptionCents: 350_000, // $3,500
    ympeCents: 74_600_00, // Year's Maximum Pensionable Earnings ("YMPE")
    maxEmployeeContributionCents: 423_045, // $4,230.45
  },
  cpp2: {
    rate: 0.04,
    yampeCents: 85_000_00, // second, higher ceiling ("YAMPE") — CPP2 applies between YMPE and YAMPE
    maxEmployeeContributionCents: 41_600, // $416.00
  },
  ei: {
    employeeRate: 0.0163,
    maxInsurableEarningsCents: 68_900_00,
    maxEmployeeContributionCents: 112_307, // $1,123.07
    employerMultiplier: 1.4,
  },
  /** Statutory minimum in most provinces; some (e.g. after 5+ years' service in certain
   * jurisdictions) require more. Always an editable default, never enforced. */
  defaultVacationPayRate: 0.04,
} as const;
