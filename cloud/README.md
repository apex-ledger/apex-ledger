# Apex Ledger Cloud Foundation

This folder is deliberately isolated from the verified Electron desktop build.
It is the starting deployment unit for the multi-tenant Azure version and does
not replace or alter the desktop application.

## Current status

The container in `api/` is the authenticated tenant and seat-management API. It
validates Microsoft Entra access tokens, requires an emailed second factor in
production, enforces firm/company boundaries, and exposes secure invitations,
seat suspension and the Essentials / Accounting / Accounting + Payroll
entitlements. PostgreSQL migrations add row security, append-only audit events,
idempotency, a real-time outbox, accounting records, invoices, vendor bills,
HST events, bank transfers and staged CSV imports. Platform administration and
customer support can manage service status without receiving access to customer
accounting data.

Before real customer data can be hosted, the existing Electron IPC handlers and
SQLite `.company` database must be migrated to an authenticated HTTP API and
tenant-scoped PostgreSQL storage. Do not upload `.company` files to shared file
storage and let several users open them directly.

## Build locally

```powershell
docker build -t apex-ledger-api:0.1.330 .\cloud\api
docker run --rm -p 8080:8080 --env-file .\cloud\.env apex-ledger-api:0.1.330
```

The dependency versions and lockfiles are committed. The container uses
`npm ci`; production promotion must also scan dependencies and the image, create
an SBOM, sign the immutable image digest, and record the release evidence.

Then open `http://localhost:8080/health`.

The browser application is in `web/`:

```powershell
cd .\cloud\web
npm install
Copy-Item .env.example .env
npm run build
```

Deploy `web/dist/` to Azure Static Web Apps after filling the public Entra SPA
identifiers and API URL. These browser settings are identifiers, not client
secrets. Never put an Entra client secret in the web application.

## Required Azure configuration

The service expects these settings to be supplied by Azure Container Apps and
Key Vault. Never put their production values in source control or an upload ZIP.

- `PORT` (Azure defaults are supported; the container uses `8080`)
- `APP_VERSION`
- `AZURE_REGION`
- `DATABASE_URL` (future PostgreSQL connection; secret)
- `CONTACT_SEARCH_HMAC_SECRET`
- `MFA_REQUIRED` (`true` in production)
- `MFA_HMAC_SECRET`
- `EMAIL_DELIVERY_URL`, `EMAIL_DELIVERY_BEARER_TOKEN`, `EMAIL_FROM_ADDRESS`
- `AZURE_STORAGE_ACCOUNT_URL` (document quarantine storage)
- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `ALLOWED_ORIGINS`

## Migration order

1. Identity, firms, memberships, roles, MFA and tenant context.
2. PostgreSQL schema with `firm_id`/`company_id` tenant boundaries, migrations,
   backups, concurrency control and audit history.
3. Chart of accounts, journal entries and general ledger API.
4. Sales, purchases, HST, banking and document storage.
5. Payroll, compliance reports, imports, PDFs and remaining desktop tools.
6. Real-time change notifications, billing, operational monitoring, penetration
   testing, recovery drill and two-firm pilot acceptance.

## Deployment safety gates

- Every request must derive firm access from the authenticated membership; a
  caller-supplied firm id alone is never authorization.
- Every tenant-owned table must include a tenant key and enforce it in queries.
- Posted accounting mutations must be transactional, idempotent and audited.
- Financial records use optimistic concurrency to prevent silent overwrites.
- Production secrets come from managed identity/Key Vault.
- Database and storage backups must pass a restore drill before the pilot.
- The existing desktop verification suite remains a compatibility contract.

See [AZURE-DEPLOYMENT.md](AZURE-DEPLOYMENT.md),
[SECURITY-OPERATIONS.md](SECURITY-OPERATIONS.md), and
[PLATFORM-ADMIN.md](PLATFORM-ADMIN.md) before accepting customer data.
