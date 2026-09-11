import { describe, expect, it } from 'vitest';
import { GIFI_CODES_SEED } from './gifi_codes.seed';
import { BUSINESS_TYPE_EXPENSE_CATEGORIES } from '@shared/domain/businessTypes';
import { RETAIL_TEMPLATE } from './coa_template.retail.seed';
import { GENERAL_SERVICES_TEMPLATE } from './coa_template.general_services.seed';
import { OPENING_BALANCE_ACCOUNTS_SEED } from './openingBalanceAccounts.seed';
import { CATEGORY_RULES_SEED } from './categoryRules.seed';
import { ACCOUNTS_RECEIVABLE_ARGS, ACCOUNTS_PAYABLE_ARGS, UNDEPOSITED_FUNDS_ACCOUNT_ARGS, EXCHANGE_GAIN_LOSS_ACCOUNT_ARGS } from '../controlAccounts';

/** The account mappings that leave the app: every seeded account's GIFI item, and the bank-import
 * rules that name accounts. gifiCodeReferences.test.ts proves each code exists; this proves each
 * one is the right kind of code (statement, side, not a CRA total line) and that every import
 * rule can actually resolve in at least one chart of accounts. */

const gifi = new Map(GIFI_CODES_SEED.map((g) => [g.code, g]));
/** Schedule 100/125 lines CRA computes from the detail items. Mapping an account to one
 * double-counts it; gifiExport refuses them. */
const CRA_TOTAL_LINES = new Set(['1599', '2008', '2009', '2179', '2589', '2599', '3499', '3620', '3640', '3849', '8089', '8299', '8518', '8519', '9367', '9368', '9369', '9970', '9998', '9999']);

type Seeded = { name: string; accountType: string; gifiCode?: string | null };
const sideOf = (t: string) => (t === 'Revenue' || t === 'Expense' ? 'IncomeStatement' : 'BalanceSheet');
function usualRange(type: string, code: number): boolean {
  if (type === 'Asset') return code >= 1000 && code < 2599;
  if (type === 'Liability') return code >= 2600 && code < 3499;
  if (type === 'Equity') return code >= 3500 && code <= 3849;
  if (type === 'Revenue') return code >= 8000 && code <= 8299;
  if (type === 'Expense') return code >= 8300 && code <= 9366;
  return false;
}

const SETS: [string, Seeded[]][] = [
  ['general-services template', GENERAL_SERVICES_TEMPLATE.accounts],
  ['retail template', RETAIL_TEMPLATE.accounts],
  ['opening-balance accounts', OPENING_BALANCE_ACCOUNTS_SEED],
  ['control accounts', [ACCOUNTS_RECEIVABLE_ARGS, ACCOUNTS_PAYABLE_ARGS, UNDEPOSITED_FUNDS_ACCOUNT_ARGS, EXCHANGE_GAIN_LOSS_ACCOUNT_ARGS].map((a) => ({ name: a[0], accountType: a[1], gifiCode: a[3] }))],
  ...Object.entries(BUSINESS_TYPE_EXPENSE_CATEGORIES).map(([type, cats]) => [`business type ${type}`, cats.map((c) => ({ name: c.name, accountType: c.accountSubtype === 'Revenue' ? 'Revenue' : 'Expense', gifiCode: c.gifiCode }))] as [string, Seeded[]]),
];

describe('seeded GIFI mappings', () => {
  it('put every account on its own statement and side, never on a CRA total line', () => {
    const problems: string[] = [];
    for (const [label, accounts] of SETS) {
      for (const a of accounts) {
        if (!a.gifiCode) continue; // deliberate: see the comment on each null in the seed
        const g = gifi.get(a.gifiCode);
        if (!g) { problems.push(`${label}: "${a.name}" -> ${a.gifiCode} is not in the seed`); continue; }
        if (g.statementType !== sideOf(a.accountType)) problems.push(`${label}: "${a.name}" (${a.accountType}) -> ${a.gifiCode} is on the ${g.statementType}`);
        if (CRA_TOTAL_LINES.has(a.gifiCode)) problems.push(`${label}: "${a.name}" -> ${a.gifiCode} is a CRA total line`);
        // Exchange Gain/Loss is an expense account by construction but files on the revenue-side
        // item CRA provides for it; gifiExport flips its sign.
        if (!usualRange(a.accountType, Number(a.gifiCode)) && a.gifiCode !== '8231') problems.push(`${label}: "${a.name}" (${a.accountType}) -> ${a.gifiCode} "${g.description}" is outside the range for its type`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('seeded bank-import rules', () => {
  it('each name an account that at least one chart-of-accounts template has', () => {
    const names = new Set([...GENERAL_SERVICES_TEMPLATE.accounts, ...RETAIL_TEMPLATE.accounts].map((a) => a.name));
    const dead = CATEGORY_RULES_SEED.filter((r) => !names.has(r.accountName)).map((r) => `${r.pattern} -> ${r.accountName}`);
    expect(dead).toEqual([]);
  });
});
