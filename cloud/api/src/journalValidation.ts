import { createHash } from 'node:crypto';

export interface JournalLineInput {
  accountId: string;
  description?: string;
  debitCents: number;
  creditCents: number;
  taxCode?: string;
}

export interface JournalPostInput {
  transactionDate: string;
  reference?: string;
  memo: string;
  lines: JournalLineInput[];
}

export interface JournalTotals {
  debitCents: number;
  creditCents: number;
}

export class JournalValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JournalValidationError';
  }
}

export function validateJournalPost(input: JournalPostInput): JournalTotals {
  if (input.lines.length < 2) throw new JournalValidationError('journal entry requires at least two lines');
  let debitCents = 0;
  let creditCents = 0;
  for (const line of input.lines) {
    if (!Number.isSafeInteger(line.debitCents) || !Number.isSafeInteger(line.creditCents)) {
      throw new JournalValidationError('journal amounts must be exact whole cents');
    }
    if ((line.debitCents > 0) === (line.creditCents > 0)) {
      throw new JournalValidationError('each journal line must contain either a debit or a credit');
    }
    debitCents += line.debitCents;
    creditCents += line.creditCents;
    if (!Number.isSafeInteger(debitCents) || !Number.isSafeInteger(creditCents)) {
      throw new JournalValidationError('journal total exceeds the supported range');
    }
  }
  if (debitCents <= 0 || debitCents !== creditCents) {
    throw new JournalValidationError('journal entry is not balanced');
  }
  return { debitCents, creditCents };
}

export function hashJournalRequest(companyId: string, input: JournalPostInput): string {
  const canonical = JSON.stringify({
    companyId,
    transactionDate: input.transactionDate,
    reference: input.reference ?? null,
    memo: input.memo,
    lines: input.lines.map((line) => ({
      accountId: line.accountId,
      description: line.description ?? null,
      debitCents: line.debitCents,
      creditCents: line.creditCents,
      taxCode: line.taxCode ?? null,
    })),
  });
  return createHash('sha256').update(canonical).digest('hex');
}
