import type { PaymentTerm } from '../contacts/paymentTerms';

/**
 * Recurring invoices — the monthly bookkeeping fee, the quarterly retainer, the annual licence —
 * generated on schedule instead of retyped. A template holds everything an invoice needs except
 * its number and dates; on each due date the app creates a real invoice from it (posted like any
 * other) and moves the template's next date forward. Optionally the new invoice is opened in
 * Outlook addressed to the customer, so "send the monthly invoices" is one click.
 */
export type RecurringFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'semiannually' | 'annually';

export const RECURRING_FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  weekly: 'Every week',
  biweekly: 'Every 2 weeks',
  monthly: 'Every month',
  quarterly: 'Every 3 months',
  semiannually: 'Every 6 months',
  annually: 'Every year',
};

export interface RecurringInvoiceLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
  revenueAccountId: number;
  productId: number | null;
  taxCode: string | null;
}

export interface RecurringInvoiceTemplate {
  id: number;
  name: string;
  customerId: number;
  frequency: RecurringFrequency;
  /** The next invoice date this template will produce. */
  nextDate: string;
  /** No invoices after this date; null runs until stopped. */
  endDate: string | null;
  paymentTerms: PaymentTerm | null;
  memo: string | null;
  customerPoNumber: string | null;
  autoEmail: boolean;
  isActive: boolean;
  lines: RecurringInvoiceLine[];
  lastGeneratedDate: string | null;
}

/** The same day next period; a 31st in a shorter month clamps to that month's last day, and a
 * template that started on the 31st keeps aiming for the 31st (anchor day) rather than drifting
 * to the 30th for good. */
export function advanceDate(isoDate: string, frequency: RecurringFrequency, anchorDay?: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const day = anchorDay ?? d;
  if (frequency === 'weekly' || frequency === 'biweekly') {
    const next = new Date(Date.UTC(y, m - 1, d + (frequency === 'weekly' ? 7 : 14)));
    return next.toISOString().slice(0, 10);
  }
  const months = frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 3 : frequency === 'semiannually' ? 6 : 12;
  const targetMonthIndex = m - 1 + months;
  const lastDay = new Date(Date.UTC(y, targetMonthIndex + 1, 0)).getUTCDate();
  const next = new Date(Date.UTC(y, targetMonthIndex, Math.min(day, lastDay)));
  return next.toISOString().slice(0, 10);
}

export function templateTotalCents(lines: RecurringInvoiceLine[]): number {
  return lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitPriceCents), 0);
}

/** Templates whose next date is today or earlier (and not past their end date). */
export function dueTemplates<T extends Pick<RecurringInvoiceTemplate, 'nextDate' | 'endDate' | 'isActive'>>(templates: T[], today: string): T[] {
  return templates.filter((t) => t.isActive && t.nextDate <= today && (t.endDate === null || t.nextDate <= t.endDate));
}

/** The invoice a template produces for a given date. The caller supplies the number. */
export function invoicePayloadFromTemplate(template: RecurringInvoiceTemplate, invoiceDate: string, invoiceNumber: string, dueDate: string) {
  return {
    customerId: template.customerId,
    invoiceNumber,
    customerPoNumber: template.customerPoNumber,
    shippingAddress: null,
    invoiceDate,
    dueDate,
    memo: template.memo,
    discountCents: 0,
    paymentTerms: template.paymentTerms,
    lines: template.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      revenueAccountId: line.revenueAccountId,
      productId: line.productId,
      taxCode: line.taxCode,
      manualHstCents: null,
    })),
  };
}
