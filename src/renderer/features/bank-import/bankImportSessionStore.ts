import { create } from 'zustand';
import type { TaxCode } from '@shared/domain/types';
import type { ParsedTransaction, RawTable, SkippedRow } from './parseTransactions';

export type StatementType = 'bank' | 'creditCard';

export interface ImportRow extends ParsedTransaction {
  categoryAccountId: number | null;
  taxCode: TaxCode | null;
  manualHstCents: number;
  include: boolean;
  /** Tags this row's category line with a vendor/customer independent of the GL account it's
   * posted to — same idea as Journal Entries' "Name" column — so payments to/from a specific
   * party show up correctly in their subsidiary ledger. Mutually exclusive with matching this row
   * to an open invoice/bill (see matchedInvoiceId/matchedBillId), which already implies the party. */
  vendorId: number | null;
  customerId: number | null;
  /** When set, importing this row calls invoicesReceivePayment against the matched invoice
   * (posted directly to this row's money account, not Undeposited Funds — see
   * invoicesReceivePayment's own doc comment) instead of building a generic category journal
   * entry. Mutually exclusive with matchedBillId and with categoryAccountId. */
  matchedInvoiceId: number | null;
  /** When set, importing this row calls billsPay against the matched bill instead of building a
   * generic category journal entry. Mutually exclusive with matchedInvoiceId and categoryAccountId. */
  matchedBillId: number | null;
  /** True when the import itself picked the matched invoice/bill (exact amount in the date window,
   * name confirmed if needed) — shown as a hint so the reviewer confirms rather than re-searches. */
  autoMatched?: boolean;
}

type Updater<T> = T | ((prev: T) => T);

function resolve<T>(updater: Updater<T>, prev: T): T {
  return typeof updater === 'function' ? (updater as (p: T) => T)(prev) : updater;
}

interface BankImportSessionState {
  statementType: StatementType;
  moneyAccountId: number | null;
  rawText: string;
  rows: ImportRow[];
  skippedRows: SkippedRow[];
  table: RawTable | null;
  rowDuplicateCounts: Record<string, number>;
  /** Keys of rows that matched a saved bank_import_exclusions row on load — pre-excluded and shown
   * with a "previously excluded" badge, distinct from a plain manual exclude (see
   * bankImportExclusionsAdd's own doc comment for why the two are kept separate). */
  previouslyExcludedKeys: Record<string, boolean>;
  cardPaymentMatches: Record<string, { entryId: number; entryDate: string }>;
  selectedKeys: Set<string>;
  lastClickedKey: string | null;
  dateSortDir: 'asc' | 'desc';
  openingBalanceCents: number | null;
  closingBalanceCents: number | null;

  setStatementType: (v: Updater<StatementType>) => void;
  setMoneyAccountId: (v: Updater<number | null>) => void;
  setRawText: (v: Updater<string>) => void;
  setRows: (v: Updater<ImportRow[]>) => void;
  setSkippedRows: (v: Updater<SkippedRow[]>) => void;
  setTable: (v: Updater<RawTable | null>) => void;
  setRowDuplicateCounts: (v: Updater<Record<string, number>>) => void;
  setPreviouslyExcludedKeys: (v: Updater<Record<string, boolean>>) => void;
  setCardPaymentMatches: (v: Updater<Record<string, { entryId: number; entryDate: string }>>) => void;
  setSelectedKeys: (v: Updater<Set<string>>) => void;
  setLastClickedKey: (v: Updater<string | null>) => void;
  setDateSortDir: (v: Updater<'asc' | 'desc'>) => void;
  setOpeningBalanceCents: (v: Updater<number | null>) => void;
  setClosingBalanceCents: (v: Updater<number | null>) => void;
}

/**
 * Holds Bank Import's in-progress review — parsed rows, categorization, duplicate flags, the
 * loaded table, everything the reviewer has entered — OUTSIDE the page component itself.
 *
 * BankImportPage used to keep all of this in plain useState, which meant switching to any other
 * page (most commonly: leaving to add a missing category in Chart of Accounts) unmounted the page
 * and threw away the entire in-progress import, forcing the reviewer to redo it from scratch. A
 * Zustand store survives the component unmounting — the page reads and writes through this store
 * instead of local state, so navigating away and back restores exactly where it left off. Only
 * cleared by an explicit action (Cancel Import, or a successful Import) or the app closing, never
 * by switching pages.
 */
export const useBankImportSessionStore = create<BankImportSessionState>((set) => ({
  statementType: 'bank',
  moneyAccountId: null,
  rawText: '',
  rows: [],
  skippedRows: [],
  table: null,
  rowDuplicateCounts: {},
  previouslyExcludedKeys: {},
  cardPaymentMatches: {},
  selectedKeys: new Set<string>(),
  lastClickedKey: null,
  dateSortDir: 'asc',
  openingBalanceCents: null,
  closingBalanceCents: null,

  setStatementType: (v) => set((s) => ({ statementType: resolve(v, s.statementType) })),
  setMoneyAccountId: (v) => set((s) => ({ moneyAccountId: resolve(v, s.moneyAccountId) })),
  setRawText: (v) => set((s) => ({ rawText: resolve(v, s.rawText) })),
  setRows: (v) => set((s) => ({ rows: resolve(v, s.rows) })),
  setSkippedRows: (v) => set((s) => ({ skippedRows: resolve(v, s.skippedRows) })),
  setTable: (v) => set((s) => ({ table: resolve(v, s.table) })),
  setRowDuplicateCounts: (v) => set((s) => ({ rowDuplicateCounts: resolve(v, s.rowDuplicateCounts) })),
  setPreviouslyExcludedKeys: (v) => set((s) => ({ previouslyExcludedKeys: resolve(v, s.previouslyExcludedKeys) })),
  setCardPaymentMatches: (v) => set((s) => ({ cardPaymentMatches: resolve(v, s.cardPaymentMatches) })),
  setSelectedKeys: (v) => set((s) => ({ selectedKeys: resolve(v, s.selectedKeys) })),
  setLastClickedKey: (v) => set((s) => ({ lastClickedKey: resolve(v, s.lastClickedKey) })),
  setDateSortDir: (v) => set((s) => ({ dateSortDir: resolve(v, s.dateSortDir) })),
  setOpeningBalanceCents: (v) => set((s) => ({ openingBalanceCents: resolve(v, s.openingBalanceCents) })),
  setClosingBalanceCents: (v) => set((s) => ({ closingBalanceCents: resolve(v, s.closingBalanceCents) })),
}));
