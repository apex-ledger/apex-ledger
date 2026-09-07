import type { Bill, BillPayment, Contact } from '../types';

/** CRA T4A Box 048: fees for services actually paid in the calendar year, excluding GST/HST/PST. */
export interface T4ASlipResult {
  vendorId: number;
  vendorName: string;
  sin: string | null;
  businessNumber: string | null;
  feesForServicesCents: number;
}

function baseShareOfPayment(bill: Bill, paymentCents: number): number {
  if (bill.amountCents <= 0) return 0;
  const taxCents = Math.max(0, bill.manualHstCents ?? 0);
  const baseCents = Math.max(0, bill.amountCents - taxCents);
  return Math.round((paymentCents * baseCents) / bill.amountCents);
}

function paidServiceCentsForVendorInYear(bills: Bill[], payments: BillPayment[], vendorId: number, taxYear: number): number {
  const year = String(taxYear);
  const billById = new Map(bills.filter((b) => b.vendorId === vendorId).map((b) => [b.id, b]));
  const modernBillIds = new Set(payments.map((p) => p.billId));

  const modern = payments.reduce((sum, p) => {
    const bill = billById.get(p.billId);
    if (!bill || p.paymentDate.slice(0, 4) !== year) return sum;
    return sum + baseShareOfPayment(bill, p.amountCents);
  }, 0);

  // Compatibility for files paid before payment-history migration: there is no recoverable payment
  // date, so retain the old bill-date approximation only for those legacy fully-paid documents.
  const legacy = bills
    .filter((b) => b.vendorId === vendorId && b.status === 'paid' && !modernBillIds.has(b.id) && b.billDate.slice(0, 4) === year)
    .reduce((sum, b) => sum + baseShareOfPayment(b, b.amountCents), 0);

  return modern + legacy;
}

export function computeT4ASlip(bills: Bill[], vendor: Contact, taxYear: number, payments: BillPayment[] = []): T4ASlipResult {
  return {
    vendorId: vendor.id,
    vendorName: vendor.name,
    sin: vendor.t4aSin,
    businessNumber: vendor.t4aBusinessNumber,
    feesForServicesCents: paidServiceCentsForVendorInYear(bills, payments, vendor.id, taxYear),
  };
}

export function computeT4ASlipsForYear(bills: Bill[], vendors: Contact[], taxYear: number, payments: BillPayment[] = []): T4ASlipResult[] {
  return vendors
    .filter((v) => v.isT4aContractor)
    .map((v) => computeT4ASlip(bills, v, taxYear, payments))
    .filter((s) => s.feesForServicesCents > 0)
    .sort((a, b) => a.vendorName.localeCompare(b.vendorName));
}
