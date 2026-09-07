import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import type { Account, JournalEntry } from '@shared/domain/types';
import { trialBalance } from '@shared/domain/ledger/trialBalance';
import { balanceSheet } from '@shared/domain/ledger/balanceSheet';
import { incomeStatement } from '@shared/domain/ledger/incomeStatement';

/** The reports, run against real books.
 *
 * Every other report test builds its own ledger, which means it only ever sees the shapes I thought
 * to write down. Real files carry things fixtures do not: opening-balance entries that debit equity,
 * accounts with no code, dates years apart, and whatever a real chart of accounts has grown into.
 *
 * Read-only, and gated on NL_REAL_COMPANY_DIR so the suite stays portable.
 */

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string, opts?: { readOnly?: boolean }) => {
    prepare: (sql: string) => { all: () => Record<string, unknown>[] };
    close: () => void;
  };
};

const REAL_DIR = process.env.NL_REAL_COMPANY_DIR;

function realFiles(): string[] {
  if (!REAL_DIR || !existsSync(REAL_DIR)) return [];
  return readdirSync(REAL_DIR)
    .filter((f) => f.endsWith('.company'))
    .map((f) => join(REAL_DIR, f));
}

function load(file: string): { accounts: Account[]; entries: JournalEntry[] } {
  const db = new DatabaseSync(file, { readOnly: true });

  const accounts = db
    .prepare('SELECT * FROM accounts')
    .all()
    .map(
      (r) =>
        ({
          id: r.id as number,
          code: (r.code as string) ?? '',
          name: r.name as string,
          accountType: r.account_type as Account['accountType'],
          accountSubtype: r.account_subtype as Account['accountSubtype'],
          normalBalance: r.normal_balance as Account['normalBalance'],
          parentId: (r.parent_id as number) ?? null,
          gifiCode: (r.gifi_code as string) ?? null,
          isActive: Boolean(r.is_active),
          isSystem: Boolean(r.is_system),
          description: (r.description as string) ?? null,
          accountNumber: (r.account_number as string) ?? null,
          isTransferEligible: Boolean(r.is_transfer_eligible),
        }) as Account,
    );

  const lines = db.prepare('SELECT * FROM journal_entry_lines ORDER BY line_order, id').all();
  const entries = db
    .prepare('SELECT * FROM journal_entries')
    .all()
    .map((r) => {
      const id = r.id as number;
      return {
        id,
        entryDate: r.entry_date as string,
        memo: (r.memo as string) ?? null,
        reference: (r.reference as string) ?? null,
        status: r.status as JournalEntry['status'],
        createdAt: r.created_at as string,
        postedAt: (r.posted_at as string) ?? null,
        periodFrom: (r.period_from as string) ?? null,
        periodTo: (r.period_to as string) ?? null,
        isAdjustingEntry: Boolean(r.is_adjusting_entry),
        source: 'manual',
        sourceReference: null,
        lines: lines
          .filter((l) => l.journal_entry_id === id)
          .map((l) => ({
            id: l.id as number,
            journalEntryId: id,
            accountId: l.account_id as number,
            debitCents: (l.debit_cents as number) ?? 0,
            creditCents: (l.credit_cents as number) ?? 0,
            description: (l.description as string) ?? null,
            lineOrder: (l.line_order as number) ?? 0,
            taxCode: (l.tax_code as never) ?? null,
            manualHstCents: (l.manual_hst_cents as number) ?? null,
            baseCents: (l.base_cents as number) ?? null,
            clearedAt: (l.cleared_at as string) ?? null,
            reconciliationId: (l.reconciliation_id as number) ?? null,
            foreignCurrency: (l.foreign_currency as never) ?? null,
            foreignAmountCents: (l.foreign_amount_cents as number) ?? null,
            exchangeRate: (l.exchange_rate as number) ?? null,
            vendorId: (l.vendor_id as number) ?? null,
            customerId: (l.customer_id as number) ?? null,
          })),
      } as JournalEntry;
    });

  db.close();
  return { accounts, entries };
}

const files = realFiles();
const LATEST = '2099-12-31';

describe.skipIf(files.length === 0)('reports against real books', () => {
  for (const file of files) {
    const name = file.split(/[\/]/).pop() ?? file;

    describe(name, () => {
      it('produces a trial balance that balances', () => {
        const { accounts, entries } = load(file);
        const tb = trialBalance(accounts, entries, LATEST);

        expect(tb.rows.length, 'the file has data but the trial balance is empty').toBeGreaterThan(0);
        expect(
          tb.isBalanced,
          `debits ${tb.totalDebitCents} vs credits ${tb.totalCreditCents}`,
        ).toBe(true);
      });

      it('produces a balance sheet where assets equal liabilities plus equity', () => {
        // The identity holds by construction only if every posted entry balances and net income is
        // folded in correctly. Real data is where that assumption gets tested.
        const { accounts, entries } = load(file);
        const bs = balanceSheet(accounts, entries, LATEST);

        expect(
          bs.isBalanced,
          `assets ${bs.assets.totalCents} vs L+E ${bs.totalLiabilitiesAndEquityCents}`,
        ).toBe(true);
      });

      it('reconciles net income between the P&L and the balance sheet', () => {
        // Two independent paths to the same number. If they disagree, one of the reports is wrong
        // and no fixture would have shown it.
        const { accounts, entries } = load(file);
        const is = incomeStatement(accounts, entries, '1900-01-01', LATEST);
        const bs = balanceSheet(accounts, entries, LATEST);
        const netIncomeLine = bs.equity.lines.find((l) => l.account.name === 'Net Income to Date');

        expect(netIncomeLine?.amountCents ?? 0).toBe(is.netIncomeCents);
      });

      it('never reports an account balance the journal does not support', () => {
        // Guards the mapping itself: every trial-balance row must trace to real debits and credits.
        const { accounts, entries } = load(file);
        const tb = trialBalance(accounts, entries, LATEST);
        const posted = new Set(entries.flatMap((e) => e.lines.map((l) => l.accountId)));

        for (const row of tb.rows) {
          expect(posted, `${row.account.name} has a balance but no journal lines`).toContain(row.account.id);
        }
      });
    });
  }
});
