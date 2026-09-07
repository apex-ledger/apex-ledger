# Apex Ledger Cloud Build Ledger

Last updated: 2026-08-31

This is the controlling checklist for the Apex Ledger Azure SaaS build. Work continues from the first incomplete item. An item is complete only when its implementation, automated checks, and required integration evidence are recorded here.

## Operating rules

- Preserve the working desktop application while cloud work remains isolated under `cloud/`.
- Do not regress a completed accounting rule. Add a regression test before changing shared posting, tax, tenant, or permission behavior.
- Never weaken TLS, authentication, tenant isolation, audit logging, or period-lock controls to bypass a development problem.
- Treat every firm and company as a security boundary. A valid login alone never grants access.
- Keep posted accounting records balanced and auditable; corrections use controlled reversals or authorized reopen workflows.
- Do not build an installer/package unless the user explicitly authorizes that build after the current changes.
- Record blockers honestly. Source-complete is not deployment-complete.

## Definition of production-ready pilot

The pilot is complete when two CPA firms can each use two named seats, collaborate on authorized company files, see committed changes promptly, and operate the subscribed workflows without cross-firm data exposure. Azure deployment, backups, restore testing, monitoring, audit evidence, migration rehearsal, security testing, billing enforcement, and pilot documentation must all pass.

## Build status

| ID | Workstream | Status | Completion evidence / next requirement |
|---|---|---|---|
| 01 | Desktop preservation and cloud isolation | Complete | Cloud work is isolated under `cloud/`; desktop source and installer were not modified by this workstream. |
| 02 | Tenant data model and row-level security | Embedded PostgreSQL verified; Azure pending | Migrations `001`-`020` apply in order. RLS proves cross-firm denial and denies a non-admin seat any unassigned client company inside its own firm. Banking, MFA, and platform-management data follow explicit security boundaries. Native Azure PostgreSQL verification remains. |
| 03 | Named seats, invitations, roles, limits, and email 2FA | Source/build/database integration complete; live Entra/email pending | Named invitation combines role, edit/view permission, and selected client companies. Exact-email acceptance copies assignments. Email OTP challenges are hashed, expiring, attempt-limited, single-use, and exchanged for an identity-bound session. Live Entra acceptance, ACS Email delivery, and concurrent-seat scenarios remain. |
| 04 | Subscription plans and feature entitlements | Source/database integration complete; billing pending | Essentials, Accounting, and Accounting + Payroll entitlements exist. The management panel gives platform administrators and restricted customer support audited renew, suspend, reactivate, and past-due actions plus read-only service history; support cannot cancel or change plan. Provider checkout, signed webhooks, approval workflow, and live billing reconciliation remain. |
| 05 | Accounting core | Source complete; integration pending | Migration `006` and API routes cover accounts, master/subaccounts, period locks, balanced journals, posting, and GL. Must run PostgreSQL posting/locking/concurrency tests and migration rehearsal. |
| 06 | Essentials sales/expense/HST workflow | Source and build complete; integration pending | Migration `007`, API routes, HST calculation/suggestion, sales-tax summary, and React Essentials UI exist. API tests and production web build pass. Browser end-to-end and PostgreSQL posting verification remain. |
| 07 | Customer and vendor directory | Source and build complete; integration pending | Migration `008`, audited company-scoped API, and compact UI support customer/vendor/both contacts plus name, company, phone, address, authorized DOB, and protected exact-SIN search. PostgreSQL RLS and browser end-to-end verification remain. |
| 08 | Sales invoices, receipts, and customer payments | Source/build/database integration complete; live browser pending | Automatic concurrent-safe numbers, editable products/services, multi-line HST, AR/revenue/HST posting, Save & Close/Next, copy, confirmed audited void/reversal, full payments, immutable posted content, and realtime events exist. PostgreSQL proves balanced invoice/payment/void journals. Live Entra browser E2E remains. |
| 09 | Vendor bills, expenses, and payments | Source/build/database integration complete; live browser pending | Vendor-scoped bills, permanent duplicate supplier-invoice protection, multi-line HST/ITC, AP posting, full payment, Save & Close/Next, copy, confirmed void/reversal, immutable content, realtime events, and UI exist. Embedded PostgreSQL proves balanced bill/payment journals and ITC events. Live Entra browser E2E remains. |
| 10 | Banking, credit cards, transfers, and reconciliation | Transfer/import staging complete; matching pending | Migration `018` adds immutable transfers, duplicate-resistant import batches/rows, match states, and reconciliation records under RLS. The API and web UI safely stage CSV bank/card rows without ledger posting and show unmatched rows. OFX parsing, matching/posting, reconciliation completion, and live-provider adapter remain. |
| 11 | Sales Tax filing and period controls | Partial | Append-only dated tax events combine simple entries, invoices, vendor bills, and void reversals; UI shows revenue/ITC category detail and totals. Add CRA filing handoff, business-number population, accountant-authorized locks/reopens, and filing evidence. |
| 12 | Payroll cloud workflows | Entitlement only | Add biweekly, semimonthly, and monthly schedules; pay runs; remittances; paystubs; PD7A support; RRSP benefit treatment; privacy-safe calculation output; and Accounting + Payroll gating. |
| 13 | Inventory, products/services, cheque/PDF workflows | Not started | Add products, inventory movements, cheque layout learning, scanned image/PDF import, fillable output, and storage controls. |
| 14 | Reports, analytics, CRM, and compliance centre | Not started | Add financial statements, GL/JE access, AR/AP aging, who owes/whom owed, CRA/CPA audit reports, favourites, CRM, deadlines, alerts, and traceable compliance sources. |
| 15 | Desktop-to-cloud migration | Inventory complete; implementation pending | `MIGRATION-INVENTORY.md` exists. Build repeatable SQLite export/import, ID mapping, control totals, attachment transfer, dry-run report, and rollback/retry procedure. |
| 16 | Real-time collaboration | Foundation only | Transactional outbox exists. Add Azure delivery service, authorized company channels, reconnect/catch-up, idempotent updates, optimistic concurrency, and two-seat verification. |
| 17 | Azure infrastructure and deployment | Two-stage IaC/deployment source complete; Azure validation pending | Bicep defines Container Apps, managed identity, ACR, Key Vault, private PostgreSQL, storage quarantine, Defender scanning, monitoring, and Static Web Apps. Preflight, foundation deployment, ACR build/digest capture, and application activation scripts prevent a first-deploy image-pull failure. Azure CLI/credentials are absent locally, so Bicep build, `what-if`, live deployment, DNS/TLS, and recovery validation remain. |
| 18 | Security, privacy, and operational assurance | Layered pilot controls and threat model source complete; live drills pending | Email 2FA, upload prechecks, Defender on-upload scanning IaC, Key Vault references, locked-down storage, security operations, incident response, and a prioritized threat model exist. Image/SBOM/signing pipeline evidence, PIPEDA review, restore/load tests, and penetration test remain. |
| 19 | Pilot onboarding and support | Management foundation and acceptance runbook complete; live pilot pending | Role-separated admin/support controls, append-only service action history, and a two-firm/four-seat acceptance checklist exist. Complete live onboarding, incident communication exercise, export/offboarding, training, and signed acceptance evidence. |

## Verified evidence

- API pure-domain tests: access roles, seat secrets, subscription entitlements, user capabilities, journal validation, HST calculations, and tax suggestions passed in the local focused test harness.
- Full API gate on 2026-08-31: 58 tests cover the existing accounting rules plus MFA enforcement, upload security, and read-only platform action history; the TypeScript production build passes.
- Embedded PostgreSQL gate applies migrations `001`-`020`, verifies the accounting/tenant controls plus single-use MFA challenges and audited platform subscription suspension/reactivation/history.
- Full web gate on 2026-08-31: TypeScript checking and the production build pass with Apex branding, email verification, platform management, Chart of Accounts, and staged bank CSV review.
- Deployment preflight script, security threat model, and two-firm/four-seat pilot acceptance checklist were added on 2026-08-31; live Azure evidence is still required.
- API and web dependency audits on 2026-08-29: zero known vulnerabilities after upgrading patched direct dependencies.
- Web view-model tests passed in the earlier focused harness.
- Account codes remain stored for accounting integrity while presentation helpers can hide prefixes where required.

## Active blockers

- Azure CLI/Bicep and live Azure credentials are not available on this workstation, so the template has not received an Azure `what-if` or live deployment.
- Live Entra/ACS Email tenant values, subscription, DNS name, and billing-provider credentials are not yet configured.
- The current workstation's npm registry connection fails certificate verification, so the 2026-08-31 online vulnerability audit could not run. The last successful API/web audit on 2026-08-29 reported zero known vulnerabilities; rerun the audit in the controlled Azure build pipeline before promotion.

## Immediate execution order

1. Validate the Bicep template with Azure CLI and deploy an isolated pilot environment.
2. Configure Entra External ID and ACS Email, then exercise two firms with two seats each.
3. Run native Azure PostgreSQL isolation/concurrency tests, malware scanning, backup restore, load, and penetration-test gates.
4. Continue banking matching/reconciliation and remaining workstreams without weakening completed regression contracts.
