export function taxCentsForCustomRate(baseCents: number, ratePercent: number): number {
  if (!Number.isFinite(ratePercent) || ratePercent < 0) return 0;
  return Math.round((baseCents * ratePercent) / 100);
}
