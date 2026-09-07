# Apex Ledger pilot threat model

Version: 0.1.330

## Protected assets and trust boundaries

The highest-value assets are accounting records, customer/vendor personal data, SIN-derived lookup values, payroll data, uploaded documents, credentials, subscription authority, audit history, backups, and signing keys. Trust boundaries exist between the browser and API, each user and firm, each firm and company, the API and PostgreSQL, quarantine and accepted storage, customer roles and platform staff, and build systems and production.

## Priority threats and controls

| Threat | Required controls | Remaining pilot evidence |
|---|---|---|
| Cross-firm or cross-company disclosure | Entra identity, membership checks, company assignments, PostgreSQL row security, negative isolation tests | Repeat against native Azure PostgreSQL and browser sessions |
| Account takeover | Entra policies, emailed second-factor session, attempt/expiry limits, session revocation, stronger administrator MFA | Live Entra Conditional Access and ACS Email tests |
| Privileged support abuse | Separate platform roles, no company-data permission, reason-required append-only subscription actions | Independent role review and production log alert |
| Record tampering or silent overwrite | Atomic balanced journals, idempotency, optimistic versions, append-only audit/outbox, void/reversal corrections | Concurrency and restore reconciliation in Azure |
| Malicious or disguised upload | Allowlist, size/content checks, quarantine, Defender scan, no public blobs, clean-only promotion | Defender event integration and EICAR acceptance evidence |
| Secret or SIN exposure | Key Vault references, managed identity, HMAC-only OTP/SIN lookup, masked UI, log review | Automated secret scan and production telemetry review |
| Dependency or image compromise | Lockfiles, `npm ci`, source/dependency/container scans, SBOM, signed immutable digest | CI evidence, signer protection, and verified deployment policy |
| Denial of service or resource exhaustion | Request/body limits, database timeouts/pooling, autoscale ceiling, two minimum replicas, monitoring | Load test, alert thresholds, and cost guardrails |
| Backup theft or failed recovery | Azure encryption, private database access, soft deletion/versioning, restricted operators, restore drills | Isolated restore and control-total reconciliation |
| Billing/admin mistake | Restricted actions, confirmation/reason, append-only before/after record, second approval for cancellation | Operational approval workflow and audit sampling |

## Non-negotiable release conditions

- No security control is bypassed to make a test pass.
- No uploaded file is trusted because of its extension or client-supplied content type.
- No support or platform role implicitly grants access to customer accounting data.
- No customer deletion, cancellation, restore, or migration is performed without a recoverable plan and an audit record.
- A security review must update this model when payroll, live bank feeds, document parsing, public APIs, mobile clients, or new regions are introduced.
