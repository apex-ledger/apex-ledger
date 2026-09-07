/**
 * WSIB (Workplace Safety and Insurance Board) premium rates for Ontario, 2026 — sourced from
 * wsib.ca/en/2026premiumrates (verified Aug 2026). These change every calendar year (new class
 * rates, new maximum insurable earnings ceiling), so re-verify against the WSIB's published rate
 * table before relying on them for a new year, same discipline as craRates2026.ts.
 *
 * Unlike CPP/EI, WSIB is 100% employer-paid (no employee deduction) and is Ontario-only — other
 * provinces have their own, differently-named and differently-rated workers' compensation boards
 * (WCB in BC/Alberta/Manitoba/Saskatchewan, CNESST in Quebec, WorkSafeNB, etc.) that this table
 * does not cover. A company only has a premium rate at all if it selected a WSIB class — see
 * CompanyInfo.wsibClassCode/wsibRate, both null by default.
 */

/** Every employer gets assigned one or more 6-digit NAICS classification codes, which each roll
 * up into exactly one of these 35 rate classes/subclasses — the premium rate is set per class, not
 * per individual NAICS code, so this is the practical unit accountants pick from. */
export interface WsibRateClass {
  code: string;
  label: string;
  /** Dollars per $100 of insurable earnings. */
  rate: number;
}

export const WSIB_RATE_CLASSES_2026: WsibRateClass[] = [
  { code: 'A', label: 'Agriculture', rate: 1.9 },
  { code: 'B', label: 'Mining, Quarrying and Oil and Gas Extraction', rate: 2.01 },
  { code: 'C', label: 'Utilities', rate: 0.56 },
  { code: 'D1', label: 'Educational Services', rate: 0.33 },
  { code: 'D2', label: 'Public Administration', rate: 3.49 },
  { code: 'D3', label: 'Hospitals', rate: 1.09 },
  { code: 'E1', label: 'Food, Textiles and Related Manufacturing', rate: 1.31 },
  { code: 'E2', label: 'Non-Metallic and Mineral Manufacturing', rate: 1.94 },
  { code: 'E3', label: 'Printing, Petroleum and Chemical Manufacturing', rate: 1.02 },
  { code: 'E4', label: 'Metal, Transportation Equipment and Furniture Manufacturing', rate: 1.74 },
  { code: 'E5', label: 'Machinery, Electrical Equipment and Miscellaneous Manufacturing', rate: 1.21 },
  { code: 'E6', label: 'Computer and Electronic Manufacturing', rate: 0.31 },
  { code: 'F1', label: 'Rail, Water, Truck Transportation and Postal Service', rate: 3.41 },
  { code: 'F2', label: 'Air, Transit, Ground Passenger, Recreational and Pipeline Transportation, Courier Services and Warehousing', rate: 1.43 },
  { code: 'G1', label: 'Residential Building Construction', rate: 2.18 },
  { code: 'G2', label: 'Infrastructure Construction', rate: 1.72 },
  { code: 'G3', label: 'Foundation, Structure and Building Exterior Construction', rate: 3.55 },
  { code: 'G4', label: 'Building Equipment Construction', rate: 1.54 },
  { code: 'G5', label: 'Specialty Trades Construction', rate: 2.15 },
  { code: 'G6', label: 'Non-residential Building Construction', rate: 1.61 },
  { code: 'H1', label: 'Petroleum, Food, Motor Vehicle and Miscellaneous Wholesale', rate: 1.52 },
  { code: 'H2', label: 'Personal and Household Goods, Building Materials and Machinery Wholesale', rate: 0.76 },
  { code: 'I1', label: 'Motor Vehicles, Building Materials and Food and Beverage Retail', rate: 1.23 },
  { code: 'I2', label: 'Furniture, Home Furnishings, Clothing and Clothing Accessories Retail', rate: 0.87 },
  { code: 'I3', label: 'Electronics, Appliances and Health and Personal Care Retail', rate: 0.33 },
  { code: 'I4', label: 'Specialized Retail and Department Stores', rate: 0.95 },
  { code: 'J', label: 'Information and Culture', rate: 0.41 },
  { code: 'K', label: 'Finance, Management and Leasing', rate: 0.72 },
  { code: 'L', label: 'Professional, Scientific and Technical', rate: 0.18 },
  { code: 'M', label: 'Administration, Services to Buildings, Dwellings and Open Spaces', rate: 1.43 },
  { code: 'N1', label: 'Ambulatory Health Care', rate: 1.59 },
  { code: 'N2', label: 'Nursing and Residential Care Facilities', rate: 2.1 },
  { code: 'N3', label: 'Social Assistance', rate: 1.38 },
  { code: 'O', label: 'Leisure and Hospitality (incl. Restaurants, Hotels, Recreation)', rate: 0.9 },
  { code: 'P', label: 'Other Services', rate: 1.28 },
];

export const WSIB_RATES_2026 = {
  year: 2026,
  classes: WSIB_RATE_CLASSES_2026,
  /** Annual maximum insurable earnings per worker — premium only applies up to this ceiling,
   * banded the same way CPP/EI cap out, just against this separate WSIB-specific ceiling. */
  maxInsurableEarningsCents: 121_700_00,
} as const;

export function wsibRateForClass(code: string | null): number | null {
  if (!code) return null;
  return WSIB_RATE_CLASSES_2026.find((c) => c.code === code)?.rate ?? null;
}
