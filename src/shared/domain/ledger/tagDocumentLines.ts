/**
 * Class / location on a document line.
 *
 * Invoices, bills and sales receipts post their lines to the journal; the tag chosen on a
 * document line (a class such as "Bookkeeping" or "Tax", a location such as "Toronto") has to
 * land on the journal line that carries that revenue or expense, or the P&L by tag report never
 * sees it. The journal lines are built from the document lines in order, with tax and
 * receivable/payable lines interleaved, so each document line is matched to the next unclaimed
 * journal line with the same account and the same pre-tax amount. That is exact for every line the
 * builders produce; anything that cannot be matched is left untagged rather than guessed.
 */
export interface PostedJournalLineForTagging {
  id: number;
  accountId: number;
  debitCents: number;
  creditCents: number;
}

export interface DocumentLineForTagging {
  accountId: number;
  baseCents: number;
  tagIds: number[];
}

export function tagDocumentLines(journalLines: PostedJournalLineForTagging[], documentLines: DocumentLineForTagging[]): Array<{ journalEntryLineId: number; tagId: number }> {
  const claimed = new Set<number>();
  const out: Array<{ journalEntryLineId: number; tagId: number }> = [];
  for (const doc of documentLines) {
    if (!doc.tagIds || doc.tagIds.length === 0) continue;
    const match = journalLines.find((line) => !claimed.has(line.id) && line.accountId === doc.accountId && Math.max(line.debitCents, line.creditCents) === doc.baseCents);
    if (!match) continue;
    claimed.add(match.id);
    for (const tagId of new Set(doc.tagIds)) out.push({ journalEntryLineId: match.id, tagId });
  }
  return out;
}

/** The reverse of tagDocumentLines: reads a posted document's tags back onto its own lines, by the
 * same account-and-amount match, so that opening a saved invoice for editing and saving it again
 * does not silently strip its class and location tags. Two lines with the same account and amount
 * are indistinguishable in the journal, so their tags may swap places — which changes nothing any
 * tag report can show, since the account and amount carrying the tag are the same. */
export function documentLineTags(
  journalLines: Array<PostedJournalLineForTagging & { tagIds: number[] }>,
  documentLines: Array<{ accountId: number; baseCents: number }>,
): number[][] {
  const claimed = new Set<number>();
  return documentLines.map((doc) => {
    const match = journalLines.find((line) => !claimed.has(line.id) && line.accountId === doc.accountId && Math.max(line.debitCents, line.creditCents) === doc.baseCents);
    if (!match) return [];
    claimed.add(match.id);
    return [...new Set(match.tagIds)];
  });
}
