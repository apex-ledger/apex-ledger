# North Ledger 0.1.211 — release blocker board

## P0 — must be implemented and executed before test release

### 1. Posted-document reversal service
Status: implementation required.
Acceptance: reversing a posted source creates a linked equal/opposite journal, preserves original, respects lock dates, and reverses all linked subledger effects.

### 2. Reconciliation calculations
Status: implementation required.
Acceptance: AR, AP, Inventory, GST/HST and Undeposited Funds each calculate GL vs subledger difference for the open company/as-of date and drill to contributors.

### 3. Regression execution
Status: blocked until clean project dependencies can be installed in a compatible build environment.
Acceptance: known-number fixture plus existing automated tests pass; Trial Balance and financial statements reconcile.

### 4. Windows installer
Status: blocked until production build succeeds.
Acceptance: separate North Ledger Test identity/data path; clean install; database migration smoke test; launch/close/relaunch; no impact on existing installation.

## P1 — finish before Ultimate Suite sign-off
- Canonical route cleanup for duplicate/orphan screens.
- Consistent icon/status/action vocabulary.
- Report export/print parity with on-screen totals.
- GIFI validation and fiscal-period regression.
- HST filed-period adjustment UX.
- Backup/restore verification.

## Rule
No item is marked complete based on a design note alone. Completion requires code plus an executable validation appropriate to that item.
