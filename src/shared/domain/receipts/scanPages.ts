/**
 * Which scanned sides to keep. The document scanner reads both sides of every sheet, so a
 * receipt loaded either way up still comes through — at the cost of a blank (or bleed-through)
 * back for every front. Each side is measured as the fraction of its pixels that are dark
 * (real print); the blank sides are dropped.
 *
 * Thresholds: printing on a receipt covers a few percent of the page; a blank back with the
 * front showing through faintly scores well under a fifth of that. Anything below the absolute
 * floor is paper texture. If nothing reaches the floor (a wholly faded receipt) the darkest side
 * is kept, so a scan never produces nothing.
 */
export const BLANK_SIDE_FLOOR = 0.002;
export const BLANK_SIDE_RATIO = 0.2;

export function sidesWithContent(inkFractions: number[]): number[] {
  if (inkFractions.length === 0) return [];
  const darkest = Math.max(...inkFractions);
  const threshold = Math.max(BLANK_SIDE_FLOOR, darkest * BLANK_SIDE_RATIO);
  const kept = inkFractions.map((fraction, index) => (fraction >= threshold ? index : -1)).filter((index) => index >= 0);
  return kept.length > 0 ? kept : [inkFractions.indexOf(darkest)];
}
