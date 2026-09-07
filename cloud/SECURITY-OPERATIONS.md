# Apex Ledger security operations

## Identity and second factor

- Microsoft Entra External ID remains the password authority; Apex Ledger never receives or stores user passwords.
- Production sets `MFA_REQUIRED=true`. After Entra sign-in, the API sends a six-digit code only to the verified email claim.
- Codes are random, stored only as an HMAC, expire after 10 minutes, allow at most five attempts, are invalidated when a replacement is issued, and are consumed once.
- Successful verification issues an identity-bound eight-hour second-factor session. It is stored in browser session storage and cleared on sign-out.
- Entra Conditional Access should still require stronger MFA for platform administrators. Email OTP is a useful additional control, not a substitute for phishing-resistant authentication for privileged staff.

## Upload safety

- The bank CSV endpoint allows only `.csv`, has a strict size and row limit, rejects binary/executable headers, NUL bytes, active HTML content and known antivirus test signatures, and stages rows without posting them.
- Receipt, PDF and image uploads must use a quarantine container. Defender for Storage on-upload scanning is enabled by `infra/main.bicep`; only a clean scan event may move a blob to `accepted-documents`.
- Keep blob public access and shared-key authentication disabled. Use managed identity and short-lived user delegation URLs only after authorization and clean-scan verification.
- Enable built-in soft-delete remediation or an Event Grid quarantine handler before enabling customer document upload.

## Malware and supply-chain controls

- Build containers with `npm ci` from committed lockfiles, run `npm audit`, scan the image in the registry, generate an SBOM, and sign the promoted digest. Deploy by immutable digest in production.
- Do not promise that any application is “virus proof.” The operating goal is layered prevention, detection, quarantine, audit, recovery and rapid patching.
- Run secret scanning, dependency review, static analysis and container scanning on every pull request. Block critical/high findings unless a documented security owner accepts a time-limited exception.

## Incident response

1. Suspend affected memberships or the firm subscription without deleting data.
2. Revoke sessions in Entra, rotate Key Vault secrets and preserve logs/audit events.
3. Quarantine affected blobs and retain hashes and Defender findings.
4. Determine affected firms/companies using tenant-scoped audit data; never expose another tenant while investigating.
5. Restore into an isolated environment, reconcile accounting control totals, notify affected customers under the approved privacy/breach procedure, and document corrective actions.
