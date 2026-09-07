# Banking foundation

Version `0.1.330` continues the controlled banking and reconciliation workstream.

- Dedicated transfers support bank, savings, and credit-card accounts.
- Transfers require two different active accounts, exact positive cents, a valid date, and an idempotency key.
- Each transfer posts one debit and one credit in a single transaction and becomes immutable.
- Import batches retain the source type and SHA-256 content identity, preventing the same file from being imported twice into the same account.
- Imported rows use a per-account deduplication hash and explicit unmatched, matched, or excluded state.
- Reconciliation storage tracks statement dates, opening and closing balances, cleared journal lines, completion, reopening reason, and version.
- Every banking table is protected by company-level row security, including client assignments for CPA firm seats.
- The web workspace can select a bank or credit-card account, scan a CSV statement, and review staged unmatched rows without posting them to the ledger.
- CSV intake has strict extension, size, row, binary/executable, active-content, and antivirus-test-signature checks before parsing.

OFX parsing, transaction matching/posting, reconciliation completion controls, and the future live-bank provider adapter are the next banking increments.
