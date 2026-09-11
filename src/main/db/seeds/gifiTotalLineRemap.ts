import type { AppDb } from '../schema';

/** Moves accounts off CRA total lines that older charts mapped them to.
 *
 * Until September 2026 every template put "Cost of Goods Sold" on GIFI 8518. CRA derives 8518 from
 * items 8300 to 8517, so filing software recomputes or rejects an amount mapped straight to it, and
 * the GIFI export now flags such an account. The templates were corrected for new companies; this
 * corrects the companies that already exist, on open, the same way the shipped GIFI codes and the
 * opening-balance accounts are backfilled. 8320 "Purchases/cost of materials" is the detail line
 * every cost-of-sales account belongs on unless the accountant chooses a narrower one, which they
 * remain free to do afterwards: this only ever touches accounts still sitting on the total line.
 * Must run after seedGifiCodes, because accounts.gifi_code is a foreign key to gifi_codes. */
export const GIFI_TOTAL_LINE_REMAP: Record<string, string> = { '8518': '8320' };

export async function remapGifiTotalLines(db: AppDb): Promise<number> {
  let moved = 0;
  for (const [from, to] of Object.entries(GIFI_TOTAL_LINE_REMAP)) {
    const target = await db.selectFrom('gifiCodes').select('code').where('code', '=', to).executeTakeFirst();
    if (!target) continue; // the shipped list has it; a stripped custom list would fail the FK, so leave the account alone
    const result = await db.updateTable('accounts').set({ gifiCode: to }).where('gifiCode', '=', from).executeTakeFirst();
    moved += Number(result.numUpdatedRows ?? 0);
  }
  return moved;
}
