import { createHash } from 'node:crypto';
import { calculateHst, type HstCode } from './hstCalculation.js';

export interface SalesInvoiceLineInput {
  description: string;
  quantityMilli: number;
  unitPriceCents: number;
  revenueAccountId: string;
  productId?: string;
  taxCode: HstCode;
  manualHstCents?: number;
}

export interface CalculatedSalesInvoiceLine extends SalesInvoiceLineInput {
  lineNumber: number;
  baseCents: number;
  hstCents: number;
  totalCents: number;
}

export interface CalculatedSalesInvoice {
  lines: CalculatedSalesInvoiceLine[];
  subtotalCents: number;
  hstCents: number;
  totalCents: number;
}

export class SalesInvoiceCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SalesInvoiceCalculationError';
  }
}

export function calculateSalesInvoice(lines: SalesInvoiceLineInput[]): CalculatedSalesInvoice {
  if (lines.length < 1 || lines.length > 500) throw new SalesInvoiceCalculationError('invoice requires 1 to 500 lines');
  let subtotalCents = 0;
  let hstCents = 0;
  const calculated = lines.map((line, index) => {
    if (!line.description.trim()) throw new SalesInvoiceCalculationError('line description is required');
    if (!Number.isSafeInteger(line.quantityMilli) || line.quantityMilli <= 0) {
      throw new SalesInvoiceCalculationError('quantity must be positive with at most three decimal places');
    }
    if (!Number.isSafeInteger(line.unitPriceCents) || line.unitPriceCents < 0) {
      throw new SalesInvoiceCalculationError('unit price must be zero or positive whole cents');
    }
    const unrounded = line.quantityMilli * line.unitPriceCents;
    if (!Number.isSafeInteger(unrounded)) throw new SalesInvoiceCalculationError('line amount exceeds the supported range');
    const baseCents = Math.round(unrounded / 1000);
    if (baseCents <= 0) throw new SalesInvoiceCalculationError('line amount must be at least one cent');
    const tax = calculateHst(baseCents, line.taxCode, line.manualHstCents);
    subtotalCents += tax.baseCents;
    hstCents += tax.hstCents;
    if (!Number.isSafeInteger(subtotalCents) || !Number.isSafeInteger(hstCents)) {
      throw new SalesInvoiceCalculationError('invoice total exceeds the supported range');
    }
    return { ...line, lineNumber: index + 1, ...tax };
  });
  const totalCents = subtotalCents + hstCents;
  if (!Number.isSafeInteger(totalCents)) throw new SalesInvoiceCalculationError('invoice total exceeds the supported range');
  return { lines: calculated, subtotalCents, hstCents, totalCents };
}

export function hashSalesInvoiceRequest(companyId: string, input: {
  customerId: string; invoiceDate: string; dueDate: string; memo?: string;
  lines: SalesInvoiceLineInput[];
}): string {
  const calculated = calculateSalesInvoice(input.lines);
  return createHash('sha256').update(JSON.stringify({
    companyId, customerId: input.customerId, invoiceDate: input.invoiceDate, dueDate: input.dueDate,
    memo: input.memo?.trim() || null,
    lines: calculated.lines.map((line) => ({
      description: line.description.trim(), quantityMilli: line.quantityMilli,
      unitPriceCents: line.unitPriceCents, revenueAccountId: line.revenueAccountId,
      productId: line.productId ?? null, taxCode: line.taxCode,
      baseCents: line.baseCents, hstCents: line.hstCents, totalCents: line.totalCents,
    })),
  })).digest('hex');
}
