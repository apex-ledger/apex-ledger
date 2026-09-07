export const hstCodes = ['hst_13', 'hst_exempt', 'manual_hst'] as const;
export type HstCode = (typeof hstCodes)[number];

export interface HstCalculation {
  baseCents: number;
  hstCents: number;
  totalCents: number;
}

export class HstCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HstCalculationError';
  }
}

export function calculateHst(baseCents: number, taxCode: HstCode, manualHstCents?: number): HstCalculation {
  if (!Number.isSafeInteger(baseCents) || baseCents <= 0) {
    throw new HstCalculationError('base amount must be positive whole cents');
  }
  let hstCents: number;
  if (taxCode === 'hst_13') {
    hstCents = Math.round(baseCents * 13 / 100);
  } else if (taxCode === 'hst_exempt') {
    hstCents = 0;
  } else {
    if (!Number.isSafeInteger(manualHstCents) || manualHstCents! < 0) {
      throw new HstCalculationError('manual HST must be zero or positive whole cents');
    }
    hstCents = manualHstCents!;
  }
  const totalCents = baseCents + hstCents;
  if (!Number.isSafeInteger(totalCents)) throw new HstCalculationError('total exceeds the supported range');
  return { baseCents, hstCents, totalCents };
}

export function hashBusinessTransactionRequest(companyId: string, input: {
  transactionType: 'sale' | 'expense'; transactionDate: string; description: string;
  counterpartyName?: string; bankAccountId: string; categoryAccountId: string;
  taxCode: HstCode; baseCents: number; hstCents: number; totalCents: number;
}): string {
  return createHash('sha256').update(JSON.stringify({
    companyId, transactionType: input.transactionType, transactionDate: input.transactionDate,
    description: input.description, counterpartyName: input.counterpartyName ?? null,
    bankAccountId: input.bankAccountId, categoryAccountId: input.categoryAccountId,
    taxCode: input.taxCode, baseCents: input.baseCents, hstCents: input.hstCents,
    totalCents: input.totalCents,
  })).digest('hex');
}

const exemptDescriptionPatterns = [
  /\bbank (fee|charge)s?\b/i,
  /\binterest\b/i,
  /\binsurance\b/i,
  /\b(wage|wages|salary|salaries|payroll)\b/i,
  /\bresidential rent\b/i,
];

export function suggestHstCode(description: string): { taxCode: 'hst_13' | 'hst_exempt'; reason: string } {
  const normalized = description.trim();
  if (exemptDescriptionPatterns.some((pattern) => pattern.test(normalized))) {
    return { taxCode: 'hst_exempt', reason: 'Description matches a commonly tax-exempt category; confirm before saving.' };
  }
  return { taxCode: 'hst_13', reason: 'Default Ontario taxable suggestion; confirm before saving.' };
}
import { createHash } from 'node:crypto';
