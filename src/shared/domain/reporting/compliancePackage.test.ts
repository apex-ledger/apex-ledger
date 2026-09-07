import { describe, expect, it } from 'vitest';
import type { Account, JournalEntry } from '../types';
import { classifyBankDeposit, closingUccCents } from './compliancePackage';

const bank: Account = { id: 1, code: '1000', name: 'Chequing', accountType: 'Asset', accountSubtype: 'Bank', normalBalance: 'Debit', parentId: null, gifiCode: null, isActive: true, isSystem: false, description: null, accountNumber: null, isTransferEligible: true };
const revenue: Account = { ...bank, id: 2, name: 'Sales', accountType: 'Revenue', normalBalance: 'Credit', isTransferEligible: false };
const expense: Account = { ...bank, id: 3, name: 'Other', accountType: 'Expense', isTransferEligible: false };
function entry(counterpartId: number): JournalEntry { return { id: 8, entryDate: '2026-08-01', memo: null, reference: null, status: 'posted', createdAt: '2026-08-01', postedAt: '2026-08-01', periodFrom: null, periodTo: null, isAdjustingEntry: false, source: 'manual', sourceReference: null, lines: [{ id: 10, journalEntryId: 8, accountId: 1, debitCents: 10_000, creditCents: 0, description: null, lineOrder: 0, taxCode: null, manualHstCents: null, baseCents: null, clearedAt: null, reconciliationId: null, foreignCurrency: null, foreignAmountCents: null, exchangeRate: null, vendorId: null, customerId: null }, { id: 11, journalEntryId: 8, accountId: counterpartId, debitCents: 0, creditCents: 10_000, description: null, lineOrder: 1, taxCode: null, manualHstCents: null, baseCents: null, clearedAt: null, reconciliationId: null, foreignCurrency: null, foreignAmountCents: null, exchangeRate: null, vendorId: null, customerId: null }] } }

describe('CRA/CPA report helpers', () => {
  it('recognizes a deposit supported by revenue', () => { expect(classifyBankDeposit(entry(2), 10, new Map([[1, bank], [2, revenue]]))).toEqual({ classification: 'Sales / income', requiresReview: false, reviewReason: null }) });
  it('flags a deposit with no recognized funding account', () => { expect(classifyBankDeposit(entry(3), 10, new Map([[1, bank], [3, expense]])).requiresReview).toBe(true) });
  it('rolls CCA pools forward exactly', () => { expect(closingUccCents(100_000, 25_000, 10_000, 20_000)).toBe(95_000) });
});
