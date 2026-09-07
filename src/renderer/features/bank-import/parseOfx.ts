import type { ParseResult, ParsedTransaction } from './parseTransactions';

/**
 * OFX / QFX / QBO bank downloads.
 *
 * Every Canadian bank offers these beside CSV, and they are the better file: each transaction is
 * tagged (date, amount, payee, memo, bank id), so there is no column guessing and no date-format
 * guessing. The format is SGML-ish — tags are often unclosed and the header is plain key:value
 * lines — so this reads it with a tolerant scanner rather than an XML parser. QFX (Quicken) and
 * QBO (QuickBooks) are the same format with a different extension and one extra header tag.
 */
export function isOfxContent(text: string): boolean {
  const head = text.slice(0, 4000);
  return /<OFX>/i.test(head) || /^OFXHEADER:/im.test(head) || /<STMTTRN>/i.test(text);
}

function tagValue(block: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i').exec(block);
  if (!match) return null;
  const value = match[1].trim();
  return value.length > 0 ? value : null;
}

/** OFX dates are YYYYMMDD, optionally followed by HHMMSS.XXX[zone]; only the day matters here. */
function isoDate(raw: string | null): string | null {
  if (!raw) return null;
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(raw.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${mo}-${d}`;
}

function cents(raw: string | null): number | null {
  if (!raw) return null;
  // Some banks write "1,234.56" or use a comma decimal; both are read.
  const normalised = raw.replace(/\s/g, '').replace(/,(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const value = Number(normalised);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/** Bank downloads sometimes repeat the payee in the memo ("TIM HORTONS #123" / "TIM HORTONS #123
 * TORONTO ON"); the longer of the two carries the most, the shorter is dropped when contained. */
function describe(name: string | null, memo: string | null): string {
  const a = (name ?? '').trim();
  const b = (memo ?? '').trim();
  if (!a) return b;
  if (!b) return a;
  if (b.toUpperCase().includes(a.toUpperCase())) return b;
  if (a.toUpperCase().includes(b.toUpperCase())) return a;
  return `${a} — ${b}`;
}

export function parseOfx(text: string): ParseResult {
  const rows: ParsedTransaction[] = [];
  const skippedRows: ParseResult['skippedRows'] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  const seen = new Set<string>();
  blocks.forEach((rawBlock, index) => {
    const block = rawBlock.split(/<\/STMTTRN>/i)[0];
    const date = isoDate(tagValue(block, 'DTPOSTED')) ?? isoDate(tagValue(block, 'DTUSER'));
    const amountCents = cents(tagValue(block, 'TRNAMT'));
    const description = describe(tagValue(block, 'NAME') ?? tagValue(block, 'PAYEE'), tagValue(block, 'MEMO'));
    const fitId = tagValue(block, 'FITID');
    if (date === null || amountCents === null || amountCents === 0) {
      skippedRows.push({ sourceIndex: index, raw: block.replace(/\s+/g, ' ').trim().slice(0, 200), descriptionGuess: description, dateGuess: date, amountGuessCents: amountCents === null ? null : Math.abs(amountCents) });
      return;
    }
    // FITID is the bank's own id for the transaction: a file downloaded twice, or two overlapping
    // downloads pasted together, repeats it, and the repeat is the same transaction, not a second one.
    let key = fitId ? `fitid-${fitId}` : `ofx-${index}`;
    if (seen.has(key)) {
      if (fitId) return;
      key = `ofx-${index}-${rows.length}`;
    }
    seen.add(key);
    rows.push({ key, date, description: description || '(no description in file)', amountCents });
  });
  return { rows, skipped: skippedRows.length, skippedRows };
}

/** The account the file belongs to, when the bank included it — shown so a statement for the
 * wrong account is caught before a single line is posted. */
export function ofxAccountHint(text: string): string | null {
  const acct = tagValue(text, 'ACCTID');
  const type = tagValue(text, 'ACCTTYPE');
  const bank = tagValue(text, 'ORG') ?? tagValue(text, 'BANKID');
  if (!acct) return null;
  const masked = acct.length > 4 ? `…${acct.slice(-4)}` : acct;
  return [bank, type ? type.toLowerCase() : null, masked].filter(Boolean).join(' ');
}
