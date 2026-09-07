North Ledger - source for build 0.1.190
Packaged 2026-08-23

WHAT IS HERE
  src/                 all application source (main, preload, renderer, shared domain)
  package.json         scripts and dependency versions
  package-lock.json    exact dependency tree - reproduces node_modules precisely
  *.config.ts/js       vite, vitest, tailwind, postcss, typescript
  eng.traineddata      OCR data used by receipt scanning
  t4127_full.txt       CRA payroll formula reference (T4127)

WHAT IS NOT HERE
  node_modules/        897 MB and fully reproducible - run 'npm install'
  dist/, dist-electron/, release/   build output
  .git/                history

TO REBUILD
  npm install
  npm run rebuild      IMPORTANT - rebuilds better-sqlite3 against Electron's ABI.
                       Skipping this makes company files fail to open, silently.
  npm run dev          run in development
  npm run dist:win     produce the Windows installer

TESTS
  npx vitest run       1,104 tests at the time of packaging
  npx tsc --noEmit     type check
