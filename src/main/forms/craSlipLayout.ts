import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { PAGE_HEIGHT, PAGE_WIDTH, formatMoney } from './pdfStyle';

/**
 * The drawing vocabulary CRA slips share — T4, T4A, T5, T5018 are all the same physical form:
 * a bordered slip with a title band, numbered boxes with small bilingual captions and a figure at
 * the right, a payer block and a recipient block, and two slips to a letter page (CRA's own
 * employee copies come two to a page). Each generator lays its boxes out on this grid so every
 * slip the app prints reads like the CRA original, box numbers where the tax preparer expects
 * them, and the numbers land where a person used to the real form will look for them.
 */
export const SLIP_MARGIN = 24;
export const SLIP_WIDTH = PAGE_WIDTH - SLIP_MARGIN * 2;
export const SLIP_HEIGHT = 356;
export const SLIP_GAP = PAGE_HEIGHT - SLIP_MARGIN * 2 - SLIP_HEIGHT * 2;

export const INK = rgb(0.1, 0.1, 0.1);
export const CAPTION = rgb(0.3, 0.3, 0.3);
export const RULE = rgb(0.45, 0.45, 0.45);
const SHADE = rgb(0.93, 0.93, 0.93);

/** Trims text to the width available (with an ellipsis) — a caption that wrapped would spill
 * into the box beneath, which is worse than a shortened caption. */
export function fitText(font: PDFFont, size: number, text: string, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

export interface SlipFonts {
  regular: PDFFont;
  bold: PDFFont;
}

export async function slipFonts(pdfDoc: PDFDocument): Promise<SlipFonts> {
  return { regular: await pdfDoc.embedFont(StandardFonts.Helvetica), bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold) };
}

/** Top edge (PDF y) of the slip at `index` (0 = upper, 1 = lower) on a page. */
export function slipTop(index: 0 | 1): number {
  return PAGE_HEIGHT - SLIP_MARGIN - index * (SLIP_HEIGHT + SLIP_GAP);
}

export interface SlipCanvas {
  page: PDFPage;
  fonts: SlipFonts;
  /** Left edge and top edge of this slip in PDF coordinates. */
  left: number;
  top: number;
}

/** Draws the slip frame and title band; returns the canvas the boxes are drawn on. */
export function beginSlip(page: PDFPage, fonts: SlipFonts, index: 0 | 1, title: string, titleFr: string, year: number, copyLabel: string): SlipCanvas {
  const top = slipTop(index);
  const left = SLIP_MARGIN;
  page.drawRectangle({ x: left, y: top - SLIP_HEIGHT, width: SLIP_WIDTH, height: SLIP_HEIGHT, borderColor: INK, borderWidth: 1 });
  // Title band
  page.drawRectangle({ x: left, y: top - 22, width: SLIP_WIDTH, height: 22, color: SHADE, borderColor: INK, borderWidth: 1 });
  page.drawText(title, { x: left + 6, y: top - 14, size: 9, font: fonts.bold, color: INK });
  const titleWidth = fonts.bold.widthOfTextAtSize(title, 9);
  page.drawText(fitText(fonts.regular, 7.5, titleFr, SLIP_WIDTH - 130 - titleWidth - 20), { x: left + 6 + titleWidth + 8, y: top - 14, size: 7.5, font: fonts.regular, color: CAPTION });
  const yearLabel = 'Year / Année';
  page.drawText(yearLabel, { x: left + SLIP_WIDTH - 118, y: top - 9, size: 5.5, font: fonts.regular, color: CAPTION });
  page.drawText(String(year), { x: left + SLIP_WIDTH - 118, y: top - 19, size: 10, font: fonts.bold, color: INK });
  page.drawText(copyLabel, { x: left + SLIP_WIDTH - 6 - fonts.regular.widthOfTextAtSize(copyLabel, 5.5), y: top - SLIP_HEIGHT + 5, size: 5.5, font: fonts.regular, color: CAPTION });
  return { page, fonts, left, top };
}

export interface BoxSpec {
  /** Offsets from the slip's left/top edges, and size, in points. */
  x: number;
  y: number;
  w: number;
  h?: number;
  /** The CRA box number printed small at the top-left, e.g. "14" or "048". Omit for a plain cell. */
  number?: string;
  label: string;
  labelFr?: string;
  /** Figure shown at the bottom right. Blank when null. */
  value?: string | null;
  /** Free text at the bottom left (names, addresses, identifiers) — one line per entry. */
  lines?: string[];
  valueSize?: number;
  shaded?: boolean;
}

/** A numbered CRA box: caption in the top-left, figure bottom-right. */
export function drawBox(canvas: SlipCanvas, spec: BoxSpec): void {
  const { page, fonts, left, top } = canvas;
  const h = spec.h ?? 30;
  const x = left + spec.x;
  const y = top - spec.y - h;
  page.drawRectangle({ x, y, width: spec.w, height: h, borderColor: RULE, borderWidth: 0.6, color: spec.shaded ? SHADE : undefined });
  let cx = x + 3;
  if (spec.number) {
    page.drawText(spec.number, { x: cx, y: y + h - 8, size: 6, font: fonts.bold, color: INK });
    cx += fonts.bold.widthOfTextAtSize(spec.number, 6) + 3;
  }
  page.drawText(fitText(fonts.regular, 5.2, spec.label, spec.w - (cx - x) - 3), { x: cx, y: y + h - 8, size: 5.2, font: fonts.regular, color: CAPTION });
  if (spec.labelFr) page.drawText(fitText(fonts.regular, 4.8, spec.labelFr, spec.w - 6), { x: x + 3, y: y + h - 14.5, size: 4.8, font: fonts.regular, color: CAPTION });
  if (spec.value) {
    const size = spec.valueSize ?? 8.5;
    page.drawText(spec.value, { x: x + spec.w - 4 - fonts.bold.widthOfTextAtSize(spec.value, size), y: y + 4, size, font: fonts.bold, color: INK });
  }
  if (spec.lines && spec.lines.length > 0) {
    let ly = Math.max(y + 4, y + h - (spec.labelFr ? 24 : 17));
    for (const line of spec.lines) {
      if (ly < y + 3) break;
      page.drawText(fitText(fonts.regular, 7.5, line, spec.w - 8), { x: x + 4, y: ly, size: 7.5, font: fonts.regular, color: INK });
      ly -= 9;
    }
  }
}

/** Money for a slip box: blank when zero so an unused box reads as unused, like the printed form. */
export function boxMoney(cents: number, alwaysShow = false): string | null {
  if (cents === 0 && !alwaysShow) return null;
  return formatMoney(cents);
}

/** 123 456 789 — the spacing CRA prints a SIN with. */
export function formatSinForSlip(sin: string | null): string {
  if (!sin) return '';
  const digits = sin.replace(/\D/g, '');
  return digits.length === 9 ? `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}` : sin;
}

/** The "other information" strip at the foot of T4/T4A: pairs of a code box and an amount box. */
export function drawOtherInformation(canvas: SlipCanvas, y: number, entries: { code: string; cents: number }[], slots = 6): void {
  const usable = SLIP_WIDTH - 12;
  const pairW = usable / slots;
  const codeW = 26;
  for (let i = 0; i < slots; i++) {
    const entry = entries[i];
    const x = 6 + i * pairW;
    drawBox(canvas, { x, y, w: codeW, h: 26, label: 'Box – Case', value: entry ? entry.code : null, valueSize: 7 });
    drawBox(canvas, { x: x + codeW, y, w: pairW - codeW - 2, h: 26, label: 'Amount – Montant', value: entry ? formatMoney(entry.cents) : null });
  }
  canvas.page.drawText('Other information (see the back) / Autres renseignements (voir au verso)', { x: canvas.left + 6, y: canvas.top - y + 3, size: 5.2, font: canvas.fonts.regular, color: CAPTION });
}

/** The small print CRA puts under a working copy — this app's slips are working copies. */
export function drawSlipFooter(canvas: SlipCanvas, text: string): void {
  canvas.page.drawText(fitText(canvas.fonts.regular, 5.2, text, SLIP_WIDTH - 220), { x: canvas.left + 6, y: canvas.top - SLIP_HEIGHT + 5, size: 5.2, font: canvas.fonts.regular, color: CAPTION });
}
