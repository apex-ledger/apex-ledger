# North Ledger Change-Safety Rules

These rules apply to every change anywhere in this repository.

## Preserve verified behaviour

- Treat every passing test and every script included in `npm run verify:test-build` as a product contract.
- Do not change an already verified behaviour unless the user explicitly requests that exact behaviour change.
- Do not remove, skip, weaken, rewrite, or broaden an existing assertion merely to make a new change pass.
- If a requested change conflicts with a verified behaviour, stop and explain the conflict before editing it.
- Protect behaviour rather than freezing an entire shared file: shared code may be edited only when necessary, and all existing contracts must continue to pass.

## Scope every change

- Make the smallest practical change that satisfies the current request.
- Do not redesign, rename, reorganize, or “clean up” unrelated screens, calculations, database fields, or workflows.
- Before editing shared tax, ledger, payroll, numbering, navigation, database, import, or document code, search for every caller and identify the existing tests and verification scripts that cover it.
- Preserve compatibility with existing company files and previously saved transactions unless the user explicitly authorizes a migration or behaviour change.

## Lock each bug fix with a regression test

- Every bug fix must add or strengthen an automated test that reproduces the reported failure and proves the expected numbers, state, or visible behaviour.
- Put accounting formulas in shared domain functions where possible and test exact cents, debits, credits, tax accounts, totals, rounding, and reversal behaviour.
- For UI state bugs, test the real visible value and its underlying saved value; a select that merely looks selected is not sufficient.
- A future change is incomplete if the new regression test or an existing protected test fails.

## Verification gates

- During development, run TypeScript checking and the focused tests for every touched area.
- Before release packaging, run `npm run verify:test-build`, the production build, and `npm run verify:packaged-test`.
- Report every failing check accurately. Do not describe a build as verified when a required gate failed.
- Warnings may be documented, but accounting, data-safety, migration, native-driver, smoke, and regression failures block release.

## Installer authorization

- Never build, package, sign, publish, replace, or distribute an installer until the user explicitly authorizes packaging for that specific set of changes.
- Source compilation or a development bundle is not installer authorization.
- After authorization, report the exact installer path, version, size, SHA-256 checksum, verification result, and signing status.

## User data safety

- Never solve a regression by deleting, resetting, silently rewriting, or recreating user company data.
- Preserve audit history and use the existing reversal/correction workflows for posted accounting records.
- Ask before any destructive or irreversible operation.
