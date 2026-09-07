# North Ledger 0.1.214 — executable validation gate

## Objective
Stop accepting design-only completion. The next release stage must execute the application test/build toolchain in a compatible environment.

## Required commands on clean Windows build environment
1. `npm ci` (or documented clean install if lockfile requires npm install)
2. native Electron/better-sqlite3 rebuild
3. TypeScript / production build
4. automated test suite
5. accounting regression fixture
6. electron-builder Windows installer

## Mandatory smoke tests
- create new Ontario company; company tax defaults correctly;
- create second company and prove COA/customer/vendor isolation;
- PO -> receive -> GRNI -> supplier invoice match -> AP;
- partial vendor payment and AP aging;
- inventory invoice -> AR/revenue/HST + COGS/inventory atomically;
- two customer receipts and AR aging;
- HST prepare/file then separate CRA settlement;
- reversal restores complete accounting/subledger effect;
- AR/AP/Inventory/HST/Undeposited Funds reconciliation = zero on clean fixture;
- Trial Balance balances; P&L/Balance Sheet/GIFI agree;
- close/reopen company and confirm persisted results.

## Installer isolation
Final test build must use a distinct app name/application id and test data path. It must not reuse the production North Ledger user-data directory.

## Current status
The source checkpoint is prepared for this gate. Full executable validation is not claimed in this environment until dependencies/build tools can actually run.
