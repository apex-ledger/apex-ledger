# Vendor bills and Accounts Payable

Version `0.1.324` adds the cloud vendor-bill workflow for Accounting subscriptions.

## Controls implemented

- Bills are company-scoped and require an active writable firm role.
- The same supplier invoice number cannot be posted twice for one vendor and company, including after a void.
- Each bill receives a concurrency-safe internal bill number.
- Multi-line expense postings calculate HST 13%, exempt tax, or explicit manual HST in exact cents.
- Posting debits expense and HST Recoverable and credits Accounts Payable in one database transaction.
- Payments debit Accounts Payable and credit a validated bank account; overpayments and dates before the bill are rejected.
- Posted bill content and lines are immutable. Unpaid bills may be voided only through a dated, explained reversal.
- Vendor bill, payment, status, tax, audit, and realtime outbox records stay company-scoped under row-level security.

## Verified locally

- API and domain suite: 43 passing tests.
- Production web TypeScript and Vite build: passing.
- Embedded PostgreSQL applies migrations `001`-`015` and proves a balanced bill and vendor-payment journal plus the ITC tax event.

Live Entra browser testing and native Azure PostgreSQL verification remain part of the pilot gate.
