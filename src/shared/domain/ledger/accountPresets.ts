import type { AccountType } from '../types';

/** The kinds of account you can pick when creating one — "Chequing account", "Credit card",
 * "Equipment" — and what each one means to the rest of the app.
 *
 * There are two levels here on purpose, the same split QuickBooks makes between an account type and
 * a detail type. `subtype` is the classification the code actually branches on: an account only
 * counts as cash in the Statement of Cash Flows, and only appears in a "Paid From" picker, when its
 * subtype is exactly 'Cash and Bank'. `label` is what a person recognises. Letting someone type
 * "Chequing" into the subtype box, as they could before, produced an account that looked right and
 * was invisible to both — so the picker offers the labels and stores the classification.
 *
 * Adding a preset is safe; inventing a new `subtype` string is not, unless the code that reads
 * subtypes is taught about it at the same time. The test alongside this file enforces that.
 */

export interface AccountPreset {
  /** Shown in the picker. */
  label: string;
  accountType: AccountType;
  /** The stored classification. Must be one of the values the reports and pickers understand. */
  subtype: string;
  /** Pre-fills the account name, since it is nearly always the label itself. */
  suggestedName?: string;
  /** Bank, cash, and credit-card accounts are the ones money moves between. */
  transferEligible?: boolean;
  /** Shown under the picker once chosen, so the consequence of the choice is visible. */
  hint?: string;
}

/** Every subtype string the rest of the app branches on. A preset may not introduce others. */
export const KNOWN_SUBTYPES = [
  'Cash and Bank',
  'Current Asset',
  'Capital Asset',
  'Credit Card',
  'Current Liability',
  'Long-Term Liability',
  'Share Capital',
  'Equity',
  'Revenue',
  'Cost of Sales',
  'Operating Expense',
] as const;

export const ACCOUNT_PRESETS: AccountPreset[] = [
  // ---- Asset ----
  {
    label: 'Chequing account',
    accountType: 'Asset',
    subtype: 'Cash and Bank',
    suggestedName: 'Chequing',
    transferEligible: true,
    hint: 'Counts as cash on the Statement of Cash Flows and appears in "Paid From" pickers.',
  },
  {
    label: 'Savings account',
    accountType: 'Asset',
    subtype: 'Cash and Bank',
    suggestedName: 'Savings',
    transferEligible: true,
    hint: 'Counts as cash on the Statement of Cash Flows and appears in "Paid From" pickers.',
  },
  {
    label: 'Cash on hand / petty cash',
    accountType: 'Asset',
    subtype: 'Cash and Bank',
    suggestedName: 'Petty Cash',
    transferEligible: true,
    hint: 'Counts as cash on the Statement of Cash Flows.',
  },
  {
    label: 'Trust account',
    accountType: 'Asset',
    subtype: 'Cash and Bank',
    suggestedName: 'Trust Account',
    transferEligible: true,
  },
  { label: 'Accounts receivable', accountType: 'Asset', subtype: 'Current Asset', suggestedName: 'Accounts Receivable' },
  { label: 'Inventory', accountType: 'Asset', subtype: 'Current Asset', suggestedName: 'Inventory' },
  { label: 'Prepaid expenses', accountType: 'Asset', subtype: 'Current Asset', suggestedName: 'Prepaid Expenses' },
  { label: 'Other current asset', accountType: 'Asset', subtype: 'Current Asset' },
  {
    label: 'Equipment',
    accountType: 'Asset',
    subtype: 'Capital Asset',
    suggestedName: 'Equipment',
    hint: 'Treated as an investing activity on the Statement of Cash Flows.',
  },
  { label: 'Vehicle', accountType: 'Asset', subtype: 'Capital Asset', suggestedName: 'Vehicle' },
  { label: 'Furniture and fixtures', accountType: 'Asset', subtype: 'Capital Asset', suggestedName: 'Furniture & Fixtures' },
  { label: 'Building', accountType: 'Asset', subtype: 'Capital Asset', suggestedName: 'Building' },
  { label: 'Land', accountType: 'Asset', subtype: 'Capital Asset', suggestedName: 'Land' },
  {
    label: 'Accumulated depreciation',
    accountType: 'Asset',
    subtype: 'Capital Asset',
    suggestedName: 'Accumulated Depreciation',
    hint: 'A contra-asset: it carries a credit balance and reduces the capital assets above it.',
  },

  // ---- Liability ----
  {
    label: 'Credit card',
    accountType: 'Liability',
    subtype: 'Credit Card',
    suggestedName: 'Credit Card',
    transferEligible: true,
    hint: 'Appears in "Paid From" pickers, so card purchases can be entered directly.',
  },
  { label: 'Accounts payable', accountType: 'Liability', subtype: 'Current Liability', suggestedName: 'Accounts Payable' },
  { label: 'GST/HST payable', accountType: 'Liability', subtype: 'Current Liability', suggestedName: 'GST/HST Payable' },
  { label: 'Payroll liabilities', accountType: 'Liability', subtype: 'Current Liability', suggestedName: 'Payroll Liabilities' },
  { label: 'Income tax payable', accountType: 'Liability', subtype: 'Current Liability', suggestedName: 'Income Tax Payable' },
  { label: 'Other current liability', accountType: 'Liability', subtype: 'Current Liability' },
  {
    label: 'Bank loan',
    accountType: 'Liability',
    subtype: 'Long-Term Liability',
    suggestedName: 'Bank Loan',
    hint: 'Treated as a financing activity on the Statement of Cash Flows.',
  },
  { label: 'Mortgage', accountType: 'Liability', subtype: 'Long-Term Liability', suggestedName: 'Mortgage' },
  {
    label: 'Shareholder loan',
    accountType: 'Liability',
    subtype: 'Long-Term Liability',
    suggestedName: 'Shareholder Loan',
    transferEligible: true,
  },

  // ---- Equity ----
  { label: 'Share capital', accountType: 'Equity', subtype: 'Share Capital', suggestedName: 'Share Capital' },
  { label: 'Retained earnings', accountType: 'Equity', subtype: 'Equity', suggestedName: 'Retained Earnings' },
  {
    label: "Owner's contributions",
    accountType: 'Equity',
    subtype: 'Equity',
    suggestedName: "Owner's Contributions",
    transferEligible: true,
  },
  {
    label: "Owner's draws",
    accountType: 'Equity',
    subtype: 'Equity',
    suggestedName: "Owner's Draws",
    transferEligible: true,
  },
  { label: 'Dividends declared', accountType: 'Equity', subtype: 'Equity', suggestedName: 'Dividends Declared' },
  { label: 'Other equity', accountType: 'Equity', subtype: 'Equity' },

  // ---- Revenue ----
  { label: 'Sales', accountType: 'Revenue', subtype: 'Revenue', suggestedName: 'Sales' },
  { label: 'Service revenue', accountType: 'Revenue', subtype: 'Revenue', suggestedName: 'Service Revenue' },
  { label: 'Interest income', accountType: 'Revenue', subtype: 'Revenue', suggestedName: 'Interest Income' },
  { label: 'Other income', accountType: 'Revenue', subtype: 'Revenue', suggestedName: 'Other Income' },

  // ---- Expense ----
  {
    label: 'Cost of goods sold',
    accountType: 'Expense',
    subtype: 'Cost of Sales',
    suggestedName: 'Cost of Goods Sold',
    hint: 'Grouped under cost of sales rather than operating expenses on the income statement.',
  },
  { label: 'Purchases', accountType: 'Expense', subtype: 'Cost of Sales', suggestedName: 'Purchases' },
  { label: 'Freight and delivery', accountType: 'Expense', subtype: 'Cost of Sales', suggestedName: 'Freight & Delivery' },
  { label: 'Rent', accountType: 'Expense', subtype: 'Operating Expense', suggestedName: 'Rent' },
  { label: 'Utilities', accountType: 'Expense', subtype: 'Operating Expense', suggestedName: 'Utilities' },
  { label: 'Insurance', accountType: 'Expense', subtype: 'Operating Expense', suggestedName: 'Insurance' },
  { label: 'Professional fees', accountType: 'Expense', subtype: 'Operating Expense', suggestedName: 'Professional Fees' },
  { label: 'Advertising and promotion', accountType: 'Expense', subtype: 'Operating Expense', suggestedName: 'Advertising & Promotion' },
  { label: 'Vehicle and fuel', accountType: 'Expense', subtype: 'Operating Expense', suggestedName: 'Vehicle & Fuel' },
  { label: 'Office supplies', accountType: 'Expense', subtype: 'Operating Expense', suggestedName: 'Office Supplies' },
  { label: 'Repairs and maintenance', accountType: 'Expense', subtype: 'Operating Expense', suggestedName: 'Repairs & Maintenance' },
  { label: 'Telephone and internet', accountType: 'Expense', subtype: 'Operating Expense', suggestedName: 'Telephone & Internet' },
  { label: 'Bank charges and interest', accountType: 'Expense', subtype: 'Operating Expense', suggestedName: 'Bank Charges & Interest' },
  { label: 'Wages and salaries', accountType: 'Expense', subtype: 'Operating Expense', suggestedName: 'Wages & Salaries' },
  { label: 'Meals and entertainment', accountType: 'Expense', subtype: 'Operating Expense', suggestedName: 'Meals & Entertainment' },
  {
    label: 'Depreciation and amortization',
    accountType: 'Expense',
    subtype: 'Operating Expense',
    suggestedName: 'Depreciation',
    hint: 'Added back as a non-cash expense on the Statement of Cash Flows.',
  },
  { label: 'Other operating expense', accountType: 'Expense', subtype: 'Operating Expense' },
];

export function presetsForAccountType(accountType: AccountType): AccountPreset[] {
  return ACCOUNT_PRESETS.filter((p) => p.accountType === accountType);
}

export function findPreset(accountType: AccountType, label: string): AccountPreset | undefined {
  return ACCOUNT_PRESETS.find((p) => p.accountType === accountType && p.label === label);
}
