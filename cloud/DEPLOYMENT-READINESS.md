# Deployment readiness — what is proven, what is not, and what is still to build

Status as of 2026-09-02, working copy `D:\Projects\ApexLedger-Claude`. Nothing has been deployed.
This is the honest inventory to reach for when the upgrades are finished and it is time to go live.

## Proven on this workstation

Run `node cloud/verify-cloud.mjs` to reproduce every line of this table.

| Piece | Evidence |
|---|---|
| API (`cloud/api`) compiles under strict TypeScript | `npm run build` clean |
| API unit tests | 58 / 58 pass |
| Web front end (`cloud/web`) compiles and bundles | `npm run build` — 439 kB JS, 7 kB CSS |
| Web view-model tests | pass (runner added this session — the test file existed with nothing to run it) |
| PostgreSQL migration chain, 001 → 020 | applies in order inside embedded Postgres; row security verified for a cross-firm read and an unassigned-company read |
| Container image definition | multi-stage `Dockerfile`, non-root user, health check on `/health` |
| Version agreement | api, web, integration and `infra/main.bicep` default tag all read the same version |

## Needs Azure, cannot be proven here

This workstation has no Azure CLI, Bicep CLI, Docker or `psql`. The CI workflow
(`.github/workflows/cloud-release.yml`) runs these on an Ubuntu runner instead.

| Step | How it will be proven |
|---|---|
| Bicep compiles | `verify` job: `az bicep build` |
| Image builds | `verify` job: `docker build` |
| Deployment `what-if` against the real resource group | `deploy` job, before `create` |
| Entra External ID token validation | pilot sign-in against the real tenant (`PILOT-ACCEPTANCE.md`) |
| Email second factor actually arrives | pilot, with the Communication Services relay in place |
| Backup restore drill | pilot, before customer data |

## Configuration that must exist before the first deploy

Create these in Azure and record them as GitHub Environment variables/secrets for `production`
(names match the workflow exactly):

- **Variables:** `PREFIX`, `RESOURCE_GROUP`, `ACR_NAME`, `WEB_ORIGIN`, `API_URL`, `AUTH_ISSUER`,
  `AUTH_AUDIENCE`, `AUTH_JWKS_URI`, `EMAIL_DELIVERY_URL`, `EMAIL_FROM_ADDRESS`, `SPA_CLIENT_ID`,
  `ENTRA_AUTHORITY`, `ENTRA_KNOWN_AUTHORITY`, `API_SCOPE`
- **Secrets:** `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` (OIDC federated
  credential — no client secret), `POSTGRES_ADMIN_PASSWORD`, `DATABASE_APP_CONNECTION_STRING`,
  `CONTACT_SEARCH_HMAC_SECRET`, `MFA_HMAC_SECRET`, `EMAIL_DELIVERY_BEARER_TOKEN`,
  `STATIC_WEB_APP_TOKEN`
- Two Entra External ID app registrations (SPA and API) with exact redirect URIs.
- A private HTTPS email relay backed by Azure Communication Services with a verified sender.
- The foundation stage deployed once by hand (`infra/deploy.ps1 -Stage Foundation`) so the
  registry exists before the first image build; the workflow handles the application stage from
  then on.

## Upgrades still to build before this stack can carry the desktop product

These are gaps, not defects — the desktop app is complete on its own and never talks to the cloud.

1. **Billing webhook.** The database is ready (`set_firm_subscription`, the `northledger_billing`
   role, idempotent provider event ids) but the API has no route that receives a payment-provider
   event and calls it. Until it exists, plans and seat limits are set by a platform administrator.
2. **Licence issuance from the subscription.** The desktop licence key now carries `plan` and
   `seats` (see `src/shared/domain/licensing/seatPlans.ts`), but nothing in the cloud signs one.
   The Ed25519 private key and an "issue key for this subscription" endpoint belong with the
   billing webhook.
3. **Desktop ↔ cloud bridge.** Invitations in the desktop app say "automatic email delivery and
   remote acceptance will become available when the cloud service is connected". The desktop has
   no cloud client; the cloud has the invitation flow. Joining them is the migration described in
   `README.md` ("Migration order"), and it is the large piece.
4. **Feature parity.** The cloud API today covers identity, seats, entitlements, chart of accounts,
   Essentials sales/expense entry, invoices, vendor bills, HST events, bank transfers and CSV
   import staging. Payroll, reports, PDFs, reconciliation and the accountant tools remain
   desktop-only.

## Release rule

Tag `vX.Y.Z` on `main` → `verify` → `image` (approval) → `deploy` (approval, what-if first,
readiness probe last). Never promote by a mutable tag; the workflow records the image digest in
the run summary, and production should pin to it.
