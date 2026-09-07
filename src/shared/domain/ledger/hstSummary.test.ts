import { describe, expect, it } from 'vitest';
import { normalBalanceForType, type Account, type JournalEntry } from '../types';
import { computeHstSummary, hstPortionCents, taxPortionCents, usTaxPortionCents } from './hstSummary';

function account(id: number, code: string, name: string, accountType: Account['accountType']): Account {
  return {
    id,
    code,
    name,
    accountType,
    accountSubtype: null,
    normalBalance: normalBalanceForType(accountType),
    parentId: null,
    gifiCode: null,
    isActive: true,
    isSystem: false,
    description: null,
    accountNumber: null,
    isTransferEligible: false,
  };
}

const CASH = account(1, '1000', 'Cash', 'Asset');
const SALES = account(2, '4000', 'Sales Revenue', 'Revenue');
const RENT = account(3, '5090', 'Rent / Lease', 'Expense');
const BANK_CHARGES = account(4, '5010', 'Bank Charges', 'Expense');
const OFFICE_SUPPLIES = account(5, '5040', 'Office Supplies', 'Expense');
const ACCOUNTS: Account[] = [CASH, SALES, RENT, BANK_CHARGES, OFFICE_SUPPLIES];

function entry(
  id: number,
  entryDate: string,
  lines: {
    accountId: number;
    debitCents?: number;
    creditCents?: number;
    taxCode?: 'HST' | 'NonHST' | 'Manual' | 'USTax' | 'MealsHST' | null;
    manualHstCents?: number | null;
  }[],
): JournalEntry {
  return {
    id,
    entryDate,
    memo: null,
    reference: null,
    status: 'posted',
    createdAt: entryDate,
    postedAt: entryDate,
    lines: lines.map((l, i) => ({
      id: id * 100 + i,
      journalEntryId: id,
      accountId: l.accountId,
      debitCents: l.debitCents ?? 0,
      creditCents: l.creditCents ?? 0,
      description: null,
    accountNumber: null,
    isTransferEligible: false,
      lineOrder: i,
      taxCode: l.taxCode ?? null,
      manualHstCents: l.manualHstCents ?? null,
      baseCents: null,
      clearedAt: null,
      reconciliationId: null,
      vendorId: null,
      customerId: null,
      foreignCurrency: null,
      foreignAmountCents: null,
      exchangeRate: null,
    })),
    periodFrom: null,
    periodTo: null,
    isAdjustingEntry: false,
    source: 'manual',
    sourceReference: null,
  };
}

describe('computeHstSummary', () => {
  const entries: JournalEntry[] = [
    // $1,130.00 tax-inclusive sale -> $130.00 HST collected
    entry(1, '2026-01-10', [
      { accountId: CASH.id, debitCents: 113000 },
      { accountId: SALES.id, creditCents: 113000, taxCode: 'HST' },
    ]),
    // $565.00 tax-inclusive rent -> $65.00 ITC
    entry(2, '2026-01-15', [
      { accountId: RENT.id, debitCents: 56500, taxCode: 'HST' },
      { accountId: CASH.id, creditCents: 56500 },
    ]),
    // Bank charges are HST-exempt — should not affect totals at all
    entry(3, '2026-01-20', [
      { accountId: BANK_CHARGES.id, debitCents: 10000, taxCode: 'NonHST' },
      { accountId: CASH.id, creditCents: 10000 },
    ]),
    // Manual HST — excluded from collected/itc, surfaced separately
    entry(4, '2026-02-01', [
      { accountId: OFFICE_SUPPLIES.id, debitCents: 22600, taxCode: 'Manual' },
      { accountId: CASH.id, creditCents: 22600 },
    ]),
  ];

  it('computes collected, ITC, and net payable per month', () => {
    const result = computeHstSummary(ACCOUNTS, entries, '2026-01-01', '2026-02-28');
    const jan = result.monthly.find((m) => m.period === '2026-01')!;
    expect(jan.collectedCents).toBe(13000);
    expect(jan.itcCents).toBe(6500);
    expect(jan.netPayableCents).toBe(6500);

    const feb = result.monthly.find((m) => m.period === '2026-02')!;
    expect(feb.collectedCents).toBe(0);
    expect(feb.itcCents).toBe(0);
    expect(feb.manualCount).toBe(1);
    expect(feb.manualAmountCents).toBe(22600);
  });

  it('rolls monthly figures up into quarterly and annual buckets', () => {
    const result = computeHstSummary(ACCOUNTS, entries, '2026-01-01', '2026-02-28');
    const q1 = result.quarterly.find((q) => q.period === '2026-Q1')!;
    expect(q1.collectedCents).toBe(13000);
    expect(q1.itcCents).toBe(6500);
    expect(q1.netPayableCents).toBe(6500);

    const year = result.annual.find((y) => y.period === '2026')!;
    expect(year.collectedCents).toBe(13000);
    expect(year.itcCents).toBe(6500);
  });

  it('breaks down HST by account and direction', () => {
    const result = computeHstSummary(ACCOUNTS, entries, '2026-01-01', '2026-02-28');
    const salesRow = result.byAccount.find((r) => r.account.id === SALES.id)!;
    expect(salesRow.direction).toBe('collected');
    expect(salesRow.hstCents).toBe(13000);

    const rentRow = result.byAccount.find((r) => r.account.id === RENT.id)!;
    expect(rentRow.direction).toBe('itc');
    expect(rentRow.hstCents).toBe(6500);

    // NonHST and Manual lines never appear in the automatic HST/ITC breakdown
    expect(result.byAccount.some((r) => r.account.id === BANK_CHARGES.id)).toBe(false);
    expect(result.byAccount.some((r) => r.account.id === OFFICE_SUPPLIES.id)).toBe(false);
  });

  it('lists Manual-tagged lines separately for the accountant to calculate by hand', () => {
    const result = computeHstSummary(ACCOUNTS, entries, '2026-01-01', '2026-02-28');
    expect(result.manualReviewLines).toHaveLength(1);
    expect(result.manualReviewLines[0]).toMatchObject({ account: OFFICE_SUPPLIES, baseAmountCents: 22600, manualHstCents: null });
  });

  it('folds an entered manual HST amount into the totals once linked, and stops flagging it as pending', () => {
    const entered: JournalEntry[] = [
      entry(6, '2026-03-01', [
        { accountId: OFFICE_SUPPLIES.id, debitCents: 22600, taxCode: 'Manual', manualHstCents: 2000 },
        { accountId: CASH.id, creditCents: 22600 },
      ]),
    ];
    const result = computeHstSummary(ACCOUNTS, entered, '2026-03-01', '2026-03-31');
    const march = result.monthly.find((m) => m.period === '2026-03')!;
    expect(march.itcCents).toBe(2000);
    expect(march.manualCount).toBe(0);
    expect(march.manualAmountCents).toBe(0);

    const officeSuppliesRow = result.byAccount.find((r) => r.account.id === OFFICE_SUPPLIES.id)!;
    expect(officeSuppliesRow.direction).toBe('itc');
    expect(officeSuppliesRow.hstCents).toBe(2000);

    expect(result.manualReviewLines).toHaveLength(1);
    expect(result.manualReviewLines[0].manualHstCents).toBe(2000);
  });

  it('excludes draft and out-of-range entries', () => {
    const draft: JournalEntry = { ...entries[0], id: 99, status: 'draft' };
    const outOfRange = entry(5, '2025-12-31', [
      { accountId: CASH.id, debitCents: 113000 },
      { accountId: SALES.id, creditCents: 113000, taxCode: 'HST' },
    ]);
    const result = computeHstSummary(ACCOUNTS, [...entries, draft, outOfRange], '2026-01-01', '2026-02-28');
    const jan = result.monthly.find((m) => m.period === '2026-01')!;
    expect(jan.collectedCents).toBe(13000); // unchanged by the draft duplicate or the 2025 entry
  });

  it('excludes US Tax-tagged lines from the CRA HST/GST totals entirely', () => {
    const usTaxEntry = entry(7, '2026-01-25', [
      { accountId: RENT.id, debitCents: 10800, taxCode: 'USTax' },
      { accountId: CASH.id, creditCents: 10800 },
    ]);
    const result = computeHstSummary(ACCOUNTS, [...entries, usTaxEntry], '2026-01-01', '2026-02-28');
    const jan = result.monthly.find((m) => m.period === '2026-01')!;
    // Same as the plain HST/ITC totals from the base fixture — the US Tax line contributes nothing.
    expect(jan.collectedCents).toBe(13000);
    expect(jan.itcCents).toBe(6500);
    expect(result.byAccount.some((r) => r.hstCents === 800)).toBe(false);
  });
});

describe('computeHstSummary with real GST/HST account lines (post tax-split)', () => {
  const GST_PAYABLE = account(10, '2280', 'GST/HST Payable', 'Liability');
  const GST_RECOVERABLE = account(11, '1250', 'GST/HST Recoverable', 'Asset');
  const MEALS = account(12, '5060', 'Meals & Entertainment', 'Expense');
  const accountsWithGst: Account[] = [...ACCOUNTS, GST_PAYABLE, GST_RECOVERABLE, MEALS];

  it('reads the real posted amount from a GST/HST Payable line instead of re-deriving it from the (now tax-free) revenue line', () => {
    // Base $1,000 sale + $130 HST posted to its own line — revenue line itself carries no tax.
    const entries: JournalEntry[] = [
      entry(20, '2026-04-05', [
        { accountId: CASH.id, debitCents: 113000 },
        { accountId: SALES.id, creditCents: 100000, taxCode: 'HST' },
        { accountId: GST_PAYABLE.id, creditCents: 13000 },
      ]),
    ];
    const result = computeHstSummary(accountsWithGst, entries, '2026-04-01', '2026-04-30');
    const april = result.monthly.find((m) => m.period === '2026-04')!;
    expect(april.collectedCents).toBe(13000);
    expect(april.itcCents).toBe(0);

    const salesRow = result.byAccount.find((r) => r.account.id === SALES.id)!;
    expect(salesRow.hstCents).toBe(13000);
    expect(salesRow.baseAmountCents).toBe(100000);
  });

  it('reads a GST/HST Recoverable line for an expense and never double-counts by also extracting the category line', () => {
    const entries: JournalEntry[] = [
      entry(21, '2026-04-10', [
        { accountId: RENT.id, debitCents: 50000, taxCode: 'HST' },
        { accountId: GST_RECOVERABLE.id, debitCents: 6500 },
        { accountId: CASH.id, creditCents: 56500 },
      ]),
    ];
    const result = computeHstSummary(accountsWithGst, entries, '2026-04-01', '2026-04-30');
    const april = result.monthly.find((m) => m.period === '2026-04')!;
    expect(april.itcCents).toBe(6500);
    expect(april.collectedCents).toBe(0);
  });

  it('reflects only the claimable half of a Meals & Entertainment GST/HST Recoverable line — the rest stayed in the expense, not double-booked as ITC', () => {
    // $100 base meal + $13 HST: only $6.50 claimable (posted to Recoverable), $6.50 stays in Meals.
    const entries: JournalEntry[] = [
      entry(22, '2026-04-12', [
        { accountId: MEALS.id, debitCents: 10650, taxCode: 'MealsHST' },
        { accountId: GST_RECOVERABLE.id, debitCents: 650 },
        { accountId: CASH.id, creditCents: 11300 },
      ]),
    ];
    const result = computeHstSummary(accountsWithGst, entries, '2026-04-01', '2026-04-30');
    const april = result.monthly.find((m) => m.period === '2026-04')!;
    expect(april.itcCents).toBe(650);
  });

  it('ignores a zero-amount GST/HST line (e.g. a NonHST transaction that never touched the account)', () => {
    const entries: JournalEntry[] = [
      entry(23, '2026-04-15', [
        { accountId: RENT.id, debitCents: 5000, taxCode: 'NonHST' },
        { accountId: CASH.id, creditCents: 5000 },
      ]),
    ];
    const result = computeHstSummary(accountsWithGst, entries, '2026-04-01', '2026-04-30');
    const april = result.monthly.find((m) => m.period === '2026-04');
    expect(april?.itcCents ?? 0).toBe(0);
  });
});

describe('usTaxPortionCents / taxPortionCents', () => {
  it('splits the embedded 8% US tax out of a tax-inclusive amount', () => {
    expect(usTaxPortionCents(10800)).toBe(800); // $108.00 total -> $8.00 US tax
  });

  it('dispatches to the right rate based on taxCode', () => {
    expect(taxPortionCents('HST', 11300)).toBe(hstPortionCents(11300));
    expect(taxPortionCents('USTax', 10800)).toBe(usTaxPortionCents(10800));
    expect(taxPortionCents('NonHST', 10000)).toBe(0);
    expect(taxPortionCents('Manual', 10000)).toBe(0);
    expect(taxPortionCents(null, 10000)).toBe(0);
  });
});

const HST_PAYABLE = account(10, '2310', 'GST/HST Payable', 'Liability');
const HST_RECOVERABLE = account(11, '1310', 'GST/HST Recoverable', 'Asset');
const CONSULTING = account(12, '4010', 'Consulting Revenue', 'Revenue');
const SPLIT_ACCOUNTS: Account[] = [...ACCOUNTS, HST_PAYABLE, HST_RECOVERABLE, CONSULTING];

describe('computeHstSummary — split-tax entries', () => {
  it('treats a debit to GST/HST Payable as a reduction in tax collected, not more tax collected', () => {
    const sale = entry(1, '2026-03-05', [
      { accountId: CASH.id, debitCents: 113000 },
      { accountId: SALES.id, creditCents: 100000, taxCode: 'HST' },
      { accountId: HST_PAYABLE.id, creditCents: 13000 },
    ]);
    // Remitting $130.00 to CRA: Debit HST Payable, Credit bank. This must not read as another
    // $130.00 of tax collected.
    const remittance = entry(2, '2026-03-31', [
      { accountId: HST_PAYABLE.id, debitCents: 13000 },
      { accountId: CASH.id, creditCents: 13000 },
    ]);

    const saleOnly = computeHstSummary(SPLIT_ACCOUNTS, [sale], '2026-03-01', '2026-03-31');
    expect(saleOnly.monthly[0].collectedCents).toBe(13000);

    const withRemittance = computeHstSummary(SPLIT_ACCOUNTS, [sale, remittance], '2026-03-01', '2026-03-31');
    expect(withRemittance.monthly[0].collectedCents).toBe(0);
    expect(withRemittance.monthly[0].netPayableCents).toBe(0);
  });

  it('treats a credit to GST/HST Recoverable as a reduction in ITCs', () => {
    const purchase = entry(1, '2026-03-05', [
      { accountId: RENT.id, debitCents: 100000, taxCode: 'HST' },
      { accountId: HST_RECOVERABLE.id, debitCents: 13000 },
      { accountId: CASH.id, creditCents: 113000 },
    ]);
    const refund = entry(2, '2026-03-20', [
      { accountId: CASH.id, debitCents: 113000 },
      { accountId: RENT.id, creditCents: 100000, taxCode: 'HST' },
      { accountId: HST_RECOVERABLE.id, creditCents: 13000 },
    ]);

    const result = computeHstSummary(SPLIT_ACCOUNTS, [purchase, refund], '2026-03-01', '2026-03-31');
    expect(result.monthly[0].itcCents).toBe(0);
  });

  it('splits one combined GST/HST line across every revenue account that produced it', () => {
    // $1,000 sales + $3,000 consulting, one combined $520 HST credit covering both.
    const invoice = entry(1, '2026-04-10', [
      { accountId: CASH.id, debitCents: 452000 },
      { accountId: SALES.id, creditCents: 100000, taxCode: 'HST' },
      { accountId: CONSULTING.id, creditCents: 300000, taxCode: 'HST' },
      { accountId: HST_PAYABLE.id, creditCents: 52000 },
    ]);

    const result = computeHstSummary(SPLIT_ACCOUNTS, [invoice], '2026-04-01', '2026-04-30');
    expect(result.monthly[0].collectedCents).toBe(52000);

    const salesRow = result.byAccount.find((r) => r.account.id === SALES.id)!;
    const consultingRow = result.byAccount.find((r) => r.account.id === CONSULTING.id)!;
    expect(salesRow.hstCents).toBe(13000); // 1/4 of the tax
    expect(consultingRow.hstCents).toBe(39000); // 3/4 of the tax
    expect(salesRow.hstCents + consultingRow.hstCents).toBe(52000); // no cents lost in the split
    expect(salesRow.baseAmountCents).toBe(100000);
    expect(consultingRow.baseAmountCents).toBe(300000);
  });

  it('keeps the allocated shares summing to the posted tax when the split does not divide evenly', () => {
    const invoice = entry(1, '2026-04-10', [
      { accountId: CASH.id, debitCents: 113300 },
      { accountId: SALES.id, creditCents: 33333, taxCode: 'HST' },
      { accountId: CONSULTING.id, creditCents: 66667, taxCode: 'HST' },
      { accountId: HST_PAYABLE.id, creditCents: 13001 },
    ]);

    const result = computeHstSummary(SPLIT_ACCOUNTS, [invoice], '2026-04-01', '2026-04-30');
    const allocated = result.byAccount.reduce((sum, r) => sum + r.hstCents, 0);
    expect(allocated).toBe(13001);
    expect(result.monthly[0].collectedCents).toBe(13001);
  });
});

describe('computeHstSummary — a filed return is not activity', () => {
  it('ignores the filing journal that clears the control accounts, whatever period it is dated in', () => {
    const payable = account(90, '2280', 'GST/HST Payable', 'Liability');
    const recoverable = account(91, '1250', 'GST/HST Recoverable', 'Asset');
    const filed = account(92, '2285', 'GST/HST Filed Payable', 'Liability');
    const revenue = account(93, '4000', 'Sales', 'Revenue');
    const bank = account(94, '1000', 'Chequing', 'Asset');
    const accounts = [payable, recoverable, filed, revenue, bank];
    const sale = entry(1, '2026-01-15', [
      { accountId: bank.id, debitCents: 11_300, creditCents: 0, taxCode: null },
      { accountId: revenue.id, debitCents: 0, creditCents: 10_000, taxCode: 'HST' },
      { accountId: payable.id, debitCents: 0, creditCents: 1_300, taxCode: null },
    ]);
    // The Q1 return, filed on 20 April: clears Payable into Filed Payable. No revenue, no bank.
    const filing = entry(2, '2026-04-20', [
      { accountId: payable.id, debitCents: 1_300, creditCents: 0, taxCode: null },
      { accountId: filed.id, debitCents: 0, creditCents: 1_300, taxCode: null },
    ]);
    const summary = computeHstSummary(accounts, [sale, filing], '2026-01-01', '2026-06-30');
    const q1 = summary.quarterly.find((q) => q.period === '2026-Q1');
    const q2 = summary.quarterly.find((q) => q.period === '2026-Q2');
    expect(q1?.collectedCents).toBe(1_300);
    expect(q2).toBeUndefined();
  });
});
