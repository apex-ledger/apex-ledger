import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import type { CompanyInfo, CpaNote } from '@shared/domain/types';
import type { BalanceSheetResult } from '@shared/domain/ledger/balanceSheet';
import type { IncomeStatementResult } from '@shared/domain/ledger/incomeStatement';
import type { TrialBalanceResult } from '@shared/domain/ledger/trialBalance';
import type { Section } from '@shared/domain/ledger/sectionHelpers';
import { BORDER, BRAND_900, CONTENT_WIDTH, GOLD_400, MARGIN, PAGE_HEIGHT, PAGE_WIDTH, ROW_STRIPE, TEXT_DARK, TEXT_MUTED, companyAddressLines, formatMoney, wrapText } from './pdfStyle';

export interface CpaReviewPackageData {
  company: CompanyInfo;
  periodStart: string;
  periodEnd: string;
  coverMessage: string | null;
  notes: CpaNote[];
  balanceSheet: BalanceSheetResult | null;
  incomeStatement: IncomeStatementResult | null;
  trialBalance: TrialBalanceResult | null;
}

/**
 * One PDF to hand a CPA for review: a cover page with the bookkeeper's notes and questions, then
 * whichever statements were selected. The point is that the CPA gets the numbers AND the context
 * behind them together — "this deposit is a shareholder loan, not revenue" arriving in the same
 * document as the balance sheet it affects, rather than in a separate email thread.
 *
 * Every figure is computed from posted entries by the same report code the on-screen statements
 * use, so what the CPA reviews is exactly what the app shows.
 */
export async function generateCpaReviewPdf(data: CpaReviewPackageData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  function newPage(heading: string): { page: PDFPage; y: number } {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawText(data.company.legalName, { x: MARGIN, y: PAGE_HEIGHT - MARGIN - 4, size: 13, font: boldFont, color: BRAND_900 });
    page.drawText(heading, { x: MARGIN, y: PAGE_HEIGHT - MARGIN - 22, size: 10, font, color: TEXT_MUTED });
    page.drawLine({
      start: { x: MARGIN, y: PAGE_HEIGHT - MARGIN - 32 },
      end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - MARGIN - 32 },
      thickness: 1.5,
      color: GOLD_400,
    });
    return { page, y: PAGE_HEIGHT - MARGIN - 52 };
  }

  /** Draws a label/amount row, starting a fresh page when the current one runs out. */
  function row(state: { page: PDFPage; y: number }, heading: string, label: string, amountCents: number | null, opts: { bold?: boolean; indent?: number; stripe?: boolean } = {}) {
    if (state.y < MARGIN + 40) {
      const next = newPage(`${heading} (continued)`);
      state.page = next.page;
      state.y = next.y;
    }
    const f = opts.bold ? boldFont : font;
    if (opts.stripe) {
      state.page.drawRectangle({ x: MARGIN, y: state.y - 4, width: CONTENT_WIDTH, height: 14, color: ROW_STRIPE });
    }
    state.page.drawText(label, { x: MARGIN + (opts.indent ?? 0), y: state.y, size: 9, font: f, color: TEXT_DARK });
    if (amountCents !== null) {
      const text = formatMoney(amountCents);
      state.page.drawText(text, { x: PAGE_WIDTH - MARGIN - f.widthOfTextAtSize(text, 9), y: state.y, size: 9, font: f, color: TEXT_DARK });
    }
    state.y -= 15;
  }

  function drawSection(state: { page: PDFPage; y: number }, heading: string, section: Section) {
    row(state, heading, section.label, null, { bold: true });
    section.lines.forEach((line, i) => {
      row(state, heading, line.account.name, line.amountCents, { indent: 12, stripe: i % 2 === 1 });
    });
    row(state, heading, `Total ${section.label}`, section.totalCents, { bold: true, indent: 12 });
    state.y -= 8;
  }

  // ---- Cover page: the notes are the reason this package exists, so they lead. ----
  {
    const heading = 'Notes for CPA Review';
    const state = newPage(heading);
    for (const line of companyAddressLines(data.company)) {
      state.page.drawText(line, { x: MARGIN, y: state.y, size: 9, font, color: TEXT_MUTED });
      state.y -= 12;
    }
    state.page.drawText(`Period under review: ${data.periodStart} to ${data.periodEnd}`, { x: MARGIN, y: state.y, size: 9, font: boldFont, color: TEXT_DARK });
    state.y -= 20;

    if (data.coverMessage) {
      for (const line of wrapText(data.coverMessage, font, 10, CONTENT_WIDTH)) {
        row(state, heading, line, null);
      }
      state.y -= 10;
    }

    if (data.notes.length === 0) {
      row(state, heading, 'No notes recorded for this period.', null, { indent: 0 });
    } else {
      for (const [i, note] of data.notes.entries()) {
        if (state.y < MARGIN + 90) {
          const next = newPage(`${heading} (continued)`);
          state.page = next.page;
          state.y = next.y;
        }
        const status = note.status === 'open' ? 'NEEDS REVIEW' : 'RESOLVED';
        state.page.drawText(`${i + 1}. ${note.subject}`, { x: MARGIN, y: state.y, size: 10, font: boldFont, color: BRAND_900 });
        const statusWidth = font.widthOfTextAtSize(status, 8);
        state.page.drawText(status, { x: PAGE_WIDTH - MARGIN - statusWidth, y: state.y, size: 8, font: boldFont, color: note.status === 'open' ? GOLD_400 : TEXT_MUTED });
        state.y -= 13;
        state.page.drawText(note.noteDate, { x: MARGIN, y: state.y, size: 8, font, color: TEXT_MUTED });
        state.y -= 13;
        for (const line of wrapText(note.body, font, 9, CONTENT_WIDTH - 12)) {
          row(state, heading, line, null, { indent: 12 });
        }
        if (note.cpaResponse) {
          row(state, heading, 'CPA response:', null, { indent: 12, bold: true });
          for (const line of wrapText(note.cpaResponse, font, 9, CONTENT_WIDTH - 24)) {
            row(state, heading, line, null, { indent: 24 });
          }
        }
        state.y -= 6;
        state.page.drawLine({ start: { x: MARGIN, y: state.y }, end: { x: PAGE_WIDTH - MARGIN, y: state.y }, thickness: 0.5, color: BORDER });
        state.y -= 14;
      }
    }
  }

  if (data.balanceSheet) {
    const heading = `Balance Sheet — as at ${data.balanceSheet.asOfDate}`;
    const state = newPage(heading);
    drawSection(state, heading, data.balanceSheet.assets);
    drawSection(state, heading, data.balanceSheet.liabilities);
    drawSection(state, heading, data.balanceSheet.equity);
    row(state, heading, 'Total Liabilities and Equity', data.balanceSheet.totalLiabilitiesAndEquityCents, { bold: true });
    if (!data.balanceSheet.isBalanced) {
      row(state, heading, 'NOTE: assets do not equal liabilities plus equity — investigate before filing.', null, { bold: true });
    }
  }

  if (data.incomeStatement) {
    const heading = `Income Statement — ${data.periodStart} to ${data.periodEnd}`;
    const state = newPage(heading);
    drawSection(state, heading, data.incomeStatement.revenue);
    drawSection(state, heading, data.incomeStatement.expenses);
    row(state, heading, 'Net Income', data.incomeStatement.netIncomeCents, { bold: true });
  }

  if (data.trialBalance) {
    const heading = `Trial Balance — as at ${data.trialBalance.asOfDate}`;
    const state = newPage(heading);
    for (const [i, line] of data.trialBalance.rows.entries()) {
      const label = line.account.name;
      // Credits shown negative so a single money column still reads unambiguously in the PDF.
      const amount = line.debitCents > 0 ? line.debitCents : -line.creditCents;
      row(state, heading, label, amount, { stripe: i % 2 === 1 });
    }
    row(state, heading, 'Total Debits', data.trialBalance.totalDebitCents, { bold: true });
    row(state, heading, 'Total Credits', data.trialBalance.totalCreditCents, { bold: true });
  }

  // Every page gets the same footer disclaimer — this is a working package for a CPA, not a
  // compiled or audited financial statement, and it should never be mistaken for one.
  const pages = pdfDoc.getPages();
  pages.forEach((page, i) => {
    const footer = `Prepared for CPA review — internal working document, not a compiled or audited financial statement.  Page ${i + 1} of ${pages.length}`;
    page.drawText(footer, { x: MARGIN, y: MARGIN - 18, size: 7, font, color: TEXT_MUTED });
  });

  return pdfDoc.save();
}
