import m0001 from './0001_init_company.sql?raw';
import m0002 from './0002_gifi_codes.sql?raw';
import m0003 from './0003_chart_of_accounts.sql?raw';
import m0004 from './0004_journal_entries.sql?raw';
import m0005 from './0005_fiscal_periods.sql?raw';
import m0006 from './0006_category_rules.sql?raw';
import m0007 from './0007_journal_line_tax_code.sql?raw';
import m0008 from './0008_manual_hst_cents.sql?raw';
import m0009 from './0009_payroll.sql?raw';
import m0010 from './0010_contacts_and_bills.sql?raw';
import m0011 from './0011_business_type_and_quick_method.sql?raw';
import m0012 from './0012_invoices.sql?raw';
import m0013 from './0013_bank_reconciliation.sql?raw';
import m0014 from './0014_foreign_currency.sql?raw';
import m0015 from './0015_td1_claims.sql?raw';
import m0016 from './0016_receipt_inbox.sql?raw';
import m0017 from './0017_receipt_quick_entries.sql?raw';
import m0018 from './0018_recurring_templates.sql?raw';
import m0019 from './0019_company_address_and_ids.sql?raw';
import m0020 from './0020_year_end_slips.sql?raw';
import m0021 from './0021_shareholders_and_t5.sql?raw';
import m0022 from './0022_undeposited_funds.sql?raw';
import m0023 from './0023_journal_entry_period.sql?raw';
import m0024 from './0024_account_number.sql?raw';
import m0025 from './0025_payroll_pay_breakdown.sql?raw';
import m0026 from './0026_journal_line_base_cents.sql?raw';
import m0027 from './0027_account_transfer_eligible.sql?raw';
import m0028 from './0028_shareholder_loan_account.sql?raw';
import m0029 from './0029_journal_line_contact_and_adjusting.sql?raw';
import m0030 from './0030_contact_default_expense_account.sql?raw';
import m0031 from './0031_sales_receipts.sql?raw';
import m0032 from './0032_t5018_contractor.sql?raw';
import m0033 from './0033_bank_import_exclusions.sql?raw';
import m0034 from './0034_wsib.sql?raw';
import m0035 from './0035_employee_benefits.sql?raw';
import m0036 from './0036_bank_import_row_progress.sql?raw';
import m0037 from './0037_gifi_backfill_unmapped.sql?raw';
import m0038 from './0038_employee_address.sql?raw';
import m0039 from './0039_hst_filings.sql?raw';
import m0040 from './0040_credit_notes.sql?raw';
import m0041 from './0041_vacation_accrual.sql?raw';
import m0042 from './0042_cpa_notes.sql?raw';
import m0043 from './0043_workpapers.sql?raw';
import m0044 from './0044_petty_cash_to_cash_account.sql?raw';
import m0045 from './0045_journal_entry_revisions.sql?raw';
import m0046 from './0046_inventory.sql?raw';
import m0047 from './0047_cca_and_loans.sql?raw';
import m0048 from './0048_budgets.sql?raw';
import m0049 from './0049_invoice_line_products.sql?raw';
import m0050 from './0050_tags.sql?raw';
import m0051 from './0051_bill_approval.sql?raw';
import m0052 from './0052_payment_terms.sql?raw';
import m0053 from './0053_invoice_payment_account.sql?raw';
import m0054 from './0054_estimates_and_purchase_orders.sql?raw';
import m0055 from './0055_mileage.sql?raw';
import m0056 from './0056_partial_payments.sql?raw';
import m0057 from './0057_purchase_order_receipts.sql?raw';
import m0058 from './0058_po_partial_receipts_and_grni_match.sql?raw';
import m0059 from './0059_inventory_source_links.sql?raw';
import m0060 from './0060_recurring_schedule.sql?raw';
import m0061 from './0061_vendor_bill_number.sql?raw';
import m0062 from './0062_hst_filing_period_lock.sql?raw';
import m0063 from './0063_po_receipt_movement_links.sql?raw';
import m0064 from './0064_account_master_flag.sql?raw';
import m0065 from './0065_invoice_discounts.sql?raw';
import m0066 from './0066_company_users.sql?raw';
import m0067 from './0067_item_catalogue_links.sql?raw';
import m0068 from './0068_audit_engagement_file.sql?raw';
import m0069 from './0069_practical_document_fields.sql?raw';
import m0070 from './0070_multi_user_activity.sql?raw';
import m0071 from './0071_credit_note_applications.sql?raw';
import m0072 from './0072_staff_sign_in_log.sql?raw';
import m0073 from './0073_bill_lines.sql?raw';
import m0074 from './0074_sales_orders.sql?raw';
import m0075 from './0075_multi_currency.sql?raw';
import m0076 from './0076_attachments.sql?raw';
import m0077 from './0077_recurring_invoices.sql?raw';
import m0078 from './0078_time_entries.sql?raw';
import m0079 from './0079_direct_deposit.sql?raw';
import m0080 from './0080_payroll_items.sql?raw';
import m0081 from './0081_product_types.sql?raw';
import m0082 from './0082_item_master.sql?raw';
import m0083 from './0083_item_master_vendor_fk.sql?raw';
import m0084 from './0084_company_filing_settings.sql?raw';
import m0085 from './0085_fixed_assets.sql?raw';
import m0086 from './0086_approvals.sql?raw';
import m0087 from './0087_dedupe_filing_locks.sql?raw';
import m0088 from './0088_dedupe_backfilled_rows.sql?raw';
import m0089 from './0089_recurring_bills.sql?raw';
import m0090 from './0090_employer_health_tax.sql?raw';
import m0091 from './0091_late_interest.sql?raw';
import m0092 from './0092_company_logo.sql?raw';
import m0093 from './0093_year_end_signoffs.sql?raw';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  { version: 1, name: 'init_company', sql: m0001 },
  { version: 2, name: 'gifi_codes', sql: m0002 },
  { version: 3, name: 'chart_of_accounts', sql: m0003 },
  { version: 4, name: 'journal_entries', sql: m0004 },
  { version: 5, name: 'fiscal_periods', sql: m0005 },
  { version: 6, name: 'category_rules', sql: m0006 },
  { version: 7, name: 'journal_line_tax_code', sql: m0007 },
  { version: 8, name: 'manual_hst_cents', sql: m0008 },
  { version: 9, name: 'payroll', sql: m0009 },
  { version: 10, name: 'contacts_and_bills', sql: m0010 },
  { version: 11, name: 'business_type_and_quick_method', sql: m0011 },
  { version: 12, name: 'invoices', sql: m0012 },
  { version: 13, name: 'bank_reconciliation', sql: m0013 },
  { version: 14, name: 'foreign_currency', sql: m0014 },
  { version: 15, name: 'td1_claims', sql: m0015 },
  { version: 16, name: 'receipt_inbox', sql: m0016 },
  { version: 17, name: 'receipt_quick_entries', sql: m0017 },
  { version: 18, name: 'recurring_templates', sql: m0018 },
  { version: 19, name: 'company_address_and_ids', sql: m0019 },
  { version: 20, name: 'year_end_slips', sql: m0020 },
  { version: 21, name: 'shareholders_and_t5', sql: m0021 },
  { version: 22, name: 'undeposited_funds', sql: m0022 },
  { version: 23, name: 'journal_entry_period', sql: m0023 },
  { version: 24, name: 'account_number', sql: m0024 },
  { version: 25, name: 'payroll_pay_breakdown', sql: m0025 },
  { version: 26, name: 'journal_line_base_cents', sql: m0026 },
  { version: 27, name: 'account_transfer_eligible', sql: m0027 },
  { version: 28, name: 'shareholder_loan_account', sql: m0028 },
  { version: 29, name: 'journal_line_contact_and_adjusting', sql: m0029 },
  { version: 30, name: 'contact_default_expense_account', sql: m0030 },
  { version: 31, name: 'sales_receipts', sql: m0031 },
  { version: 32, name: 't5018_contractor', sql: m0032 },
  { version: 33, name: 'bank_import_exclusions', sql: m0033 },
  { version: 34, name: 'wsib', sql: m0034 },
  { version: 35, name: 'employee_benefits', sql: m0035 },
  { version: 36, name: 'bank_import_row_progress', sql: m0036 },
  { version: 37, name: 'gifi_backfill_unmapped', sql: m0037 },
  { version: 38, name: 'employee_address', sql: m0038 },
  { version: 39, name: 'hst_filings', sql: m0039 },
  { version: 40, name: 'credit_notes', sql: m0040 },
  { version: 41, name: 'vacation_accrual', sql: m0041 },
  { version: 42, name: 'cpa_notes', sql: m0042 },
  { version: 43, name: 'workpapers', sql: m0043 },
  { version: 44, name: 'petty_cash_to_cash_account', sql: m0044 },
  { version: 45, name: 'journal_entry_revisions', sql: m0045 },
  { version: 46, name: 'inventory', sql: m0046 },
  { version: 47, name: 'cca_and_loans', sql: m0047 },
  { version: 48, name: 'budgets', sql: m0048 },
  { version: 49, name: 'invoice_line_products', sql: m0049 },
  { version: 50, name: 'tags', sql: m0050 },
  { version: 51, name: 'bill_approval', sql: m0051 },
  { version: 52, name: 'payment_terms', sql: m0052 },
  { version: 53, name: 'invoice_payment_account', sql: m0053 },
  { version: 54, name: 'estimates_and_purchase_orders', sql: m0054 },
  { version: 55, name: 'mileage', sql: m0055 },
  { version: 56, name: 'partial_payments', sql: m0056 },
  { version: 57, name: 'purchase_order_receipts', sql: m0057 },
  { version: 58, name: 'po_partial_receipts_and_grni_match', sql: m0058 },
  { version: 59, name: 'inventory_source_links', sql: m0059 },
  { version: 60, name: 'recurring_schedule', sql: m0060 },
  { version: 61, name: 'vendor_bill_number', sql: m0061 },
  { version: 62, name: 'hst_filing_period_lock', sql: m0062 },
  { version: 63, name: 'po_receipt_movement_links', sql: m0063 },
  { version: 64, name: 'account_master_flag', sql: m0064 },
  { version: 65, name: 'invoice_discounts', sql: m0065 },
  { version: 66, name: 'company_users', sql: m0066 },
  { version: 67, name: 'item_catalogue_links', sql: m0067 },
  { version: 68, name: 'audit_engagement_file', sql: m0068 },
  { version: 69, name: 'practical_document_fields', sql: m0069 },
  { version: 70, name: 'multi_user_activity', sql: m0070 },
  { version: 71, name: 'credit_note_applications', sql: m0071 },
  { version: 72, name: 'staff_sign_in_log', sql: m0072 },
  { version: 73, name: 'bill_lines', sql: m0073 },
  { version: 74, name: 'sales_orders', sql: m0074 },
  { version: 75, name: 'multi_currency', sql: m0075 },
  { version: 76, name: 'attachments', sql: m0076 },
  { version: 77, name: 'recurring_invoices', sql: m0077 },
  { version: 78, name: 'time_entries', sql: m0078 },
  { version: 79, name: 'direct_deposit', sql: m0079 },
  { version: 80, name: 'payroll_items', sql: m0080 },
  { version: 81, name: 'product_types', sql: m0081 },
  { version: 82, name: 'item_master', sql: m0082 },
  { version: 83, name: 'item_master_vendor_fk', sql: m0083 },
  { version: 84, name: 'company_filing_settings', sql: m0084 },
  { version: 85, name: 'fixed_assets', sql: m0085 },
  { version: 86, name: 'approvals', sql: m0086 },
  { version: 87, name: 'dedupe_filing_locks', sql: m0087 },
  { version: 88, name: 'dedupe_backfilled_rows', sql: m0088 },
  { version: 89, name: 'recurring_bills', sql: m0089 },
  { version: 90, name: 'employer_health_tax', sql: m0090 },
  { version: 91, name: 'late_interest', sql: m0091 },
  { version: 92, name: 'company_logo', sql: m0092 },
  { version: 93, name: 'year_end_signoffs', sql: m0093 },
];
