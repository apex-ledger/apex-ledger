import type { TaxCode } from '../types';

/** Every sales-tax code the app offers, in one place.
 *
 * The dropdown options used to be copy-pasted into each of the ten screens that ask for a tax code,
 * which is why they had already drifted apart in wording. Adding the other provinces to ten lists
 * by hand would have guaranteed more of the same, so all of them now read from here.
 *
 * Rates are the combined rate charged on a pre-tax amount. `claimableFraction` is the share of that
 * tax which is a recoverable input tax credit — the distinction that matters to the books, because
 * the non-recoverable share is a real cost that belongs in the expense account rather than in a
 * recoverable-tax account:
 *   - GST and HST are fully recoverable for a registrant.
 *   - PST (BC, SK) and RST (MB) are NOT recoverable. They are a cost of the purchase.
 *   - QST is recoverable only if the business is registered for QST, so Quebec has two codes.
 *   - US sales tax is not a Canadian input tax credit at all.
 *   - Meals & entertainment is restricted by the CRA to a 50% claim.
 *
 * Rates verified against the CRA's charge-and-collect rate table and current provincial rates,
 * including Nova Scotia's cut from 15% to 14% effective 1 April 2025.
 */

export interface TaxCodeDefinition {
  code: TaxCode;
  /** Shown in the dropdown. Short enough to fit a table cell. */
  label: string;
  /** Combined rate applied to a pre-tax base. Zero for the codes that carry no tax. */
  rate: number;
  /** Share of the tax that is a recoverable ITC/ITR. */
  claimableFraction: number;
  /** The part of `rate` that is federal GST or HST, and so belongs on a CRA GST/HST return.
   * PST and RST are provincial taxes filed with the province, and QST is filed with Revenu
   * Quebec, so for those codes this is just the 5% federal slice rather than the whole rate. */
  gstHstRate: number;
  /** Grouping for the dropdown, so the province list doesn't read as one undifferentiated blob. */
  group: 'Common' | 'Provincial' | 'Other';
  /** Longer explanation, shown as the option's title attribute. */
  note?: string;
  /** Meals & entertainment's 50% restriction is a rule about purchases, so it is never offered as
   * a tax treatment on a sale. */
  expenseOnly?: boolean;
}

export const TAX_CODE_DEFINITIONS: TaxCodeDefinition[] = [
  {
    code: 'HST',
    label: 'HST 13% (ON)',
    rate: 0.13,
    claimableFraction: 1,
    gstHstRate: 0.13,
    // Provincial, like the rest of the rate-bearing codes: it is Ontario's rate, not a universal
    // one, and grouping it as Common would leave it showing in a British Columbia file.
    group: 'Provincial',
    note: 'Ontario. Fully recoverable input tax credit for a registrant.',
  },
  {
    code: 'NonHST',
    label: 'No tax',
    rate: 0,
    claimableFraction: 0,
    gstHstRate: 0,
    group: 'Common',
    note: 'Zero-rated, exempt, or simply no sales tax on this amount.',
  },
  {
    code: 'Manual',
    label: 'Manual — enter the tax myself',
    rate: 0,
    claimableFraction: 1,
    gstHstRate: 0,
    group: 'Common',
    note: 'For a mixed or unusual invoice: type the exact tax from the document. Treated as fully recoverable.',
  },
  {
    code: 'MealsHST',
    label: 'Meals & entertainment 13% (50% claimable)',
    rate: 0.13,
    claimableFraction: 0.5,
    gstHstRate: 0.13,
    group: 'Common',
    note: 'The CRA restricts meals and entertainment to a 50% input tax credit; the other half is a real cost.',
    expenseOnly: true,
  },

  {
    code: 'GST',
    label: 'GST 5% (AB, NT, NU, YT)',
    rate: 0.05,
    claimableFraction: 1,
    gstHstRate: 0.05,
    group: 'Provincial',
    note: 'Alberta and the territories charge the federal GST only.',
  },
  {
    code: 'HST_NS',
    label: 'HST 14% (NS)',
    rate: 0.14,
    claimableFraction: 1,
    gstHstRate: 0.14,
    group: 'Provincial',
    note: 'Nova Scotia, reduced from 15% effective 1 April 2025.',
  },
  {
    code: 'HST_15',
    label: 'HST 15% (NB, NL, PE)',
    rate: 0.15,
    claimableFraction: 1,
    gstHstRate: 0.15,
    group: 'Provincial',
    note: 'New Brunswick, Newfoundland and Labrador, and Prince Edward Island.',
  },
  {
    code: 'HST_NB',
    label: 'HST 15% (NB)',
    rate: 0.15,
    claimableFraction: 1,
    gstHstRate: 0.15,
    group: 'Provincial',
    note: 'New Brunswick. Fully recoverable input tax credit for a registrant.',
  },
  {
    code: 'HST_NL',
    label: 'HST 15% (NL)',
    rate: 0.15,
    claimableFraction: 1,
    gstHstRate: 0.15,
    group: 'Provincial',
    note: 'Newfoundland and Labrador. Fully recoverable input tax credit for a registrant.',
  },
  {
    code: 'HST_PE',
    label: 'HST 15% (PE)',
    rate: 0.15,
    claimableFraction: 1,
    gstHstRate: 0.15,
    group: 'Provincial',
    note: 'Prince Edward Island. Fully recoverable input tax credit for a registrant.',
  },
  {
    code: 'GST_AB',
    label: 'GST 5% (AB)',
    rate: 0.05,
    claimableFraction: 1,
    gstHstRate: 0.05,
    group: 'Provincial',
    note: 'Alberta — no provincial sales tax.',
  },
  {
    code: 'GST_NT',
    label: 'GST 5% (NT)',
    rate: 0.05,
    claimableFraction: 1,
    gstHstRate: 0.05,
    group: 'Provincial',
    note: 'Northwest Territories — no territorial sales tax.',
  },
  {
    code: 'GST_NU',
    label: 'GST 5% (NU)',
    rate: 0.05,
    claimableFraction: 1,
    gstHstRate: 0.05,
    group: 'Provincial',
    note: 'Nunavut — no territorial sales tax.',
  },
  {
    code: 'GST_YT',
    label: 'GST 5% (YT)',
    rate: 0.05,
    claimableFraction: 1,
    gstHstRate: 0.05,
    group: 'Provincial',
    note: 'Yukon — no territorial sales tax.',
  },
  {
    code: 'GST_PST_BC',
    label: 'GST 5% + PST 7% = 12% (BC)',
    rate: 0.12,
    // Only the 5% GST portion of the 12% is recoverable: 5/12.
    claimableFraction: 5 / 12,
    gstHstRate: 0.05,
    group: 'Provincial',
    note: 'British Columbia. The 7% PST is not recoverable — it stays in the expense as a real cost.',
  },
  {
    code: 'GST_PST_SK',
    label: 'GST 5% + PST 6% = 11% (SK)',
    rate: 0.11,
    claimableFraction: 5 / 11,
    gstHstRate: 0.05,
    group: 'Provincial',
    note: 'Saskatchewan. The 6% PST is not recoverable.',
  },
  {
    code: 'GST_RST_MB',
    label: 'GST 5% + RST 7% = 12% (MB)',
    rate: 0.12,
    claimableFraction: 5 / 12,
    gstHstRate: 0.05,
    group: 'Provincial',
    note: 'Manitoba. The 7% retail sales tax is not recoverable.',
  },

  {
    code: 'GST_QST_QC',
    label: 'GST 5% + QST 9.975% = 14.975% (QC)',
    rate: 0.14975,
    // Registered for QST, so the QST is an input tax refund and both halves come back.
    claimableFraction: 1,
    gstHstRate: 0.05,
    group: 'Provincial',
    note: 'Quebec, registered for QST. Both taxes are recoverable. The QST half is filed with Revenu Quebec, not the CRA.',
  },
  {
    code: 'GST_QST_QC_NR',
    label: 'GST 5% + QST 9.975% (QC, not QST-registered)',
    rate: 0.14975,
    // Not registered for QST: only the federal 5% is recoverable, the QST is a real cost.
    claimableFraction: 0.05 / 0.14975,
    gstHstRate: 0.05,
    group: 'Provincial',
    note: 'Quebec, not registered for QST. Only the 5% GST is recoverable; the QST stays in the expense as a cost.',
  },
  {
    code: 'USTax',
    label: 'US sales tax 8%',
    rate: 0.08,
    claimableFraction: 0,
    gstHstRate: 0,
    group: 'Other',
    note: 'US sales tax is not a Canadian input tax credit — the whole amount is a cost.',
  },
];

const BY_CODE = new Map(TAX_CODE_DEFINITIONS.map((d) => [d.code, d]));

/** Whether a line carrying this code belongs on a CRA GST/HST return at all.
 *
 * Every code with a federal component does — not just Ontario's 13%. For BC/SK/MB only the 5% GST
 * slice counts, because PST and RST are filed with the province; likewise Quebec, whose QST goes to
 * Revenu Quebec. Meals stays out, as it always has: its 50% restriction is applied when the claim is
 * prepared, not when the tax is recorded. Manual is in, because the accountant will enter a real
 * figure against it. This is the ONE place that answers the question — HST Centre uses it to build
 * the return, and the filing lock uses it to decide what would change a return already filed. */
export function taxCodeReportsGstHst(code: TaxCode | null): boolean {
  if (code === 'Manual') return true;
  const definition = taxCodeDefinition(code);
  return definition !== undefined && definition.gstHstRate > 0 && code !== 'MealsHST';
}

export function taxCodeDefinition(code: TaxCode | null): TaxCodeDefinition | undefined {
  return code ? BY_CODE.get(code) : undefined;
}

export function taxCodeLabel(code: TaxCode | null): string {
  return taxCodeDefinition(code)?.label ?? '—';
}

export interface TaxCodeOption {
  value: string;
  label: string;
  title?: string;
  group: string;
}

/** Options for a `<select>`, with a leading blank.
 *
 * `context` drops the purchase-only codes from a sales screen. Every screen that asks for a tax
 * code calls this rather than declaring its own list, which is what stopped the ten copies of it
 * from drifting further apart. */
export function taxCodeOptions(
  context: 'all' | 'expense' | 'income' = 'all',
  province?: string | null,
  options: { allProvinces?: boolean; includeBlank?: boolean } = {},
): TaxCodeOption[] {
  const home = defaultTaxCodeForProvince(province);
  const blank: TaxCodeOption[] = options.includeBlank
    ? [{ value: '', label: '— choose tax —', title: 'No tax treatment has been selected.', group: 'Common' }]
    : [];

  // North Ledger's day-to-day tax picker is intentionally simple: the company's own
  // province/territory tax, the commonly requested 5% and 8% rates, No Tax, and Custom Tax. The detailed codes remain in the engine so
  // imported/history rows keep their original treatment and reports can still split GST/HST,
  // PST/RST and QST correctly.
  //
  // `allProvinces` is retained for specialist/import screens and backwards compatibility, but no
  // ordinary transaction screen requests it. This keeps the normal picker to exactly the three
  // choices the bookkeeper needs for the company currently open.
  if (home && !options.allProvinces) {
    const homeDefinition = taxCodeDefinition(home)!;
    const provinceLabel = province?.trim() || 'Company province';
    const companyTax: TaxCodeOption = {
      value: homeDefinition.code,
      // Ontario's everyday label is deliberately the plain wording accountants asked for. Other
      // provinces retain their correct rate/name rather than being mislabeled as Ontario HST.
      label: homeDefinition.code === 'HST' ? 'HST 13%' : homeDefinition.label,
      title: `Default from company address (${provinceLabel}). ${homeDefinition.note ?? ''}`.trim(),
      group: 'Common',
    };
    const commonRates: TaxCodeOption[] = [
      ...(homeDefinition.code === 'GST' ? [] : [{ value: 'GST', label: 'GST 5%', title: taxCodeDefinition('GST')?.note, group: 'Common' }]),
      { value: 'USTax', label: 'US Tax 8% (not an ITC)', title: taxCodeDefinition('USTax')?.note, group: 'Common' },
    ];
    // Meals and entertainment carry a 50% input tax credit; a purchase screen in a 13% HST
    // province must offer that code or the bookkeeper can only over-claim.
    const meals: TaxCodeOption[] = context === 'expense' && homeDefinition.gstHstRate === 0.13 ? [mealsOption()] : [];
    return [
      ...blank,
      companyTax,
      ...commonRates,
      ...meals,
      {
        value: 'NonHST',
        label: 'HST Exempt',
        title: 'Use when the invoice/receipt has no GST/HST or other sales tax (including exempt or zero-rated treatment where appropriate).',
        group: 'Common',
      },
      {
        value: 'Manual',
        label: 'Custom rate',
        title: 'Enter a custom percentage or the exact tax amount shown on the source document.',
        group: 'Common',
      },
    ];
  }

  // North Ledger's current everyday workflow is Ontario HST. Keep the requested three choices
  // available even when an older/imported company file has no province saved; otherwise the HST
  // choice disappears and the invoice/bill forms cannot calculate tax at all. A recognised
  // non-Ontario province above still receives its legally correct local rate.
  if (!home && !options.allProvinces) {
    return [
      ...blank,
      {
        value: 'HST',
        label: 'HST 13%',
        title: 'Ontario HST fallback. Add the company province in Company Settings if a different provincial rate applies.',
        group: 'Common',
      },
      { value: 'GST', label: 'GST 5%', title: taxCodeDefinition('GST')?.note, group: 'Common' },
      { value: 'USTax', label: 'US Tax 8% (not an ITC)', title: taxCodeDefinition('USTax')?.note, group: 'Common' },
      ...(context === 'expense' ? [mealsOption()] : []),
      { value: 'NonHST', label: 'HST Exempt', group: 'Common' },
      { value: 'Manual', label: 'Custom rate', title: 'Enter a custom percentage or exact tax amount.', group: 'Common' },
    ];
  }

  let usable = TAX_CODE_DEFINITIONS.filter((d) => !(d.expenseOnly && context === 'income'));
  return [
    { value: '', label: '— none —', group: 'Common' },
    ...usable.map((d) => ({ value: d.code, label: d.label, title: d.note, group: d.group })),
  ];
}

function mealsOption(): TaxCodeOption {
  const definition = taxCodeDefinition('MealsHST')!;
  return { value: definition.code, label: definition.label, title: definition.note, group: 'Common' };
}

/** The full list, for screens that show every code regardless of direction. */
export const TAX_CODE_SELECT_OPTIONS: TaxCodeOption[] = taxCodeOptions('all');

/** Groups the options for rendering inside `<optgroup>`s, preserving declaration order. */
export function groupedTaxCodeOptions(context: 'all' | 'expense' | 'income' = 'all'): { group: string; options: TaxCodeOption[] }[] {
  const groups: { group: string; options: TaxCodeOption[] }[] = [];
  for (const option of taxCodeOptions(context)) {
    const existing = groups.find((g) => g.group === option.group);
    if (existing) existing.options.push(option);
    else groups.push({ group: option.group, options: [option] });
  }
  return groups;
}

/** The embedded GST/HST inside a tax-INCLUSIVE amount, i.e. the part that belongs on a CRA
 * GST/HST return. Zero for codes with no federal component. */
export function gstHstPortionOfInclusive(code: TaxCode | null, inclusiveCents: number): number {
  const definition = taxCodeDefinition(code);
  if (!definition || definition.gstHstRate === 0) return 0;
  // The amount already includes the FULL tax, so the divisor is 1 + the combined rate even when
  // only the federal slice is being extracted — in BC that is 5/112, not 5/105.
  return Math.round((inclusiveCents * definition.gstHstRate) / (1 + definition.rate));
}

/** The total embedded tax inside a tax-inclusive amount, at the code's combined rate. */
export function taxPortionOfInclusive(code: TaxCode | null, inclusiveCents: number): number {
  const definition = taxCodeDefinition(code);
  if (!definition || definition.rate === 0) return 0;
  return Math.round((inclusiveCents * definition.rate) / (1 + definition.rate));
}

/** Maps a province or territory to the sales-tax code a business there normally charges.
 *
 * Accepts whatever is in the company's address field: a two-letter code, the full name, or either
 * with odd casing and spacing, because that field is free text and has always been typed by hand.
 * Quebec resolves to the QST-registered code — a Quebec business charging QST is registered for
 * it — and the non-registered variant stays available in the list for the rare case.
 *
 * Returns null for anything unrecognised rather than guessing Ontario, so an unfilled or misspelt
 * address leaves the tax code blank for the user to pick instead of quietly applying 13%.
 */
const PROVINCE_TAX_CODES: { match: string[]; code: TaxCode }[] = [
  { match: ['on', 'ontario'], code: 'HST' },
  { match: ['ns', 'novascotia'], code: 'HST_NS' },
  { match: ['nb', 'newbrunswick'], code: 'HST_NB' },
  { match: ['nl', 'nf', 'newfoundland', 'newfoundlandandlabrador', 'newfoundland&labrador'], code: 'HST_NL' },
  { match: ['pe', 'pei', 'princeedwardisland'], code: 'HST_PE' },
  { match: ['bc', 'britishcolumbia'], code: 'GST_PST_BC' },
  { match: ['sk', 'saskatchewan'], code: 'GST_PST_SK' },
  { match: ['mb', 'manitoba'], code: 'GST_RST_MB' },
  { match: ['qc', 'pq', 'quebec', 'québec'], code: 'GST_QST_QC' },
  { match: ['ab', 'alberta'], code: 'GST_AB' },
  { match: ['nt', 'nwt', 'northwestterritories'], code: 'GST_NT' },
  { match: ['nu', 'nunavut'], code: 'GST_NU' },
  { match: ['yt', 'yk', 'yukon'], code: 'GST_YT' },
];

function normalizeProvince(province: string): string {
  return province
    .toLowerCase()
    .normalize('NFC')
    .replace(/[\s.\-_]/g, '');
}

export function defaultTaxCodeForProvince(province: string | null | undefined): TaxCode | null {
  if (!province?.trim()) return null;
  const needle = normalizeProvince(province);
  return PROVINCE_TAX_CODES.find((p) => p.match.includes(needle))?.code ?? null;
}

/** The codes that carry no tax at all, as opposed to a tax that simply isn't recoverable. */
export function isNoTaxCode(code: TaxCode | null): boolean {
  return code === null || code === 'NonHST';
}

/** Where the provincial slice of a tax code is filed and posted. Sales tax collected under a
 * provincial code is owed to that province (its own payable account, its own return); on a
 * purchase only Quebec's QST comes back (as an input tax refund, in its own recoverable account) —
 * BC/SK PST and Manitoba RST are a cost and never get a separate line. */
export interface ProvincialTaxAccount {
  province: 'BC' | 'SK' | 'MB' | 'QC';
  taxName: 'PST' | 'RST' | 'QST';
  payableName: string;
  payableCode: string;
  recoverableName: string | null;
  recoverableCode: string | null;
  /** Provincial rate on the pre-tax base. */
  rate: number;
}

const PROVINCIAL_TAX_ACCOUNTS: Partial<Record<TaxCode, ProvincialTaxAccount>> = {
  GST_PST_BC: { province: 'BC', taxName: 'PST', payableName: 'PST Payable (BC)', payableCode: '2285', recoverableName: null, recoverableCode: null, rate: 0.07 },
  GST_PST_SK: { province: 'SK', taxName: 'PST', payableName: 'PST Payable (SK)', payableCode: '2286', recoverableName: null, recoverableCode: null, rate: 0.06 },
  GST_RST_MB: { province: 'MB', taxName: 'RST', payableName: 'RST Payable (MB)', payableCode: '2287', recoverableName: null, recoverableCode: null, rate: 0.07 },
  GST_QST_QC: { province: 'QC', taxName: 'QST', payableName: 'QST Payable', payableCode: '2288', recoverableName: 'QST Recoverable', recoverableCode: '1255', rate: 0.09975 },
  GST_QST_QC_NR: { province: 'QC', taxName: 'QST', payableName: 'QST Payable', payableCode: '2288', recoverableName: null, recoverableCode: null, rate: 0.09975 },
};

export function provincialTaxAccount(code: TaxCode | null): ProvincialTaxAccount | null {
  return (code && PROVINCIAL_TAX_ACCOUNTS[code]) || null;
}

/** The provincial share of a tax figure entered for a provincial code, by the ratio of the
 * provincial rate to the combined rate — exact for a rate-suggested figure, proportional for a
 * hand-typed one. Zero for every non-provincial code. */
export function provincialShareOfTax(code: TaxCode | null, taxCents: number): number {
  const account = provincialTaxAccount(code);
  const definition = taxCodeDefinition(code);
  if (!account || !definition || definition.rate <= 0) return 0;
  return Math.round(taxCents * (account.rate / definition.rate));
}

/** Every province and territory, in the order a Canadian return lists them, with the tax each
 * charges and which return it is filed on. A tax code maps to exactly one jurisdiction; the
 * older nationwide codes (HST_15, GST) are kept for files that already use them and report under
 * "Other / unspecified" so nothing goes missing. */
export type Jurisdiction = 'AB' | 'BC' | 'MB' | 'NB' | 'NL' | 'NS' | 'NT' | 'NU' | 'ON' | 'PE' | 'QC' | 'SK' | 'YT';

export interface JurisdictionInfo {
  code: Jurisdiction;
  name: string;
  /** The combined rate charged today. */
  rate: number;
  federalRate: number;
  provincialRate: number;
  provincialTaxName: 'PST' | 'RST' | 'QST' | null;
  /** Which return the tax goes on. */
  filedWith: 'CRA (GST/HST)' | 'CRA (GST) + Province (PST)' | 'CRA (GST) + Province (RST)' | 'Revenu Québec (GST + QST)';
  taxCodes: TaxCode[];
}

export const JURISDICTIONS: JurisdictionInfo[] = [
  { code: 'AB', name: 'Alberta', rate: 0.05, federalRate: 0.05, provincialRate: 0, provincialTaxName: null, filedWith: 'CRA (GST/HST)', taxCodes: ['GST_AB'] },
  { code: 'BC', name: 'British Columbia', rate: 0.12, federalRate: 0.05, provincialRate: 0.07, provincialTaxName: 'PST', filedWith: 'CRA (GST) + Province (PST)', taxCodes: ['GST_PST_BC'] },
  { code: 'MB', name: 'Manitoba', rate: 0.12, federalRate: 0.05, provincialRate: 0.07, provincialTaxName: 'RST', filedWith: 'CRA (GST) + Province (RST)', taxCodes: ['GST_RST_MB'] },
  { code: 'NB', name: 'New Brunswick', rate: 0.15, federalRate: 0.15, provincialRate: 0, provincialTaxName: null, filedWith: 'CRA (GST/HST)', taxCodes: ['HST_NB'] },
  { code: 'NL', name: 'Newfoundland and Labrador', rate: 0.15, federalRate: 0.15, provincialRate: 0, provincialTaxName: null, filedWith: 'CRA (GST/HST)', taxCodes: ['HST_NL'] },
  { code: 'NS', name: 'Nova Scotia', rate: 0.14, federalRate: 0.14, provincialRate: 0, provincialTaxName: null, filedWith: 'CRA (GST/HST)', taxCodes: ['HST_NS'] },
  { code: 'NT', name: 'Northwest Territories', rate: 0.05, federalRate: 0.05, provincialRate: 0, provincialTaxName: null, filedWith: 'CRA (GST/HST)', taxCodes: ['GST_NT'] },
  { code: 'NU', name: 'Nunavut', rate: 0.05, federalRate: 0.05, provincialRate: 0, provincialTaxName: null, filedWith: 'CRA (GST/HST)', taxCodes: ['GST_NU'] },
  { code: 'ON', name: 'Ontario', rate: 0.13, federalRate: 0.13, provincialRate: 0, provincialTaxName: null, filedWith: 'CRA (GST/HST)', taxCodes: ['HST', 'MealsHST'] },
  { code: 'PE', name: 'Prince Edward Island', rate: 0.15, federalRate: 0.15, provincialRate: 0, provincialTaxName: null, filedWith: 'CRA (GST/HST)', taxCodes: ['HST_PE'] },
  { code: 'QC', name: 'Quebec', rate: 0.14975, federalRate: 0.05, provincialRate: 0.09975, provincialTaxName: 'QST', filedWith: 'Revenu Québec (GST + QST)', taxCodes: ['GST_QST_QC', 'GST_QST_QC_NR'] },
  { code: 'SK', name: 'Saskatchewan', rate: 0.11, federalRate: 0.05, provincialRate: 0.06, provincialTaxName: 'PST', filedWith: 'CRA (GST) + Province (PST)', taxCodes: ['GST_PST_SK'] },
  { code: 'YT', name: 'Yukon', rate: 0.05, federalRate: 0.05, provincialRate: 0, provincialTaxName: null, filedWith: 'CRA (GST/HST)', taxCodes: ['GST_YT'] },
];

export function jurisdictionOfTaxCode(code: TaxCode | null): JurisdictionInfo | null {
  if (!code) return null;
  return JURISDICTIONS.find((j) => j.taxCodes.includes(code)) ?? null;
}
