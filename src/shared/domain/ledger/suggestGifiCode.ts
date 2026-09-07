import type { AccountType, GifiCode, GifiStatementType } from '../types';

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

function significantWords(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter((w) => w.length > 3);
}

// Treats "Rent" as matching "Rental", "Payable" as matching "Payables", etc. — a plain-typed
// account name rarely uses the exact same word form as the GIFI item's own wording, so exact-set
// overlap alone would miss most real matches. The length-4 floor on the shorter word keeps this
// from firing on short, coincidentally-shared prefixes.
function wordsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length >= 4 && longer.startsWith(shorter);
}

const BALANCE_SHEET_TYPES: AccountType[] = ['Asset', 'Liability', 'Equity'];

function statementTypeFor(accountType: AccountType): GifiStatementType {
  return BALANCE_SHEET_TYPES.includes(accountType) ? 'BalanceSheet' : 'IncomeStatement';
}

/**
 * Best-effort GIFI code suggestion from a new account's name, scored by shared words against each
 * candidate's own GIFI description — conservative on purpose, like matchAccountByName: only
 * returns a suggestion when exactly one candidate is the clear best match above a high bar, and
 * never guesses between close ties. A wrong GIFI mapping is a CRA filing accuracy problem, not a
 * cosmetic one, so the reviewer's own account-code-search combobox remains the fallback whenever
 * this comes back empty rather than this guessing wrong.
 */
export function suggestGifiCode(accountName: string, accountType: AccountType, gifiCodes: GifiCode[]): GifiCode | null {
  // A card named after its brand ("RBC Visa", "BMO Mastercard", "Amex") shares no word with the
  // GIFI wording "Credit card loans", so word overlap never finds it — and the nearest-sounding
  // line, 2620 "Amounts payable", is the wrong one. Named brands go straight to 2707.
  if (accountType === 'Liability' && /\b(visa|mastercard|master card|amex|american express|credit card)\b/i.test(accountName)) {
    const creditCard = gifiCodes.find((g) => g.code === '2707');
    if (creditCard) return creditCard;
  }
  // Bank and cash accounts are named after the bank or the box ("TD Chequing", "Petty Cash"),
  // never after the GIFI wording, so the same direct routing applies: money in a Canadian bank is
  // 1002 (1003 when the account is held in a foreign currency); coins, floats and cash boxes are
  // 1001.
  if (accountType === 'Asset') {
    const byCode = (code: string) => gifiCodes.find((g) => g.code === code) ?? null;
    if (/\b(petty cash|cash box|cash register|cash on hand|float|till)\b/i.test(accountName)) return byCode('1001');
    if (/\b(chequing|checking|savings|bank|deposit|current account|operating account)\b/i.test(accountName)) {
      return byCode(/\b(usd|us dollar|us\$|eur|euro|gbp|foreign)\b/i.test(accountName) ? '1003' : '1002');
    }
  }
  const needleWords = significantWords(accountName);
  if (needleWords.length === 0) return null;

  const statementType = statementTypeFor(accountType);
  const candidates = gifiCodes.filter((g) => g.statementType === statementType && !g.isCustom);

  let bestScore = 0;
  let bestMatches: GifiCode[] = [];
  for (const candidate of candidates) {
    const hayWords = significantWords(candidate.description);
    let overlap = 0;
    for (const w of needleWords) {
      if (hayWords.some((h) => wordsMatch(w, h))) overlap++;
    }
    if (overlap === 0) continue;
    // Score as a fraction of the SHORTER word set, so a short name ("Rent") matching a short
    // description ("Rent") scores fully, while one incidental shared word against a long
    // description doesn't dominate.
    const score = overlap / Math.min(needleWords.length, hayWords.length);
    if (score > bestScore) {
      bestScore = score;
      bestMatches = [candidate];
    } else if (score === bestScore) {
      bestMatches.push(candidate);
    }
  }

  if (bestScore < 0.5 || bestMatches.length !== 1) return null;
  return bestMatches[0];
}
