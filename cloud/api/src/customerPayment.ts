import { createHash } from 'node:crypto';

export interface CustomerPaymentInput {
  paymentDate: string; amountCents: number; bankAccountId: string; reference?: string;
}

export class CustomerPaymentValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'CustomerPaymentValidationError'; }
}

export function validateCustomerPayment(input: CustomerPaymentInput): void {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new CustomerPaymentValidationError('payment amount must be positive whole cents');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paymentDate)) throw new CustomerPaymentValidationError('payment date is invalid');
}

export function hashCustomerPaymentRequest(companyId: string, invoiceId: string, input: CustomerPaymentInput): string {
  validateCustomerPayment(input);
  return createHash('sha256').update(JSON.stringify({ companyId, invoiceId, paymentDate: input.paymentDate,
    amountCents: input.amountCents, bankAccountId: input.bankAccountId, reference: input.reference?.trim() || null })).digest('hex');
}
