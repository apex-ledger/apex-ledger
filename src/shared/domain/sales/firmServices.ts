/** The services an accounting or bookkeeping firm sells.
 *
 * One list, used twice: company setup seeds it into Items & Prices when the business type is a
 * firm, so every service is a real item with its own price that the firm edits in one place; and
 * the invoice rail offers the same names for anything not yet saved. A firm that sells something
 * not on the list types it once and it becomes an item like the rest.
 */

export const ACCOUNTING_FIRM_BUSINESS_TYPE = 'bookkeeping_accounting';

export function isAccountingFirm(businessType: string | null | undefined): boolean {
  return businessType === ACCOUNTING_FIRM_BUSINESS_TYPE;
}

export const FIRM_SERVICE_GROUPS = [
  { category: 'Personal Tax', fees: ['T1 Personal Tax Return', 'T1 Self-Employed / T2125', 'T1 Rental Property / T776', 'T1 Investment & Capital Gains', 'T1 Foreign Property / T1135', 'T1 Final Return — Deceased', 'T1 Adjustment / ReFILE', 'Personal Tax Planning', 'CRA Review Letter Response'] },
  { category: 'Corporate Tax', fees: ['T2 Corporate Tax Return', 'Nil T2 Corporate Return', 'Corporate Tax Provision', 'Corporate Year-End Adjusting Entries', 'T2 Amendment / Reassessment', 'Corporate Tax Planning', 'Owner Salary / Dividend Planning', 'Corporate Reorganization / Section 85 Rollover', 'SR&ED Tax Credit Claim', 'Corporate Tax Instalment Review'] },
  { category: 'Trust & Estate', fees: ['T3 Trust Return', 'Estate Accounting', 'Estate Tax Return Package', 'Trust Beneficial Ownership Reporting', 'CRA Clearance Certificate Request', 'Trust / Estate Tax Planning'] },
  { category: 'Sales Tax', fees: ['GST/HST Registration', 'GST/HST Return — Monthly', 'GST/HST Return — Quarterly', 'GST/HST Return — Annual', 'GST/HST Quick Method Review', 'GST/HST Audit Support', 'PST Return', 'QST Return', 'Provincial Sales Tax Registration', 'Sales Tax Reconciliation'] },
  { category: 'Payroll & Slips', fees: ['Payroll Setup', 'Payroll Processing', 'Payroll Remittance / PD7A', 'T4 Slips & Summary', 'T4A Slips & Summary', 'T5 Slips & Summary', 'T5018 Contractor Slips', 'NR4 Slips & Summary', 'Record of Employment / ROE', 'WSIB / WCB Filing', 'Employer Health Tax / EHT Filing', 'Payroll Year-End Reconciliation'] },
  { category: 'Bookkeeping', fees: ['Monthly Bookkeeping', 'Quarterly Bookkeeping', 'Annual Bookkeeping', 'Catch-Up Bookkeeping', 'Bookkeeping Cleanup / Review', 'Bank & Credit Card Reconciliation', 'Accounts Receivable Management', 'Accounts Payable Management', 'Month-End Close', 'Year-End Working Papers', 'Cloud Accounting Setup', 'Accounting Software Training', 'Data Migration / Opening Balances'] },
  { category: 'Financial Statements', fees: ['Compilation Engagement — CSRS 4200', 'Notice to Reader — Legacy Service', 'Review Engagement', 'Audit Engagement', 'Special-Purpose Financial Statements', 'Internal Control Review', 'Non-Profit Financial Statement Engagement', 'Financial Statement Preparation', 'Working Papers Preparation'] },
  { category: 'CRA & Compliance', fees: ['Tax Filing Fee', 'CRA Represent a Client Authorization', 'CRA Audit Representation', 'CRA Objection / Appeal Support', 'CRA Voluntary Disclosure', 'CRA Collections / Payment Arrangement', 'T3010 Charity Return', 'T1044 Non-Profit Return', 'T106 Related Non-Resident Transactions', 'T1134 Foreign Affiliate Reporting', 'Corporate Annual Return', 'Minute Book Maintenance', 'Business Number / Program Account Registration'] },
  { category: 'Advisory', fees: ['CPA Consultation — Hourly', 'Fractional CFO / Controller', 'Budget & Forecast Preparation', 'Cash Flow Forecast', 'Management Reporting Package', 'Business Plan / Financial Projections', 'Business Valuation', 'Due Diligence', 'Business Purchase / Sale Advisory', 'Succession Planning', 'Financing / Lender Package', 'Incorporation Assistance', 'Corporate Dissolution Assistance', 'Accounting Policy & Process Review'] },
] as const;

export const FIRM_SERVICES: string[] = FIRM_SERVICE_GROUPS.flatMap((group) => [...group.fees]);

/** The catalogue names the firm has not saved as items yet — compared without regard to case or
 * surrounding spaces, so "monthly bookkeeping" saved by hand is not seeded a second time. */
export function missingFirmServices(existingNames: string[]): string[] {
  const have = new Set(existingNames.map((name) => name.trim().toLowerCase()));
  return FIRM_SERVICES.filter((name) => !have.has(name.toLowerCase()));
}
