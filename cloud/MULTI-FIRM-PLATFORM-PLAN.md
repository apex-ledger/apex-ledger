# Apex Ledger Cloud — multi-firm platform plan

Written 2026-09-02 for the move from single-workstation testing to a hosted service for many
accounting firms, each with several seats. It builds on what already exists in `cloud/`
(Fastify API, PostgreSQL migrations 001–020 with row-level security, Bicep infrastructure, CI
release workflow) and on the design notes beside it: `SEAT-AND-LOGIN-MODEL.md`,
`SCALING-200-SEATS.md`, `THREAT-MODEL.md`, `SECURITY-OPERATIONS.md`, `SUBSCRIPTION-MODEL.md`.
Where this plan and those notes overlap, this plan is the newer statement.

Nothing here is deployed. The plan is written so each phase has a gate that must be passed
before the next begins.

---

## 1. What we are building

One hosted service, many **firms**. A firm is a bookkeeping or accounting practice. Inside a
firm are the **client companies** it keeps books for, the **staff seats** who do the work, and
the **files** they handle (receipts, statements, PDFs, working papers, and the desktop
`.company` files during the transition). Everything a firm has is invisible to every other
firm. Inside a firm, sharing is deliberate and recorded.

Principles that decide the rest:

1. **A firm's boundary is enforced by the database and the storage account, not by the
   application remembering to check.** Row-level security on every tenant table; storage
   paths and access tokens scoped to the firm. A bug in a route cannot leak across firms.
2. **Sharing inside a firm is explicit.** A company's books are visible to the firm's owners
   and administrators, and to the staff assigned to that company. A firm-wide library holds
   documents everyone in the firm may see. Every grant is a row with who granted it and when.
3. **One code base, two isolation tiers.** Most firms share a pooled PostgreSQL cluster
   (cheapest, simplest, already built). A firm that needs it — size, regulator, contract —
   gets its own database on the same schema. Moving between tiers is an export/import with
   control totals, never a special path.
4. **Canada only, by default.** Data stays in Canadian regions (Canada Central primary,
   Canada East for geo-redundant copies) unless a firm contracts otherwise.
5. **Nothing destructive without a recoverable plan and an audit record.** From
   `THREAT-MODEL.md`; it stays the release rule.

---

## 2. Tenancy model

```
Platform (Apex Ledger staff — no access to accounting data)
└── Firm (tenant)                    firms
    ├── Subscription & seat limit    firm_subscriptions, subscription_plans
    ├── Members (seats)              app_users, firm_memberships (role, status)
    ├── Companies (client books)     companies
    │   └── Company access grants    company_member_access
    ├── Firm library (shared files)  new: firm_documents (scope = 'firm')
    └── Audit trail                  audit_events (append-only)
```

Roles inside a firm (already in `firm_memberships.role`):

| Role | Sees | Can |
|---|---|---|
| owner | every company in the firm | everything, including billing and transferring ownership |
| firm_admin | every company | manage seats, companies, grants; all bookkeeping |
| accountant | assigned companies | post, correct through reversals, file returns |
| bookkeeper | assigned companies | day-to-day entry; no filing, no deletions |
| client (viewer/contributor) | one company | upload receipts, view statements, approve; never another company |

Platform staff have their own roles (`PLATFORM-ADMIN.md`) with no permission on customer
accounting data; support actions are reason-required and append-only.

**Where isolation is enforced today** (`001`, `010`, `017`): every tenant table carries
`firm_id` (and `company_id` for company data); row-level security is forced on; the current
user and firm come from the authenticated session (`app.user_id`), never from a caller-supplied
id; `current_user_company_role()` resolves a person's role for a company through membership and
`company_member_access`. The cross-firm and unassigned-company negative tests in
`verify-cloud.mjs` stay in CI forever.

---

## 3. Data separation: pooled and siloed

| | Pooled (default) | Siloed (premium / contractual) |
|---|---|---|
| Database | shared Azure Database for PostgreSQL Flexible Server, one schema | own database on a dedicated server (or a dedicated database on a shared server for mid-size) |
| Isolation | `firm_id` + forced RLS on every table | physical: separate database, separate credentials |
| Encryption | Azure service-managed keys | customer-managed key in the firm's own Key Vault (CMK) on request |
| Storage | shared account, per-firm container `firm-{firmId}` | dedicated storage account |
| Backups | server PITR 35 days + GZRS blobs | same, plus per-firm export schedule the firm can download |
| Cost to us | lowest | ~10× per firm; priced accordingly |
| Who | almost everyone | firms over ~25 seats, or with a regulator/insurer requirement |

**Routing.** A `firm_directory` table on the platform database maps `firm_id` to a connection
name; connection strings live in Key Vault under that name and are read by managed identity at
start-up (and on change). The API opens the right pool per request after authentication. Pooled
firms all map to `pooled-ca-central-1`. Adding a second pooled cluster later (when the first
reaches ~60% of its ceiling) is a directory entry, not a code change.

**Moving a firm between tiers** is the controlled export already planned in
`CLIENT-ACCOUNTANT-COLLABORATION.md`: export with control totals (trial balance, A/R, A/P,
GST/HST by period), import into the destination, reconcile, switch the directory entry, keep
the source read-only for 30 days, then delete with an audit record.

**Per-firm containers, not per-firm prefixes.** A container per firm lets storage policies
(retention, immutability, legal hold, CMK encryption scope) be set per firm, and lets a
firm-scoped user-delegation token be minted that cannot reach another container at all.

---

## 4. Files: firm separation and sharing inside a firm

### Layout in Blob Storage

```
firm-{firmId}/
  companies/{companyId}/receipts/{yyyy}/{mm}/{documentId}.{ext}
  companies/{companyId}/statements/...
  companies/{companyId}/working-papers/...
  companies/{companyId}/exports/...        (PDF packs, T-slips, filed returns)
  library/{documentId}.{ext}               (firm-wide: templates, engagement letters, checklists)
  vault/{companyId}/{version}.company      (desktop company files — see 4.4)
quarantine/  (shared, short-lived: every upload lands here first)
```

The database row (`documents`, new migration) is the source of truth: `firm_id`, `company_id`
(null for library items), `scope` (`company` | `firm`), blob path, SHA-256, size, content type
as sniffed (never as claimed), uploader, scan status, version chain, retention class, legal-hold
flag, soft-delete timestamp. Row-level security applies to it like any tenant table.

### Upload → scan → accept

Already designed in `SECURITY-OPERATIONS.md`; to be built:

1. Client asks the API for an upload; API checks the person's role on that company (or firm for
   library) and returns a one-time user-delegation URL into `quarantine/` (10 minutes, write
   only, content-length capped).
2. Defender for Storage scans on upload. An Event Grid handler (Container Apps job) reads the
   verdict: clean → move to the firm container and mark `accepted`; malicious → keep in
   quarantine, mark, alert, notify the uploader; no verdict in 15 minutes → mark `unscanned`,
   retry, never serve.
3. Reads are also one-time delegation URLs (5 minutes, read only) issued only after the same
   role check. Nothing in storage is ever public; shared-key access is disabled.

### Sharing inside a firm

- **Company-scoped by default.** A receipt for Maple Consulting is visible to owners, firm
  admins, and staff assigned to Maple — the same rule as the books themselves. One rule, one
  function (`current_user_company_role`), used by files and ledgers alike.
- **Firm library.** `scope = 'firm'` documents are readable by every active member; writable
  by owner/firm_admin (or a `librarian` grant). This is where templates, checklists, and
  engagement letters live.
- **Ad-hoc share to a colleague** (`document_shares`): a member with access can share a
  document with another member of the same firm, optionally read-only, optionally expiring.
  Shares never cross the firm boundary — the row carries `firm_id` and RLS refuses the rest.
- **Share to a client.** A client user sees only their own company's `client-visible` documents
  (statements, invoices, filed returns) — a flag on the row, set deliberately by staff.
- **Links to outsiders** (an auditor, a lender): time-boxed, password-optional, view-only
  links minted per document with their own audit rows. Off by default per firm.

Every read of a sensitive class (payroll, T-slips, SIN-bearing forms) writes an audit event.

### Versioning, retention, deletion

- Blob versioning on; soft delete 30 days; a document's previous versions are listed in the
  app and restorable by owner/firm_admin.
- Retention classes: `working` (until deleted), `tax` (7 years after the tax year, CRA), `payroll`
  (7 years), `legal-hold` (until released). Deletion of a `tax` document before its date is
  refused, not just warned.
- A firm that leaves gets a full export (files + ledgers + audit) then a 90-day hold, then
  deletion with a signed record.

### 4.4 Desktop `.company` files during the transition

The desktop app is the complete product today and works on a local file. Until the web service
has feature parity (`DEPLOYMENT-READINESS.md`, gap 4), a firm can use the **Firm Vault**:

- The desktop app (new "Open from Firm Vault / Check in") uploads and downloads `.company`
  files through the same API and storage rules. A file is **checked out** by one person at a
  time (lock row with holder, time, machine); others open it read-only. Check-in stores a new
  version with the app's own pre-migration safety copy logic; nothing is ever overwritten in
  place.
- This is deliberately a lock, not a merge: SQLite files do not merge, and a lost update in a
  ledger is worse than waiting.
- When a company is migrated into the hosted books, its vault versions stay as read-only
  history.

---

## 5. Identity and access

- **Microsoft Entra External ID** stays the identity authority (registration, passwords,
  reset, MFA, Conditional Access). The service stores the Entra object id, never a password.
- **Second factor**: Entra MFA for everyone; the emailed code in `mfa.ts` remains as an
  additional step-up for sensitive actions (filing, payroll approval, exports, seat changes).
  Platform staff: phishing-resistant MFA and Conditional Access, no exceptions.
- **Sessions**: short access tokens, refresh through Entra; server-side session revocation
  list checked on sensitive routes; forced sign-out on seat suspension.
- **Seats**: invitation flow as in `SEAT-AND-LOGIN-MODEL.md`; `seat_limit` enforced in the
  transaction; removal suspends rather than deletes.
- **Firm sign-in policies** (per firm, owner-set): require MFA on every sign-in, allowed
  email domains, session length, IP allow-list (optional).
- Later: SCIM provisioning for firms with their own Entra tenant; SSO federation for firms on
  Microsoft 365.

---

## 6. Security controls (what runs, not what we hope)

| Layer | Control | Status |
|---|---|---|
| Network | VNet; PostgreSQL private endpoint only; storage default-deny; Container Apps ingress HTTPS only; WAF (Front Door Premium) in front of API and web at GA | Bicep has VNet/private DB/deny storage; WAF to add |
| Secrets | Key Vault + managed identity; no secrets in env files or images; rotation runbook quarterly, immediately on incident | Bicep has vault + identity |
| Data at rest | Azure encryption; CMK per siloed firm; SIN/contact lookups HMAC-only; masked in UI | HMAC in place |
| Data in transit | TLS 1.2+ everywhere; HSTS; no mixed content | to verify at deploy |
| Uploads | quarantine → Defender scan → accept; sniffed types; size caps; no public blobs | design in place; handler to build |
| Application | idempotency keys on writes; optimistic versions; balanced-journal validation; append-only audit and outbox; rate limits per user and per firm | built in API/schema |
| Supply chain | `npm ci`, audit, image scan, SBOM, signed digest, deploy by digest | workflow defined |
| Monitoring | App Insights + Log Analytics; alerts on auth failures, RLS denials, scan verdicts, 5xx, latency, DB CPU/connections, cost | to configure |
| Backups | PostgreSQL PITR 35 days, geo-redundant; blob GZRS + versioning + soft delete; monthly restore drill into an isolated group with control-total reconciliation | Bicep has PITR/GZRS; drill to schedule |
| DR | primary Canada Central, geo-restore to Canada East; RPO ≤ 15 min (DB), RTO ≤ 4 h; documented and rehearsed twice a year | to build |
| Testing | negative isolation tests in CI; annual third-party penetration test before GA and after major changes | isolation tests exist |
| Compliance posture | PIPEDA; SOC 2 Type II readiness plan after GA (evidence from the above); Canadian residency statement in the contract | to write |

---

## 7. Scalability: what grows, and when

The architecture is stateless API replicas in front of a pooled PostgreSQL cluster, files in
Blob Storage, background work in Container Apps jobs, real-time in Web PubSub. Scale is a
matter of sizing and adding pools, not redesign.

| Milestone | Firms / seats / concurrent | API | PostgreSQL | Other | Rough run cost (CAD/month) |
|---|---|---|---|---|---|
| Pilot | 2 firms / 10 seats / 5 | 2 × 0.5 vCPU | D2ds_v5, zone-redundant HA, 128 GB | GZRS storage, Key Vault, Insights | 900–1,300 |
| Launch | 20 firms / 150 seats / 40 | 2–4 × 1 vCPU, autoscale on concurrency | D4ds_v5 HA, PgBouncer on | Front Door + WAF, Web PubSub | 2,200–3,000 |
| Growth | 100 firms / 800 seats / 200 | 4–10 × 1 vCPU | D8ds_v5 HA + read replica for reports | OCR/scan jobs pool | 5,000–7,000 |
| Scale | 300 firms / 2,500 seats / 600 | 2 pooled clusters, 10–20 replicas | 2 × D8–D16 + replicas | second region for read/DR, siloed tenants on own servers | 12,000+ plus siloed firms at cost |

Rules from `SCALING-200-SEATS.md` still apply: autoscale on HTTP concurrency and CPU, never on
seat count; 10 pooled connections per replica; no PDFs or scans in the database; load test at
each milestone before selling it.

Heavy work leaves the request path: OCR, PDF generation, big imports (QuickBooks, bank CSV),
exports, and scan verdict handling run as Container Apps jobs fed by a queue, with per-firm
fairness (a firm importing 10 years of history cannot starve the others).

---

## 8. Environments and release

| Environment | Purpose | Data |
|---|---|---|
| `dev` | developers; ephemeral | synthetic (the Northwind test company generator) |
| `staging` | release rehearsal; mirrors prod sizing at pilot scale | synthetic + anonymised restore drills |
| `prod` | customers | real |

Each is its own resource group and subscription budget with alerts. The existing workflow
(`.github/workflows/cloud-release.yml`: verify → image → deploy with what-if and approval)
becomes: tag → verify → image → deploy to staging → automated smoke + isolation tests → manual
approval → deploy to prod by immutable digest. Database migrations run before the new image
takes traffic and are always additive (expand → migrate → contract), so the previous image can
keep serving during a rollback.

Feature flags per firm (`firm_feature_flags`) let a new capability go to the pilot firms first.

---

## 9. Billing and seats

From `SUBSCRIPTION-MODEL.md`: Essentials / Accounting / Accounting + Payroll, priced per seat
per month, per firm. Still to build (readiness gaps 1–2):

1. Billing webhook (Stripe is the recommended provider; it handles Canadian tax on the
   subscription) that calls `set_firm_subscription` idempotently and adjusts `seat_limit`.
2. Licence issuance: an endpoint that signs the desktop licence (`plan`, `seats`, expiry) from
   the live subscription so desktop and cloud read the same entitlement.
3. Grace rules: past-due → read-only after 14 days; suspended → sign-in blocked, data kept 90
   days; cancelled → export available, deletion after hold.

---

## 10. Onboarding a firm (runbook)

1. Platform admin creates the firm and its subscription (or the firm self-serves at GA).
2. Owner accepts the invitation, sets firm sign-in policy, adds seats.
3. Owner or admin creates companies (or imports: QuickBooks Online Excel/CSV, the desktop
   `.company` via Firm Vault, or the migration export) and assigns staff.
4. Firm library seeded with templates; client users invited per company if wanted.
5. First-week check: audit report of who accessed what, seat usage, failed sign-ins.

---

## 11. Phases and gates

| Phase | What happens | Gate to pass |
|---|---|---|
| 0 — Finish testing (now) | desktop app testing completes; cloud code kept green (`verify-cloud.mjs`) | you say testing is finished |
| 1 — Foundation | Azure subscription, Entra External ID tenant, domain + certificate, `staging` + `prod` resource groups; foundation Bicep deployed; CI secrets set; first image deployed to staging | staging serves `/health`; a test firm signs in with MFA; backup restore drill passes |
| 2 — Files and vault | documents schema, quarantine handler, firm library, shares, Firm Vault in desktop | EICAR file is quarantined and never served; cross-firm negative tests for files pass; a `.company` checks out/in with a lock |
| 3 — Pilot | 2 real firms, ≤ 10 seats, on staging-grade prod; billing webhook and licence issuance live; monitoring and alerts on | 30 days without a severity-1 incident; pilot acceptance (`PILOT-ACCEPTANCE.md`) signed |
| 4 — GA pooled | Front Door + WAF, PgBouncer, load test at launch sizing, penetration test, DR rehearsal, contracts and privacy documents | load test green at 40 concurrent; pen-test findings closed; DR RTO met in rehearsal |
| 5 — Siloed tier | directory routing, dedicated server provisioning script, CMK per firm, tier migration export/import | a firm moved pooled → siloed with control totals reconciled to the cent |
| 6 — Parity | payroll, reports, PDFs, reconciliation in the web service so the desktop becomes optional | desktop verification suite passes against the hosted books |

**What I do:** everything in code and infrastructure (Bicep, API, desktop bridge, migrations,
CI, runbooks, tests), and I drive each deployment step with you at the keyboard for the parts
that need your credentials.

**What only you can do:** create the Azure subscription and set a budget; own the Entra
External ID tenant; register the domain and choose the product name on certificates; open the
Stripe (or other) billing account; sign the privacy and terms documents; approve each
production deployment; decide the open questions below.

---

## 12. Decisions needed from you

1. Regions: Canada Central + Canada East (recommended) — or another pair?
2. Product domain (e.g. `app.apexledger.ca`) and the sending address for invitations.
3. Billing provider: Stripe (recommended) or another.
4. Is the siloed tier a sellable option at launch, or added later (Phase 5 as written)?
5. Client access at launch: staff-only first (simpler), or clients uploading receipts from day
   one?
6. Firm Vault for desktop files at pilot, or hosted books only?

---

## 13. Cost of the plan itself

Engineering, at the pace of this session: Phase 1 about a week of work including your Azure
setup steps; Phase 2 two to three weeks; Phase 3 runs a month by definition; Phase 4 two to
three weeks plus the external penetration test; Phase 5 two weeks; Phase 6 is the long tail
(several months) and can proceed while firms are live on the earlier phases.
