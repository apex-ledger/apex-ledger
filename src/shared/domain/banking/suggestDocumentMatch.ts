/**
 * Bank-feed matching: which open invoice or bill does this statement line settle?
 *
 * QuickBooks' "match" tab does this on import; here it runs while the rows are being enriched
 * so a deposit of exactly $565.00 from a customer with an open $565.00 invoice arrives already
 * matched, and the bookkeeper only confirms. The rules are deliberately strict — a wrong match
 * closes the wrong invoice, which is worse than no match:
 *   - the amount must equal the document's outstanding balance to the cent;
 *   - the statement date must fall within a window around the document (7 days before its date
 *     to 90 days after) — a payment cannot precede the invoice by much, and stale documents are
 *     not auto-closed;
 *   - if more than one document fits, the counterparty's name in the description decides; if
 *     that still leaves more than one, nothing is suggested.
 */
export interface OpenDocumentForMatch {
  id: number;
  /** Invoice or bill date, YYYY-MM-DD. */
  date: string;
  balanceDueCents: number;
  /** Customer or vendor display name, for the description check. */
  partyName: string;
}

export interface DocumentMatchSuggestion {
  kind: 'invoice' | 'bill';
  id: number;
  /** 'exact' — one document fit on amount and date; 'named' — several fit, the name decided. */
  confidence: 'exact' | 'named';
}

const DAYS_BEFORE = 7;
const DAYS_AFTER = 90;

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

function nameTokens(name: string): string[] {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !['THE', 'AND', 'INC', 'LTD', 'LLC', 'CORP', 'GROUP', 'CO'].includes(word));
}

function descriptionNamesParty(description: string, partyName: string): boolean {
  const desc = description.toUpperCase();
  const tokens = nameTokens(partyName);
  if (tokens.length === 0) return false;
  return tokens.some((token) => desc.includes(token));
}

export function suggestDocumentMatch(
  line: { date: string; amountCents: number; description: string; isExpense: boolean },
  openInvoices: OpenDocumentForMatch[],
  openBills: OpenDocumentForMatch[],
): DocumentMatchSuggestion | null {
  const amount = Math.abs(line.amountCents);
  if (amount <= 0) return null;
  const kind: DocumentMatchSuggestion['kind'] = line.isExpense ? 'bill' : 'invoice';
  const candidates = (line.isExpense ? openBills : openInvoices).filter((doc) => {
    if (doc.balanceDueCents !== amount) return false;
    const offset = daysBetween(doc.date, line.date);
    return offset >= -DAYS_BEFORE && offset <= DAYS_AFTER;
  });
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return { kind, id: candidates[0].id, confidence: 'exact' };
  const named = candidates.filter((doc) => descriptionNamesParty(line.description, doc.partyName));
  if (named.length === 1) return { kind, id: named[0].id, confidence: 'named' };
  return null;
}
