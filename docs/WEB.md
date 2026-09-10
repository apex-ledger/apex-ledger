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

Several people in one organisation can work in the same company file at once: each session has
its own SQLite connection in WAL mode. Verified 2026-09-08 with two sessions posting 16 quick
entries simultaneously while one read the trial balance eight times: no locked-database errors,
and the other session received data:changed over server-sent events.

Firms are isolated at every route: `scripts/web-isolation-check.mjs` (run against a local server
with the platform admin cookie in web-data/cookies.txt) signs in as two firms and tries the other's
files by path and by traversal, uploads and downloads across organisations, people, seats, trial
requests, rates, the sign-in pause, feedback, and 20 interleaved requests. Last run 2026-09-10: all
refused or scoped. Download links are bound to the session that produced them and work once.

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
| `APEX_SMTP_HOST`, `APEX_SMTP_FROM` | Mail server and from address for notices to the administrator. Optional `APEX_SMTP_USER`, `APEX_SMTP_PASSWORD`, `APEX_SMTP_PORT` (587), `APEX_SMTP_SECURITY` (`starttls`, or `tls` for port 465). Microsoft 365: `smtp.office365.com`, port 587, the mailbox as user and from. |
| `APEX_NOTIFY_EMAIL` | Where those notices go. Default `admin@apexledger.ca`. |
| `PORT` | Listen port; put a TLS reverse proxy in front. |

On this development machine better-sqlite3 is compiled for Electron. `npm rebuild better-sqlite3`
switches it to Node for the server; `npm run rebuild` switches it back for the desktop app.
On a server there is only Node, so a plain `npm ci` is right.

## Sign-in, organisations, seats

- `POST /api/login { email, password }` sets an HttpOnly session cookie good for 30 days. Eight
  failed attempts from one address in 15 minutes are refused for 15 minutes. Sessions are rows in
  web-admin.db (token hash, person, open company), so a restart or a deploy signs nobody out: the
  next request rebuilds the session and reopens the company it had. Sign out deletes the row.
  Idle sessions leave memory after two hours and come back the same way.
- Inside the app the person is already identified (the desktop's shared-PIN gate is skipped) and
  their name stamps every entry and the Activity Log.
- Platform admin endpoints (`/api/admin/orgs`, `/api/admin/orgs/:id/seats`, `/api/admin/users`,
  `/api/admin/users/:id/active`, `/api/admin/users/:id/password`): create organisations, set
  seats, add people. An organisation owner can add people to their own organisation up to its
  seat count. `POST /api/me/password` changes your own password.
- Five organisations with two seats each is the starting shape; seats are a number on the
  organisation row, so it scales by changing rows, not code.
- Sign in with Microsoft or Google (`src/server/oidc.ts`): plain OpenID Connect code flow, ID
  token verified here against the provider's published keys (signature, issuer, audience, expiry,
  nonce). The verified email must already be an active person in an organisation; a provider
  sign-in never creates a seat. On when the environment has `APEX_MS_CLIENT_ID` +
  `APEX_MS_CLIENT_SECRET` (Entra app registration "Apex Ledger", app id
  1aa992fe-eb0e-41da-8fcb-16041b08f81f, audience any Microsoft account, redirect
  `https://online.apexledger.ca/api/auth/microsoft/callback`) and/or `APEX_GOOGLE_CLIENT_ID` +
  `APEX_GOOGLE_CLIENT_SECRET` (a Google Cloud OAuth web client with redirect
  `https://online.apexledger.ca/api/auth/google/callback`). `APEX_PUBLIC_URL` fixes the redirect
  origin behind the proxy. The sign-in page shows a button per configured provider above the
  password form.
- Trial requests: the form on apexledger.ca posts to `POST /api/trial-request` (CORS for the
  site origins in `APEX_SITE_ORIGINS`, honeypot field, five per address per hour). They land in
  `trial_requests` in web-admin.db and show in Settings, Organisation & seats for the platform
  administrator, who can fill the New organisation and Add a person forms from one and mark it done.
  Before the form sends, the site shows the Terms of Service and then the Subscription Agreement
  filled in with the firm and name from the form (`agreement.html?firm=&name=&email=&seat=&seats=`);
  the visitor types their name as signature and that name and the server time land in
  `agreed_name` / `agreed_at` on the row. The administrator's list shows "Signed <name>", linking
  to the agreement with the signature block filled in (`&signed=&date=&where=site`).
  With `APEX_SMTP_HOST` and `APEX_SMTP_FROM` set, each request is also emailed to
  `APEX_NOTIFY_EMAIL` (admin@apexledger.ca) the moment it arrives (`src/server/notify.ts`); a mail
  failure is a log line, the request is still saved and the visitor still sees "Your request is in".
- On the web the welcome screen hides Open Company File, the demo and the test company; the header
  hides Check for Updates and Mirror Window (`src/renderer/utils/platform.ts`, `isWeb()`).

## What differs from the desktop

- File dialogs are replaced, not missing. Create Company writes into the organisation's folder and
  Open Company offers that folder's files. Save-as-PDF and Export Excel hand the file to the
  browser as a download. Every screen that opens a file picker on the desktop (bank CSV/OFX, bank
  statement PDF, QuickBooks/Xero Excel, IIF, client CSV, receipts, attachments, workpapers, logo)
  opens the browser's file chooser instead: `src/web/api.ts` uploads the chosen files to
  `PUT /api/upload`, then sends the request with the upload tokens, and the stub's
  `dialog.showOpenDialog` returns those files to the handler. Uploads live only for that request.
  Folder pickers (second backup folder, save-all statements) stay cancelled on the web.
- Every answer carries a strict Content-Security-Policy (scripts and connections only from this
  origin, no framing), nosniff, a referrer policy and a permissions policy. `GET /api/health`
  needs no sign-in and reports only status and version, for a monitor. The web build has no
  inline scripts, so the policy needs no exceptions; the settings screen hides the desktop-only
  "second backup folder" picker on the web.
- Opening a file (attachments, workpaper attachments, receipts) means downloading it: the stub's
  `shell.openPath` copies the file into the downloads folder and the HTTP layer returns the link.
  Save as PDF on the web opens the browser's print dialog (its Save as PDF), and the print
  stylesheet prints only the content pane, over as many pages as needed. Cheque printing is
  unchanged. Bad or oversized request bodies get a JSON error, never an HTML stack trace.
- Backups: the server's disk is backed up as a whole; the in-app second backup folder is not used.
- Voice: off by default and best left off on a server; typing does everything.
- The demo and test companies are desktop features. Settings, Organisation & seats, Company
  files lists the organisation's files, uploads a `.company` made on the desktop or elsewhere
  (`PUT /api/org/companies`, SQLite header checked, no overwrite unless asked, never while open)
  and downloads a consistent copy (`GET /api/org/companies/download`, SQLite online backup so an
  open file with a WAL still copies whole). The platform administrator can do this for any
  organisation; an owner for their own.

## Azure, Canada Central

Live since 2026-09-07: resource group `apexledger-prod-cac`, VM `apexledger-app` (Standard_B2ps_v2, ARM64 Ubuntu 22.04, 2 vCPU, 8 GB, 64 GB Premium SSD data disk at /srv/apex), public name `apexledger-app.canadacentral.cloudapp.azure.com`, nightly backup to `apexledger-vault` (geo-redundant, copy in Canada East). First install with `deploy/setup-vm.sh`; later releases with `deploy/deploy-release.sh` (upload site.tgz and/or bundles.tgz, run the script; sessions survive the restart). Azure Monitor: action group `apexledger-ops` emails admin@apexledger.ca; alert `apexledger-app-down` fires when the VM availability metric drops for 5 minutes. Backups: vault `apexledger-vault`, DefaultPolicy nightly, 30 days. A new subscription only offers ARM sizes in Canada Central; x64 sizes need a quota request, which is not necessary.

SQLite company files want a real disk, not a network share, so the right host is a small Linux
virtual machine with a managed disk, not App Service's shared storage:

1. **VM** Ubuntu 22.04, B2s (2 vCPU, 4 GB) to start, Canada Central, Premium SSD 64 GB for
   `APEX_DATA_DIR`, disk encryption on. Node 20 LTS, `npm ci`, `npm run build:web`.
2. **Process** systemd unit running `node dist-server/index.js` with the environment above;
   restart on failure.
3. **HTTPS** Caddy in front (`online.apexledger.ca` → `localhost:8787`); it fetches and renews the
   certificate itself.
4. **Network** NSG `apexledger-appNSG`: TCP 80/443 from the internet, TCP 22 only from the
   owner's address (set 2026-09-08; if that address changes, change the rule with
   `az network nsg rule update ... --source-address-prefixes <new ip>/32`, which needs no SSH).
   Nothing else inbound; the app port is not exposed; HTTP/3 (UDP) is off on Caddy.
5. **Backups** Azure Backup nightly snapshots of the data disk, retained 30 days, with the vault's
   secondary copy in Canada East.
6. **Sign-in** Entra ID (Microsoft) single sign-on is the next step; today it is email and
   password with lockout.
7. **Later** WAF on Application Gateway when outside users are onboarded; a second VM behind a load
   balancer when one is not enough (sessions are in memory today, so move them to Redis first).

Rough cost for the VM shape: $70 to $110 CAD a month including disk and backups.
