export type ColumnRole =
  | 'date'
  | 'vendor'
  | 'category'
  | 'paymentMethod'
  | 'amount'
  | 'currency'
  | 'foreignAmount'
  | 'exchangeRate'
  | 'taxCode'
  | 'taxLabel'
  | 'taxAmount'
  | 'ignore';

export const COLUMN_ROLE_LABELS: Record<ColumnRole, string> = {
  date: 'Date',
  vendor: 'Vendor / Description',
  category: 'Category (→ account)',
  paymentMethod: 'Payment Method (→ account)',
  amount: 'Amount to Post (CAD)',
  currency: 'Currency',
  foreignAmount: 'Foreign Total (e.g. USD)',
  exchangeRate: 'Exchange Rate',
  taxCode: 'Tax Code (HST/USTax/NonHST/Manual)',
  taxLabel: 'Tax Rate Label (e.g. "8%", "No Tax")',
  taxAmount: 'Tax Amount',
  ignore: '— Ignore this column —',
};

export const ALL_COLUMN_ROLES: ColumnRole[] = [
  'date',
  'vendor',
  'category',
  'paymentMethod',
  'amount',
  'currency',
  'foreignAmount',
  'exchangeRate',
  'taxCode',
  'taxLabel',
  'taxAmount',
  'ignore',
];

const HEADER_KEYWORDS: [ColumnRole, RegExp][] = [
  ['date', /^date$/i],
  ['vendor', /^(vendor|payee|merchant|description|memo)$/i],
  ['category', /^(category|account|expense category)$/i],
  ['paymentMethod', /^(payment( method)?|paid ?with|method|account paid from)$/i],
  ['taxCode', /^tax ?code$/i],
  ['taxLabel', /^(tax ?rate|tax %)$/i],
  ['taxAmount', /^tax( amount)?$/i],
  ['exchangeRate', /^(exchange ?rate|fx ?rate|rate)$/i],
  ['currency', /^currency$/i],
  ['foreignAmount', /^(foreign|usd)( total| amount)?$/i],
  ['amount', /^(amount|total|cad( total)?)$/i],
];

type ColumnShape = 'date' | 'money' | 'taxCodeLiteral' | 'percentOrTaxLabel' | 'rate' | 'currencyCode' | 'lowCardinalityText' | 'highCardinalityText' | 'empty';

function looksLikeDate(value: string): boolean {
  return /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(value) || /^\d{1,2}-[A-Za-z]{3,}(-\d{2,4})?$/.test(value) || /^\d{4}-\d{2}-\d{2}$/.test(value);
}
function looksLikeMoney(value: string): boolean {
  return /^\(?-?\$?\s?\d[\d,]*(\.\d{1,2})?\)?$/.test(value) && /\d/.test(value);
}
function looksLikePercent(value: string): boolean {
  return /%$/.test(value) || /^no ?tax$/i.test(value) || /^(manual|exempt)/i.test(value);
}
function looksLikeRate(value: string): boolean {
  return /^\d\.\d{2,4}$/.test(value);
}
function looksLikeCurrencyCode(value: string): boolean {
  return /^[A-Z]{3}$/.test(value.trim());
}
const KNOWN_TAX_CODES = new Set(['hst', 'nonhst', 'manual', 'ustax']);
function looksLikeTaxCode(value: string): boolean {
  return KNOWN_TAX_CODES.has(value.trim().toLowerCase());
}

function classifyColumn(samples: string[]): ColumnShape {
  if (samples.length === 0) return 'empty';
  const fraction = (test: (v: string) => boolean) => samples.filter(test).length / samples.length;

  if (fraction(looksLikeDate) > 0.6) return 'date';
  if (fraction(looksLikeTaxCode) > 0.6) return 'taxCodeLiteral';
  if (fraction(looksLikeRate) > 0.6) return 'rate';
  if (fraction(looksLikeCurrencyCode) > 0.6) return 'currencyCode';
  if (fraction(looksLikePercent) > 0.5) return 'percentOrTaxLabel';
  if (fraction(looksLikeMoney) > 0.6) return 'money';

  // Repeated values (a handful of distinct strings reused across many rows) read as a category or
  // payment method; near-unique values (every row different) read as free text like a vendor name.
  const distinct = new Set(samples.map((s) => s.toLowerCase()));
  return distinct.size / samples.length <= 0.5 ? 'lowCardinalityText' : 'highCardinalityText';
}

/**
 * Guesses each column's role, first from a header row if the first line reads like one, otherwise
 * by sniffing the actual cell values column by column and then resolving ambiguous cases (e.g.
 * multiple money-looking columns) using the whole table's shape, not just one column in
 * isolation. This is only ever a starting point — the reviewer sees and can correct every guess
 * before anything is parsed, since spreadsheet layouts vary a lot client to client and a wrong
 * guess here would misroute real dollar amounts.
 */
export function detectColumnMapping(rows: string[][]): { mapping: ColumnRole[]; hasHeaderRow: boolean } {
  const columnCount = Math.max(0, ...rows.map((r) => r.length));
  if (columnCount === 0) return { mapping: [], hasHeaderRow: false };

  const firstRow = rows[0] ?? [];
  const headerMatches = firstRow.map((cell) => HEADER_KEYWORDS.find(([, re]) => re.test(cell.trim()))?.[0] ?? null);
  const hasHeaderRow = headerMatches.filter(Boolean).length >= 2;
  const dataRows = hasHeaderRow ? rows.slice(1) : rows;

  const shapes: ColumnShape[] = [];
  for (let col = 0; col < columnCount; col++) {
    if (hasHeaderRow && headerMatches[col]) {
      shapes.push('empty'); // header already resolved this column; shape unused
      continue;
    }
    const samples = dataRows.map((r) => (r[col] ?? '').trim()).filter((v) => v.length > 0);
    shapes.push(classifyColumn(samples));
  }

  const moneyColumns = shapes.map((s, i) => (s === 'money' ? i : -1)).filter((i) => i !== -1);
  const lowCardColumns = shapes.map((s, i) => (s === 'lowCardinalityText' ? i : -1)).filter((i) => i !== -1);
  const highCardColumns = shapes.map((s, i) => (s === 'highCardinalityText' ? i : -1)).filter((i) => i !== -1);

  const mapping: ColumnRole[] = new Array(columnCount).fill('ignore');
  for (let col = 0; col < columnCount; col++) {
    if (hasHeaderRow && headerMatches[col]) mapping[col] = headerMatches[col] as ColumnRole;
  }

  const claim = (index: number, role: ColumnRole) => {
    if (index >= 0 && mapping[index] === 'ignore') mapping[index] = role;
  };
  shapes.forEach((shape, col) => {
    if (mapping[col] !== 'ignore') return; // already resolved via header
    if (shape === 'date') claim(col, 'date');
    else if (shape === 'taxCodeLiteral') claim(col, 'taxCode');
    else if (shape === 'rate') claim(col, 'exchangeRate');
    else if (shape === 'currencyCode') claim(col, 'currency');
    else if (shape === 'percentOrTaxLabel') claim(col, 'taxLabel');
  });

  // Exactly one money column is unambiguously the amount to post; exactly two reads as a
  // (foreign total, final total) pair in left-to-right order; three or more is too ambiguous to
  // guess (which is the tax? the subtotal? the total?) so those are left for manual mapping.
  if (moneyColumns.length === 1) claim(moneyColumns[0], 'amount');
  else if (moneyColumns.length === 2) {
    claim(moneyColumns[0], 'foreignAmount');
    claim(moneyColumns[1], 'amount');
  }

  if (lowCardColumns.length > 0) claim(lowCardColumns[0], 'category');
  if (lowCardColumns.length > 1) claim(lowCardColumns[1], 'paymentMethod');

  if (highCardColumns.length > 0) claim(highCardColumns[0], 'vendor');

  return { mapping, hasHeaderRow };
}
