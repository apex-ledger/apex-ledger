export interface ReceiptFieldGuesses {
  vendorNameGuess: string | null;
  dateGuess: string | null;
  amountCentsGuess: number | null;
  taxAmountCentsGuess: number | null;
  /** 'USD' if the receipt looks American (explicit "USD"/"US$" marker, or a US state name/abbreviation
   * next to an address) — null otherwise, meaning "assume CAD, don't guess". Only USD is supported
   * as a foreign currency elsewhere in the app (see ForeignCurrencyCode), so that's the only guess
   * worth making here. */
  currencyGuess: 'USD' | null;
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/** Pulls best-effort guesses out of raw OCR text from a receipt photo. Heuristic, not exact —
 * callers should keep every field editable since these are just a starting point. */
export function parseReceiptText(text: string): ReceiptFieldGuesses {
  return {
    vendorNameGuess: guessVendorName(text),
    dateGuess: guessDate(text),
    amountCentsGuess: guessTotalAmountCents(text),
    taxAmountCentsGuess: guessTaxAmountCents(text),
    currencyGuess: guessCurrency(text),
  };
}

function guessCurrency(text: string): 'USD' | null {
  // Deliberately conservative — only explicit USD markers, not state abbreviations or city names,
  // since those are common English words/tokens too and would false-positive constantly.
  if (/\bUSD\b/i.test(text) || /US\s*\$/i.test(text) || /\bUS\s+DOLLARS?\b/i.test(text) || /\bUNITED\s+STATES\b/i.test(text)) {
    return 'USD';
  }
  return null;
}

function guessVendorName(text: string): string | null {
  // Receipts almost always put the store/business name on the first printed line — but a scanned
  // logo also sheds debris ("J", "=——WHOLESALE"): a line needs a few real letters to count, and
  // the symbols OCR hangs on the edges of a word are trimmed off.
  const lines = text
    .split('\n')
    .map((l) => l.trim().replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9.!')]+$/g, '').trim())
    .filter((l) => (l.match(/[A-Za-z]/g) ?? []).length >= 3 && !/^\d+$/.test(l));
  const first = lines[0];
  if (!first || first.length > 60) return null;
  return first;
}

function parseDollarAmount(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value <= 0 || value > 1_000_000) return null;
  return Math.round(value * 100);
}

const DOLLAR_PATTERN = /\$?\s*(\d{1,3}(?:[,.]\d{3})*[.,]\d{2})(?!\s*%)\b/;

function amountOn(line: string): number | null {
  const match = line.match(DOLLAR_PATTERN);
  return match ? parseDollarAmount(match[1]) : null;
}

/** The last dollar amount on a line — on "SUBTOTAL 131.78" and "Interac 137.50" the figure sits
 * at the right; on a line that also carries a code or quantity the amount is still the last one. */
function lastAmountOn(line: string): number | null {
  const matches = Array.from(line.matchAll(new RegExp(DOLLAR_PATTERN.source, 'g')));
  const last = matches[matches.length - 1];
  return last ? parseDollarAmount(last[1]) : null;
}

/** A "total" line that is the amount owed — not the subtotal, the tax total, the item count or
 * the discount total, which receipts label with the same word. */
function isGrandTotalLine(line: string): boolean {
  return /\btotal\b/i.test(line) && !/sub\s*-?total|total\s+(tax|number|items?|discount|savings|qty|quantity)|tax\s+total/i.test(line);
}

const TENDER_PATTERN = /\b(interac|debit|visa|mastercard|master\s*card|amex|american express|discover|cash|credit|e-?transfer|paid|payment|tendered|charge[d]?)\b/i;

/**
 * The amount owed, tried in order of how reliable each clue is:
 *   1. a TOTAL line (not SUBTOTAL / TOTAL TAX / TOTAL ITEMS) that carries a readable figure;
 *   2. an "AMOUNT: $137.50" line — the card terminal's own figure;
 *   3. a tender line ("Interac 137.50", "VISA 79.09");
 *   4. SUBTOTAL + TAX, when both are readable — the arithmetic is exact;
 *   5. the largest figure on the receipt.
 * The order matters on till receipts that print the total in reverse video (white on black):
 * OCR reads nothing there, so steps 2–4 are what actually find the total on such receipts.
 */
function guessTotalAmountCents(text: string): number | null {
  const lines = text.split('\n');

  // 1. A TOTAL line whose figure is printed normally. A total printed in reverse video (white on
  //    black — Costco, many till printers) comes through OCR as junk like "xxx TOTAL (9.09 ]" or
  //    "TOTAL [____135{.50 |": brackets, underscores and braces around the figure give it away, and
  //    such a figure is not trusted.
  let unreliableTotal: number | null = null;
  for (const line of lines) {
    if (!isGrandTotalLine(line)) continue;
    const cents = lastAmountOn(line);
    if (cents === null) continue;
    if (/[[\]{}|_]/.test(line)) {
      if (unreliableTotal === null) unreliableTotal = cents;
      continue;
    }
    return cents;
  }

  // 2. The card terminal's own "AMOUNT: $137.50" line.
  const amountLine = lines.find((l) => /\bamount\b\s*[:=]?\s*\$?\s*\d/i.test(l) && !/\btax\b/i.test(l));
  if (amountLine) {
    const cents = lastAmountOn(amountLine);
    if (cents !== null) return cents;
  }

  // 3. SUBTOTAL + TAX when both are readable — exact arithmetic.
  const subtotalLine = lines.find((l) => /sub\s*-?total/i.test(l));
  const subtotal = subtotalLine ? lastAmountOn(subtotalLine) : null;
  const tax = guessTaxAmountCents(text);
  if (subtotal !== null && tax !== null) return subtotal + tax;

  // 4. A card tender line ("Interac 137.50", "VISA 79.09"). Cash is skipped: the cash line is
  //    what was handed over, not what was owed.
  for (const line of lines) {
    if (!TENDER_PATTERN.test(line) || /\b(cash|change)\b/i.test(line)) continue;
    const cents = lastAmountOn(line);
    if (cents !== null) return cents;
  }

  if (unreliableTotal !== null) return unreliableTotal;

  // 5. The largest figure on the receipt.
  let largest: number | null = null;
  for (const line of lines) {
    const cents = amountOn(line);
    if (cents !== null && (largest === null || cents > largest)) largest = cents;
  }
  return largest;
}

/** The tax: a line naming HST/GST/PST/QST/tax with a figure on it — skipping lines where the tax
 * word is part of a registration number ("HST/GST #121476329RT") or a rate ("HST 13%") with no
 * amount, and preferring "TOTAL TAX" when the receipt prints one. */
function guessTaxAmountCents(text: string): number | null {
  const lines = text.split('\n');
  const taxLines = lines.filter((l) => /\b(hst|gst|pst|qst|tax|tvq|tps)\b/i.test(l) && !/#\s*\d|registration|reg\.?\s*no/i.test(l));
  const totalTax = taxLines.find((l) => /total\s+tax|tax\s+total/i.test(l));
  const candidates = totalTax ? [totalTax, ...taxLines] : taxLines;
  for (const line of candidates) {
    const cents = lastAmountOn(line);
    if (cents !== null) return cents;
  }
  return null;
}

function guessDate(text: string): string | null {
  // YYYY-MM-DD or YYYY/MM/DD
  let match = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (match) return normalizeDate(match[1], match[2], match[3]);

  // MM/DD/YYYY or DD/MM/YYYY (assume MM/DD, North American receipts)
  match = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);
  if (match) return normalizeDate(match[3], match[1], match[2]);

  // "Jan 5, 2026" / "January 5 2026"
  match = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})\b/i);
  if (match) return normalizeDate(match[3], MONTHS[match[1].toLowerCase()], match[2]);

  return null;
}

function normalizeDate(year: string, month: string, day: string): string | null {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  // Reject nonsense dates (e.g. mis-OCR'd digits) rather than silently pre-filling garbage.
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return iso;
}
