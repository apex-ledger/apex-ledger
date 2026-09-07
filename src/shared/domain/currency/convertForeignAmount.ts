/** Converts a foreign-currency amount (e.g. USD cents) to CAD cents at the given rate, rounding to
 * the nearest cent — the one calculation that turns a client's USD source document into the CAD
 * figure actually posted to the ledger. */
export function convertForeignAmountToCadCents(foreignAmountCents: number, exchangeRate: number): number {
  return Math.round(foreignAmountCents * exchangeRate);
}
