// Words too generic to be a useful match pattern on their own — matching "PAYMENT" or "PURCHASE"
// would fire on nearly every transaction, not just the vendor the rule is meant to remember.
// Banking-channel words (ONLINE, BANKING, MOBILE, ...) are included here for the same reason:
// "Online Transfer to Savings" and "Online Banking Payment - Bell Canada" share the words ONLINE
// and BANKING, so without filtering them out those two generic words alone would eat up the whole
// pattern budget below and never reach "SAVINGS" or "BELL CANADA" — the words that actually
// distinguish one transaction type from another.
const NOISE_WORDS = new Set([
  'POS', 'PURCHASE', 'DEBIT', 'CREDIT', 'PAYMENT', 'WWW', 'INTERAC', 'ETRANSFER', 'TRANSFER',
  'THE', 'TO', 'FROM', 'FOR', 'AND', 'INC', 'LTD', 'CO', 'CORP', 'PREAUTH', 'RECURRING',
  'ONLINE', 'BANKING', 'BANK', 'MOBILE', 'INTERNET', 'EFT', 'WIRE', 'ACH', 'PAD', 'BILL',
  'AUTOPAY', 'MISC', 'DEPOSIT', 'WITHDRAWAL', 'FUNDS', 'AT', 'ON', 'OF', 'NO', 'REF', 'NUM',
]);

function isNoiseToken(token: string): boolean {
  if (/^\d+$/.test(token)) return true; // pure digits — a reference/transaction number, not a vendor name
  if (token.length <= 1) return true;
  return NOISE_WORDS.has(token);
}

/**
 * Turns a free-text bank/transaction description into a short, reusable CategoryRule pattern —
 * e.g. "SHELL #4471 POS PURCHASE 8842" -> "SHELL". Strips reference numbers and generic banking
 * noise words, keeping the first couple of genuinely distinctive words (matching the style of the
 * hand-authored seed rules: 'HYDRO', 'BELL CANADA', 'SHELL'). Returns null when nothing
 * distinctive is left, rather than manufacture a pattern so generic it would misfire on unrelated
 * transactions later. Deliberately still caps at two words, not more — a vendor pattern like "TIM
 * HORTONS" needs to stay generic enough to match every location, and a third word left over after
 * noise-filtering is often incidental (a city, a branch number) rather than more distinctive. */
export function deriveRulePattern(description: string): string | null {
  const tokens = description
    .toUpperCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^A-Z0-9&]/g, ''))
    .filter((t) => t.length > 0);

  const significant = tokens.filter((t) => !isNoiseToken(t));
  if (significant.length === 0) return null;
  return significant.slice(0, 2).join(' ');
}
