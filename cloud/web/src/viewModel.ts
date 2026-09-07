import type { Account } from './api.js';

export function bankAccounts(accounts: Account[]): Account[] {
  return accounts.filter((account) => account.active && ['bank', 'credit_card'].includes(account.accountKind));
}

export function categoryAccounts(accounts: Account[], transactionType: 'sale' | 'expense'): Account[] {
  const expectedType = transactionType === 'sale' ? 'revenue' : 'expense';
  return accounts.filter((account) => account.active && account.accountType === expectedType && !account.isMaster);
}

export function calculateVisibleHst(baseCents: number, taxCode: string, manualHstCents: number): number {
  if (!Number.isSafeInteger(baseCents) || baseCents <= 0) return 0;
  if (taxCode === 'hst_13') return Math.round(baseCents * 13 / 100);
  if (taxCode === 'manual_hst') return Number.isSafeInteger(manualHstCents) && manualHstCents >= 0 ? manualHstCents : 0;
  return 0;
}

export function formatCad(cents: string | number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(Number(cents) / 100);
}
