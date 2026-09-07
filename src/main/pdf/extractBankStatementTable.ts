import fs from 'node:fs';
import {
  findStatementBalances,
  findStatementYear,
  fillInTransactionYears,
  reconstructPageLines,
  stripLeadingHeaderLine,
  truncateAfterClosingBalance,
  truncateBeforeHeader,
  type PositionedItem,
  type StatementBalances,
} from './bankStatementTableReconstruction';

export interface BankStatementExtraction extends StatementBalances {
  text: string;
}

/**
 * Extracts a bank statement PDF's transaction table as tab-delimited text — one line per row,
 * columns in the order the statement itself uses (Date/Description/Debit/Credit/Balance or
 * equivalent) — plus, when found, the statement's own printed Opening and Closing balance (for a
 * reconciliation check before posting: opening + net of imported rows should equal closing). The
 * actual row/column reconstruction from character positions lives in
 * bankStatementTableReconstruction.ts (pure, unit-tested); this module just drives pdfjs-dist page
 * by page and hands each page's positioned text items to it. Returns null if the PDF parses
 * cleanly but yields no usable text layer at all (a scanned/photographed statement) — that case
 * isn't handled here, since OCR word-position reconstruction is far less reliable and unverified
 * for tabular data. A genuine failure (a corrupt file, pdfjs-dist itself throwing) is deliberately
 * NOT caught here and propagates to the caller — swallowing it into the same null return as "no
 * text layer" would misreport a real bug as an expected, common case, making it undiagnosable from
 * the error the user actually sees (the IPC layer's toResult() already turns a thrown error into a
 * proper { ok: false, error } result with the real message, so there's nothing this module needs
 * to do to surface it correctly). */
export async function extractBankStatementTable(pdfPath: string): Promise<BankStatementExtraction | null> {
  const bytes = new Uint8Array(fs.readFileSync(pdfPath));
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjsLib.getDocument({ data: bytes, useSystemFonts: false, disableFontFace: true });
  try {
    const doc = await loadingTask.promise;
    const lines: string[] = [];
    // Kept separately from `lines` (which has each page's preamble trimmed away below) because the
    // year reference this statement needs (see fillInTransactionYears) lives in the very preamble
    // being trimmed — RBC's "Closing balance on November 14, 2025" line is part of the Account
    // Summary section, printed BEFORE the Date/Description/... table header, not inside the table
    // itself (the table's own closing line just says "Closing balance", no date attached).
    const allRawLines: string[] = [];

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const textContent = await page.getTextContent();

      const items: PositionedItem[] = textContent.items
        .filter((item): item is typeof item & { str: string; transform: number[]; width: number } => 'str' in item && item.str.trim().length > 0)
        .map((item) => ({ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width }));

      const rawPageLines = reconstructPageLines(items);
      allRawLines.push(...rawPageLines);

      // Each page gets its own preamble trimmed — a "continued" page repeats a mini letterhead
      // block (page number, account number, mailing period) and its own copy of the column header
      // above that page's share of the table, same as page 1's full letterhead does above the
      // table's true start (see truncateBeforeHeader's own doc comment). Only the very first page
      // keeps its header line; every later page's repeated header is dropped rather than surviving
      // into the middle of the combined table as a bogus, unparseable data row (mirrors why
      // bankImportReadPdfFile does the same across multiple whole FILES, not just pages).
      const pageLines = truncateBeforeHeader(rawPageLines);
      lines.push(...(pageNum === 1 ? pageLines : stripLeadingHeaderLine(pageLines)));
    }

    // Drops everything after the table's own final Closing Balance line — RBC (and others) append
    // cancelled-cheque image captions, fee summaries, and page footers after the real table ends,
    // none of which is transaction data (see truncateAfterClosingBalance's own doc comment for why
    // "last occurrence" matters here, not "first").
    const truncatedLines = truncateAfterClosingBalance(lines);
    // Real bank statements print each transaction's date as day+month only ("15 Oct") — the year
    // is implied by the statement period, so it's filled in here from the statement's own Closing
    // Balance line before this text ever reaches the generic date parser (see
    // fillInTransactionYears's own doc comment for why: left alone, "15 Oct" parses as an arbitrary
    // placeholder year, silently misdating every transaction on the statement).
    const yearFilledLines = fillInTransactionYears(truncatedLines, findStatementYear(allRawLines));
    const text = yearFilledLines.join('\n');
    // A real text layer produces a fair amount of text — a near-empty result means this PDF had
    // no meaningful text layer at all (a scanned image), not just a short statement.
    if (text.length < 40) return null;
    return { text, ...findStatementBalances(truncatedLines) };
  } finally {
    await loadingTask.destroy();
  }
}
