/** The report figures the test company's expected-results sheet quotes, computed by the same
 * domain code the report screens use. */
import { getCurrentDb } from '../companyFile';
import { getAllAccounts, getAllJournalEntriesWithLines } from '../db/queries';
import { trialBalance } from '@shared/domain/ledger/trialBalance';
import { incomeStatement } from '@shared/domain/ledger/incomeStatement';
import { balanceSheet } from '@shared/domain/ledger/balanceSheet';
import { computeHstSummary } from '@shared/domain/ledger/hstSummary';

const dollars = (cents: number) => `$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function reportsHandlers(): Promise<Record<string, unknown>> {
  const db = getCurrentDb();
  const accounts = await getAllAccounts(db);
  const entries = await getAllJournalEntriesWithLines(db);
  const asOf = '2026-08-31';
  const tb = trialBalance(accounts, entries, asOf);
  const pl = incomeStatement(accounts, entries, '2026-01-01', asOf);
  const bs = balanceSheet(accounts, entries, asOf);
  const hst = computeHstSummary(accounts, entries, '2026-01-01', asOf);
  const bank = (name: string) => {
    const account = accounts.find((row) => row.name === name);
    const row = tb.rows.find((line) => line.account.id === account?.id);
    return row ? dollars(row.debitCents - row.creditCents) : 'n/a';
  };
  return {
    trialBalance: { asOf, totalDebits: dollars(tb.totalDebitCents), totalCredits: dollars(tb.totalCreditCents), balanced: tb.totalDebitCents === tb.totalCreditCents },
    profitAndLoss: { period: `2026-01-01 to ${asOf}`, revenue: dollars(pl.revenue.totalCents), costOfSales: dollars(pl.costOfSales.totalCents), operatingExpenses: dollars(pl.operatingExpenses.totalCents), netIncome: dollars(pl.netIncomeCents) },
    balanceSheet: { asOf, assets: dollars(bs.assets.totalCents), liabilities: dollars(bs.liabilities.totalCents), equity: dollars(bs.equity.totalCents), equation: bs.assets.totalCents === bs.liabilities.totalCents + bs.equity.totalCents },
    bankBalances: { chequing: bank('Chequing Account'), savings: bank('Savings Account'), undepositedFunds: bank('Undeposited Funds') },
    gstHst: hst.quarterly.map((quarter) => ({ period: quarter.period, collected: dollars(quarter.collectedCents), itcs: dollars(quarter.itcCents), net: dollars(quarter.collectedCents - quarter.itcCents) })),
  };
}
