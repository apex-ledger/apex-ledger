# Apex Ledger on the web

The same accounting engine and the same screens as the desktop app, served over HTTPS. Nothing was
rewritten: the browser build supplies `window.api` over HTTP (`src/web/api.ts`) and the server
(`src/server`) dispatches each call into the handler the desktop registers with Electron, with a
stub standing in for Electron (`src/server/electronStub.ts`).

## Shape

| Piece | Where | What it does |
|---|---|---|
| Web bundle | `dist-web/` from `vite.web.config.ts` | The renderer screens, entered through `src/web/main.tsx` (sign-in gate, then the same App). |
| Server | `dist-server/index.js` from `scripts/build-server.mjs` | Express: sign-in, sessions, `/api/<channel>`, server-sent events, static files. |
| Organisations and seats | `src/server/admin.ts`, `web-admin.db` in the data folder | Each organisation has N seats (people). Company files live in `companies/<org-slug>/`. |
| Company files | `<APEX_DATA_DIR>/companies/<org>/<name>.company` | The same SQLite files the desktop uses. One session opens one company at a time; several people in the same organisation can open the same file. |

Every request runs inside the caller's session on async-local storage: the session's open company
connection (`runWithCompanyContext`) and access identity (`runWithAccessSession`). Handlers call
`getCurrentDb()` exactly as on the desktop and get that session's connection.

## Build and run

```bash
npm run build:web          # api map → web bundle → server bundle
npm rebuild better-sqlite3 # the server runs under Node, not Electron (see note below)
APEX_DATA_DIR=/srv/apex APEX_ADMIN_EMAIL=you@firm.ca APEX_ADMIN_PASSWORD='long passphrase' \
APEX_SEED_ORGS="Firm One:2,Firm Two:2,Firm Three:2,Firm Four:2,Firm Five:2" PORT=8787 \
node dist-server/index.js
```

Environment:

| Variable | Meaning |
|---|---|
| `APEX_DATA_DIR` | Folder for `web-admin.db`, `companies/`, `user-data/`. Put it on the encrypted data disk. |
| `APEX_ADMIN_EMAIL`, `APEX_ADMIN_PASSWORD` | Created on first start as the platform administrator (organisation "Apex Ledger", no seat limit). |
| `APEX_SEED_ORGS` | Optional `Name:seats,Name:seats` starter organisations, created once. |
| `PORT` | Listen port; put a TLS reverse proxy in front. |

On this development machine better-sqlite3 is compiled for Electron. `npm rebuild better-sqlite3`
switches it to Node for the server; `npm run rebuild` switches it back for the desktop app.
On a server there is only Node, so a plain `npm ci` is right.

## Sign-in, organisations, seats

- `POST /api/login { email, password }` sets an HttpOnly session cookie. Eight failed attempts from
  one address in 15 minutes are refused for 15 minutes.
- Inside the app the person is already identified (the desktop's shared-PIN gate is skipped) and
  their name stamps every entry and the Activity Log.
- Platform admin endpoints (`/api/admin/orgs`, `/api/admin/orgs/:id/seats`, `/api/admin/users`,
  `/api/admin/users/:id/active`, `/api/admin/users/:id/password`): create organisations, set
  seats, add people. An organisation owner can add people to their own organisation up to its
  seat count. `POST /api/me/password` changes your own password.
- Five organisations with two seats each is the starting shape; seats are a number on the
  organisation row, so it scales by changing rows, not code.

## What differs from the desktop

- File dialogs are replaced, not missing. Create Company writes into the organisation's folder and
  Open Company offers that folder's files. Save-as-PDF and Export Excel hand the file to the
  browser as a download. Every screen that opens a file picker on the desktop (bank CSV/OFX, bank
  statement PDF, QuickBooks/Xero Excel, IIF, client CSV, receipts, attachments, workpapers, logo)
  opens the browser's file chooser instead: `src/web/api.ts` uploads the chosen files to
  `PUT /api/upload`, then sends the request with the upload tokens, and the stub's
  `dialog.showOpenDialog` returns those files to the handler. Uploads live only for that request.
  Folder pickers (second backup folder, save-all statements) stay cancelled on the web.
- Backups: the server's disk is backed up as a whole; the in-app second backup folder is not used.
- Voice: off by default and best left off on a server; typing does everything.
- The demo and test companies are desktop features. Settings, Organisation & seats, Company
  files lists the organisation's files, uploads a `.company` made on the desktop or elsewhere
  (`PUT /api/org/companies`, SQLite header checked, no overwrite unless asked, never while open)
  and downloads a consistent copy (`GET /api/org/companies/download`, SQLite online backup so an
  open file with a WAL still copies whole). The platform administrator can do this for any
  organisation; an owner for their own.

## Azure, Canada Central

Live since 2026-09-07: resource group `apexledger-prod-cac`, VM `apexledger-app` (Standard_B2ps_v2, ARM64 Ubuntu 22.04, 2 vCPU, 8 GB, 64 GB Premium SSD data disk at /srv/apex), public name `apexledger-app.canadacentral.cloudapp.azure.com`, nightly backup to `apexledger-vault` (geo-redundant, copy in Canada East). Deploy with `deploy/setup-vm.sh` after uploading the release tarball. A new subscription only offers ARM sizes in Canada Central; x64 sizes need a quota request, which is not necessary.

SQLite company files want a real disk, not a network share, so the right host is a small Linux
virtual machine with a managed disk, not App Service's shared storage:

1. **VM** Ubuntu 22.04, B2s (2 vCPU, 4 GB) to start, Canada Central, Premium SSD 64 GB for
   `APEX_DATA_DIR`, disk encryption on. Node 20 LTS, `npm ci`, `npm run build:web`.
2. **Process** systemd unit running `node dist-server/index.js` with the environment above;
   restart on failure.
3. **HTTPS** Caddy in front (`app.apexledger.ca` → `localhost:8787`); it fetches and renews the
   certificate itself.
4. **Network** an NSG allowing 443 from the internet and 22 only from the office address; nothing
   else inbound. The app port is not exposed.
5. **Backups** Azure Backup nightly snapshots of the data disk, retained 30 days, with the vault's
   secondary copy in Canada East.
6. **Sign-in** Entra ID (Microsoft) single sign-on is the next step; today it is email and
   password with lockout.
7. **Later** WAF on Application Gateway when outside users are onboarded; a second VM behind a load
   balancer when one is not enough (sessions are in memory today, so move them to Redis first).

Rough cost for the VM shape: $70 to $110 CAD a month including disk and backups.
