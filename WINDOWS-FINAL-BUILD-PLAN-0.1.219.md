# North Ledger 0.1.219 — Windows final-build plan

## Isolated test identity
The final test installer must not share the production application id or user-data path. Proposed visible name: **North Ledger Ultimate — TEST**.

## Intended test folder
`D:\NorthLedger-Test\Final-Test\`

## Build sequence
1. Clean checkout/extraction of final source.
2. Clean npm dependency installation.
3. Rebuild native `better-sqlite3` for the Electron runtime.
4. Run TypeScript/production build.
5. Run automated accounting tests and known-number regression fixture.
6. Seed demo-company databases in the test identity only.
7. Run clean-company and demo-company smoke tests.
8. Run electron-builder to create the Windows installer.
9. Install, launch, close, relaunch, switch companies, and verify database persistence/isolation.
10. Package installer + source + release notes + test checklist + validation summary.

## Failure policy
Any accounting test, migration, reconciliation, report, company-isolation or installer failure blocks the final release.

## Current limitation
This environment cannot directly install the resulting application to the user's physical D: drive. The final artifacts can be produced for download when the Windows-compatible build toolchain is available; the user then places them in the intended D: folder.
