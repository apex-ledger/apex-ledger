# North Ledger 0.1.210 release-readiness checkpoint

## Existing screen/component inventory
A source inventory was generated containing 177 likely UI/accounting screen files for route consolidation review.

## Duplicate/orphan review rules
- No duplicate financial calculation screens.
- Dashboard widgets link to canonical reports.
- Customer/vendor centres link to canonical invoices/bills/payments rather than copies.
- Legacy routes may redirect but must not maintain separate posting logic.
- Every navigation item must resolve within the currently open company context.

## Windows installer readiness
Before final test release:
- package version/output folder must match release version;
- clean npm dependency install on Windows;
- native better-sqlite3 rebuild for Electron target;
- production renderer/main build succeeds;
- electron-builder creates a signed-or-clearly-test-labelled installer;
- installer uses a separate test application identity/data path so it cannot overwrite the current North Ledger installation/company files;
- fresh-install smoke test and upgrade/migration smoke test both pass;
- final installer and source archive are placed in an isolated D:\NorthLedger-Test\Final-Test folder by the user after download.

## Remaining release blockers
Accounting reversal implementation, reconciliation calculation implementation, regression execution with dependencies, route cleanup, and actual Windows installer build remain release blockers. They are not to be represented as complete until executed.
