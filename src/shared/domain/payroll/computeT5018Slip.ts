import type { Bill, BillPayment, Contact } from '../types';

const T5018_THRESHOLD_CENTS = 50000;

export interface T5018SlipResult {
  vendorId: number;
  vendorName: string;
  sin: string | null;
  businessNumber: string | null;
  /** CRA Box 22 includes GST/HST/PST. */
  totalPaymentsCents: number;
  /** Used only for CRA's >$500 reporting threshold, which excludes GST/HST. */
  thresholdBaseCents?: number;
}

function baseShareOfPayment(bill: Bill, paymentCents: number): number {
  if (bill.amountCents <= 0) return 0;
  const taxCents = Math.max(0, bill.manualHstCents ?? 0);
  const baseCents = Math.max(0, bill.amountCents - taxCents);
  return Math.round((paymentCents * baseCents) / bill.amountCents);
}

function totalsForVendorInYear(bills: Bill[], payments: BillPayment[], vendorId: number, taxYear: number) {
  const year = String(taxYear);
  const billById = new Map(bills.filter((b) => b.vendorId === vendorId).map((b) => [b.id, b]));
  const modernBillIds = new Set(payments.map((p) => p.billId));
  let gross = 0;
  let base = 0;

  for (const p of payments) {
    const bill = billById.get(p.billId);
    if (!bill || p.paymentDate.slice(0, 4) !== year) continue;
    gross += p.amountCents;
    base += baseShareOfPayment(bill, p.amountCents);
  }

  for (const bill of bills) {
    if (bill.vendorId !== vendorId || bill.status !== 'paid' || modernBillIds.has(bill.id) || bill.billDate.slice(0, 4) !== year) continue;
    gross += bill.amountCents;
    base += baseShareOfPayment(bill, bill.amountCents);
  }
  return { gross, base };
}

export function computeT5018Slip(bills: Bill[], vendor: Contact, taxYear: number, payments: BillPayment[] = []): T5018SlipResult {
  const totals = totalsForVendorInYear(bills, payments, vendor.id, taxYear);
  return {
    vendorId: vendor.id,
    vendorName: vendor.name,
    sin: vendor.t4aSin,
    businessNumber: vendor.t4aBusinessNumber,
    totalPaymentsCents: totals.gross,
    thresholdBaseCents: totals.base,
  };
}

export function computeT5018SlipsForYear(bills: Bill[], vendors: Contact[], taxYear: number, payments: BillPayment[] = []): T5018SlipResult[] {
  return vendors
    .filter((v) => v.isT5018Contractor)
    .map((v) => computeT5018Slip(bills, v, taxYear, payments))
    .filter((s) => (s.thresholdBaseCents ?? 0) > T5018_THRESHOLD_CENTS)
    .sort((a, b) => a.vendorName.localeCompare(b.vendorName));
}
