import { describe, expect, it } from 'vitest';
import { normalBalanceForType, type Account } from '../types';
import { parseBulkExpenseImport } from './parseBulkExpenseImport';
import type { ColumnRole } from './bulkExpenseColumns';

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

const ACCOUNTS: Account[] = [
  account(1, '1010', 'Petty Cash', 'Asset'),
  account(2, '2050', 'Visa', 'Liability'),
  account(3, '5135', 'Meals & Entertainment', 'Expense'),
  account(4, '5071', 'Fuel', 'Expense'),
  account(5, '1360', 'Materials & Supplies', 'Expense'),
];

// The layout used by one real client's export: Date, Vendor, blank, Category(typed), Category,
// Currency, USD base, Country, Tax label, Tax amount, USD total, Rate, CAD total, Payment, Flag.
const WIDE_MAPPING: ColumnRole[] = [
  'date', 'vendor', 'ignore', 'ignore', 'category', 'currency', 'ignore', 'ignore',
  'taxLabel', 'taxAmount', 'foreignAmount', 'exchangeRate', 'amount', 'paymentMethod', 'ignore',
];

describe('parseBulkExpenseImport (wide 15-column layout)', () => {
  it('parses a normal 8%-tax cash meal purchase', () => {
    const row = '7/4/2026\tBurger king\t\tMeals\tMeals\tUSD\t4.89\tUSA\t8%\t$0.39\t$5.28\t1.375\t$7.26\tCash\tYes\t';
    const result = parseBulkExpenseImport(row, ACCOUNTS, WIDE_MAPPING, 2026, false);
    expect(result.rows).toHaveLength(1);
    const r = result.rows[0];
    expect(r.skipped).toBe(false);
    expect(r.entryDate).toBe('2026-07-04');
    expect(r.vendor).toBe('Burger king');
    expect(r.categoryAccountId).toBe(3);
    expect(r.moneyAccountId).toBe(1);
    expect(r.foreignAmountCents).toBe(528);
    expect(r.foreignCurrency).toBe('USD');
    expect(r.cadTotalCents).toBe(726);
    expect(r.exchangeRate).toBe(1.375);
    expect(r.taxCode).toBe('USTax');
    expect(r.isRefund).toBe(false);
  });

  it('parses a "D-Mon" date with no year using the assumed year, and maps Credit -> Visa', () => {
    const row = '19-Jul\tTaichi bubble tea\t\tMeals\tMeals\tUSD\t14.99\tUSA\t8%\t$1.20\t$16.19\t1.375\t$22.26\tCredit\tYes\t';
    const result = parseBulkExpenseImport(row, ACCOUNTS, WIDE_MAPPING, 2026, false);
    expect(result.rows[0].entryDate).toBe('2026-07-19');
    expect(result.rows[0].moneyAccountId).toBe(2);
  });

  it('treats "No Tax" rows as untagged with zero tax', () => {
    const row = '20-Jul\tShorem service\t\tfuel\tFuel\tUSD\t51.13\tUSA\tNo Tax\t-\t$51.13\t1.375\t$70.30\tCredit\tYes\t';
    const result = parseBulkExpenseImport(row, ACCOUNTS, WIDE_MAPPING, 2026, false);
    const r = result.rows[0];
    expect(r.categoryAccountId).toBe(4);
    expect(r.taxCode).toBeNull();
    expect(r.cadTotalCents).toBe(7030);
  });

  it('leaves "Manual Tax" rows tagged Manual with the given dollar amount', () => {
    const row = '13-Jun\tTarget\t\tMeals\tMeals\tUSD\t160.44\tUSA\tManual Tax\t$4.37\t$164.81\t1.375\t$226.61\tVisa\tYes\t';
    const result = parseBulkExpenseImport(row, ACCOUNTS, WIDE_MAPPING, 2026, false);
    const r = result.rows[0];
    expect(r.taxCode).toBe('Manual');
    expect(r.manualHstCents).toBe(437);
    expect(r.cadTotalCents).toBe(22661);
    expect(r.skipped).toBe(false);
  });

  it('detects a refund from a negative amount and keeps totals as positive magnitudes', () => {
    const row = '6-Jul\tHome Depot\t\tParts \tMaterials & Supplies\tUSD\t-124.01\tUSA\t8%\t($9.92)\t($133.93)\t1.375\t($184.15)\tCredit\tYes\t';
    const result = parseBulkExpenseImport(row, ACCOUNTS, WIDE_MAPPING, 2026, false);
    const r = result.rows[0];
    expect(r.isRefund).toBe(true);
    expect(r.cadTotalCents).toBe(18415);
    expect(r.categoryAccountId).toBe(5);
  });

  it('flags a row as skipped with a reason when the category has no account match', () => {
    const row = '1-Jul\tSome Vendor\t\tMystery\tCompletely Unknown Category\tUSD\t10.00\tUSA\t8%\t$0.80\t$10.80\t1.375\t$14.85\tCash\tYes\t';
    const result = parseBulkExpenseImport(row, ACCOUNTS, WIDE_MAPPING, 2026, false);
    const r = result.rows[0];
    expect(r.skipped).toBe(true);
    expect(r.skipReason).toContain('Completely Unknown Category');
  });

  it('flags a row as skipped when the payment method has no account match', () => {
    const row = '1-Jul\tSome Vendor\t\tMeals\tMeals\tUSD\t10.00\tUSA\t8%\t$0.80\t$10.80\t1.375\t$14.85\tPayPal\tYes\t';
    const result = parseBulkExpenseImport(row, ACCOUNTS, WIDE_MAPPING, 2026, false);
    expect(result.rows[0].skipped).toBe(true);
    expect(result.rows[0].skipReason).toContain('PayPal');
  });

  it('drops fully blank rows, but keeps a vendor-only row visible as skipped rather than silently dropping it', () => {
    const text = ['', '3-Jul\tTA-GULF\t\t\t\t\t\t\t\t\t\t\t\t\tYes\t', '\t\t\t\t\t\t\t\t\t\t\t\t\t\tYes\t'].join('\n');
    const result = parseBulkExpenseImport(text, ACCOUNTS, WIDE_MAPPING, 2026, false);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].vendor).toBe('TA-GULF');
    expect(result.rows[0].skipped).toBe(true);
  });

  it('handles a full real-world export: 27 valid, 2 skipped, 1 refund', () => {
    const text = [
      '7/4/2026\tBurger king\t\tMeals\tMeals\tUSD\t4.89\tUSA\t8%\t$0.39\t$5.28\t1.375\t$7.26\tCash\tYes\t',
      '7/17/2026\tNYF\t\tMeals\tMeals\tUSD\t11.18\tUSA\t8%\t$0.89\t$12.07\t1.375\t$16.60\tCredit\tYes\t',
      '7/20/2026\tDunkin Donuts\t\tMeals\tMeals\tUSD\t2.99\tUSA\t8%\t$0.24\t$3.23\t1.375\t$4.44\tCredit\tYes\t',
      '7/19/2026\tDunkin Donuts\t\tMeals\tMeals\tUSD\t3.69\tUSA\t8%\t$0.30\t$3.99\t1.375\t$5.49\tCash\tYes\t',
      '19-Jul\tTaichi bubble tea\t\tMeals\tMeals\tUSD\t14.99\tUSA\t8%\t$1.20\t$16.19\t1.375\t$22.26\tCredit\tYes\t',
      '20-Jul\tShorem service\t\tfuel\tFuel\tUSD\t51.13\tUSA\tNo Tax\t-\t$51.13\t1.375\t$70.30\tCredit\tYes\t',
      '20-Jul\tShorem service\t\tMeals\tMeals\tUSD\t12.97\tUSA\t8%\t$1.04\t$14.01\t1.375\t$19.26\tCash\tYes\t',
      '20-Jul\tTa-gulf\t\tfuel\tFuel\tUSD\t96.71\tUSA\tNo Tax\t-\t$96.71\t1.375\t$132.98\tCredit\tYes\t',
      '20-Jul\tAldi\t\tMeals\tMeals\tUSD\t11.82\tUSA\t8%\t$0.95\t$12.77\t1.375\t$17.56\tCredit\tYes\t',
      '7-Jun\tHome Depot\t\tParts \tMaterials & Supplies\tUSD\t6.9\tUSA\t8%\t$0.55\t$7.45\t1.375\t$10.24\tCredit\tYes\t',
      '6-Jul\tHome Depot\t\tParts \tMaterials & Supplies\tUSD\t-124.01\tUSA\t8%\t($9.92)\t($133.93)\t1.375\t($184.15)\tCredit\tYes\t',
      '6-Jul\tHome Depot\t\tMeals\tMeals\tUSD\t11.96\tUSA\t8%\t$0.96\t$12.92\t1.375\t$17.77\tCredit\tYes\t',
      '6-Jul\tHome Depot\t\tParts \tMaterials & Supplies\tUSD\t139.44\tUSA\t8%\t$11.16\t$150.60\t1.375\t$207.08\tCredit\tYes\t',
      '1-Jul\tPopeyes\t\tMeals\tMeals\tUSD\t16.15\tUSA\t8%\t$1.29\t$17.44\t1.375\t$23.98\tCredit\tYes\t',
      '1-Jul\tBurger king\t\tMeals\tMeals\tUSD\t29.43\tUSA\t8%\t$2.35\t$31.78\t1.375\t$43.70\tCredit\tYes\t',
      '1-Jul\tMcDonalds\t\tMeals\tMeals\tUSD\t5.47\tUSA\t8%\t$0.44\t$5.91\t1.375\t$8.13\tCash\tYes\t',
      '19-Jul\tSpeedyway\t\tfuel\tFuel\tUSD\t82.25\tUSA\tNo Tax\t-\t$82.25\t1.375\t$113.09\tVisa\tYes\t',
      '13-Jun\tTarget\t\tMeals\tMeals\tUSD\t160.44\tUSA\tManual Tax\t$4.37\t$164.81\t1.375\t$226.61\tVisa\tYes\t',
      '4-Jul\tHarbor Frieght\t\tParts \tMaterials & Supplies\tUSD\t88.96\tUSA\t8%\t$7.12\t$96.08\t1.375\t$132.11\tVisa\tYes\t',
      '16-Jul\tSunoco\t\tfuel\tFuel\tUSD\t139.51\tUSA\tNo Tax\t-\t$139.51\t1.375\t$191.83\tVisa\tYes\t',
      '17-Jul\tSunoco\t\tfuel\tFuel\tUSD\t200\tUSA\tNo Tax\t-\t$200.00\t1.375\t$275.00\tVisa\tYes\t',
      '17-Jul\t7-Eleven Store\t\tfuel\tFuel\tUSD\t80\tUSA\tNo Tax\t-\t$80.00\t1.375\t$110.00\tVisa\tYes\t',
      '17-Jul\tDunkin Donuts\t\tMeals\tMeals\tUSD\t11.28\tUSA\t8%\t$0.90\t$12.18\t1.375\t$16.75\tCash\tYes\t',
      '16-Jul\tPanera Bread\t\tMeals\tMeals\tUSD\t42.6\tUSA\t8%\t$3.41\t$46.01\t1.375\t$63.26\tCash\tYes\t',
      '3-Jul\tAdelitas\t\tMeals\tMeals\tUSD\t55.08\tUSA\tManual Tax\t$10.00\t$65.08\t1.375\t$89.49\tVisa\tYes\t',
      '5-Jul\t287 Store\t\tMeals\tMeals\tUSD\t2.88\tUSA\t8%\t$0.23\t$3.11\t1.375\t$4.28\tCash\tYes\t',
      '5-Jul\tPanera Bread\t\tMeals\tMeals\tUSD\t21.98\tUSA\t8%\t$1.76\t$23.74\t1.375\t$32.64\tCash\tYes\t',
      '3-Jul\tOlive Garden\t\tMeals\tMeals\tUSD\t59.74\tUSA\t8%\t$4.78\t$64.52\t1.375\t$88.72\t\tYes\t',
      '3-Jul\tTA-GULF\t\t\t\t\t\t\t\t\t\t\t\t\tYes\t',
      '\t\t\t\t\t\t\t\t\t\t\t\t\t\tYes\t',
      '\t\t\t\t\t\t\t\t\t\t\t\t\t\tYes\t',
    ].join('\n');

    const result = parseBulkExpenseImport(text, ACCOUNTS, WIDE_MAPPING, 2026, false);
    expect(result.rows).toHaveLength(29);
    expect(result.validCount).toBe(27);
    expect(result.skippedCount).toBe(2);

    const refunds = result.rows.filter((r) => r.isRefund);
    expect(refunds).toHaveLength(1);
    expect(refunds[0].vendor).toBe('Home Depot');
  });
});

describe('parseBulkExpenseImport (different, narrower layout — proves the parser is not tied to one client)', () => {
  // A different client's export: just Date, Vendor, Category, Payment Method, Amount (CAD) — no
  // foreign-currency columns, no tax columns, header row included this time.
  const NARROW_MAPPING: ColumnRole[] = ['date', 'vendor', 'category', 'paymentMethod', 'amount'];

  it('parses a plain domestic sheet with no FX or tax columns at all', () => {
    const text = ['Date\tVendor\tCategory\tPayment\tAmount', '2026-05-01\tEsso\tFuel\tVisa\t65.40'].join('\n');
    const result = parseBulkExpenseImport(text, ACCOUNTS, NARROW_MAPPING, 2026, true);
    expect(result.rows).toHaveLength(1);
    const r = result.rows[0];
    expect(r.skipped).toBe(false);
    expect(r.entryDate).toBe('2026-05-01');
    expect(r.categoryAccountId).toBe(4);
    expect(r.moneyAccountId).toBe(2);
    expect(r.cadTotalCents).toBe(6540);
    expect(r.foreignAmountCents).toBeNull();
    expect(r.taxCode).toBeNull();
  });

  it('computes the CAD amount from foreign total × rate when no direct amount column exists', () => {
    const mapping: ColumnRole[] = ['date', 'vendor', 'category', 'paymentMethod', 'foreignAmount', 'exchangeRate'];
    const row = '2026-05-01\tEsso\tFuel\tVisa\t50.00\t1.35';
    const result = parseBulkExpenseImport(row, ACCOUNTS, mapping, 2026, false);
    expect(result.rows[0].cadTotalCents).toBe(6750);
    expect(result.rows[0].foreignAmountCents).toBe(5000);
    expect(result.rows[0].foreignCurrency).toBe('USD');
    expect(result.rows[0].exchangeRate).toBe(1.35);
  });

  it('retains a supported non-USD currency from the mapped currency column', () => {
    const mapping: ColumnRole[] = ['date', 'vendor', 'category', 'paymentMethod', 'currency', 'foreignAmount', 'exchangeRate'];
    const result = parseBulkExpenseImport('2026-08-20\tParis Supplier\tMeals\tVisa\tEUR\t100.00\t1.61', ACCOUNTS, mapping, 2026, false);
    expect(result.rows[0].foreignCurrency).toBe('EUR');
    expect(result.rows[0].cadTotalCents).toBe(16_100);
  });
});
