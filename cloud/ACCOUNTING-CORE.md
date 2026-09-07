# Shared cloud accounting core

Version 0.1.318 introduces the first shared accounting-data boundary. It does
not copy a desktop `.company` file into cloud storage. Accounts, entries and
lines are normalized PostgreSQL records scoped by firm and company.

## Chart of Accounts

- Account codes remain optional internal data.
- Names are unique within a company.
- Parent/master accounts are represented without requiring a numbered code.
- A parent must belong to the same company.
- Essentials business owners may use provided categories, while account creation
  remains an accountant/administrator workflow.

## Journal posting

- Amounts are submitted as exact integer cents.
- At least two lines are required.
- Every line contains a debit or a credit, never both.
- Total debits must exactly equal total credits in both the API domain check and
  a PostgreSQL posting trigger.
- The entry, all lines, audit event, real-time event and idempotency response are
  committed in one transaction.
- A repeated request with the same idempotency key returns the original result;
  reusing the key for different data is rejected.
- Posted entries and lines are immutable. Corrections will use reversal entries.
- Locked periods reject posting at the database boundary.

## General Ledger

Only posted entries are returned. Every request is restricted by authenticated
firm membership, company context and active subscription. On Essentials, the
advanced General Ledger is available to the invited accountant/administrator,
not the business-owner interface.

## Multi-user behaviour

Database transactions prevent other users from observing a partly written
journal. After commit, the outbox publishes a company-scoped event so other
authorized seats can refresh the changed ledger. Record versions will be used by
editable workflows to reject silent overwrites.
