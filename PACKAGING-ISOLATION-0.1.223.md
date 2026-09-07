# North Ledger 0.1.223 — Windows test packaging isolation

Implemented in this checkpoint:
- TEST appId: `ca.pjinsuretax.northledger.ultimate.test`
- TEST product name: `North Ledger Ultimate - TEST`
- TEST installer artifact name.
- TEST `userData` redirected to a separate `North Ledger Ultimate TEST` folder under AppData.
- TEST default company files redirected to Documents/`North Ledger Ultimate TEST Companies`.
- Auto-updater disabled for the TEST build so it cannot join the production update channel.
- `npm run dist` now aliases the existing Windows `dist:win` packaging command.
- electron-builder publishing config removed from this TEST checkpoint.

Remaining executable gate: install dependencies, rebuild native SQLite, run tests/build, create NSIS installer, then smoke-test on Windows.
