# Apex Ledger subscription model

## Apex Ledger Essentials

Designed for a non-accountant business owner. The working interface contains
simple sales, expense and sales-tax entry, document upload and understandable
summaries. Advanced accounting and payroll are hidden. The owner can invite an
accountant, who receives a review and limited adjusting-entry workflow for tax
preparation without copying or emailing the accounting file.

## Apex Ledger Accounting

Includes the accounting ledger, sales, purchases, banking, HST, reports,
documents, compliance tools and the firm's allocated user seats. Payroll entry
and payroll calculation are unavailable.

## Apex Ledger Accounting + Payroll

Includes everything in Apex Ledger Accounting plus payroll setup, payroll runs,
remittances, paystubs and payroll reporting. A user's firm role must separately
allow payroll; buying the plan does not grant every seat access to employee data.

## Upgrade and downgrade rules

- Upgrading changes an entitlement; no reinstall or company-file conversion is
  required.
- The billing webhook applies changes using an idempotent provider event id.
- Ordinary firm users cannot directly alter a paid entitlement.
- An active or trial subscription permits writes.
- A past-due subscription is read-only while payment is resolved.
- A canceled subscription has no application access, subject to the contractual
  export and retention process.
- After a payroll downgrade, existing payroll history remains readable but new
  payroll runs are blocked. Payroll history is never deleted by a plan change.

Prices are intentionally not embedded in the application schema. They will be
configured in the payment provider so prices can change without a software
release.
