# Apex Ledger two-firm pilot acceptance

Version: 0.1.330

No real customer data may enter the pilot until every mandatory item below has an owner, date, evidence link, and passing result. Use synthetic companies and transactions during acceptance.

## Identities and access

- Create Firm A and Firm B with two named seats each. Never reuse one identity for two people.
- Verify each seat must complete Entra sign-in and Apex Ledger email verification.
- Verify Firm A users cannot list, search, open, export, or infer Firm B companies, contacts, transactions, invoices, bills, reports, files, audit events, or totals.
- Assign one accountant to only one company in a multi-company firm and verify every other company is denied.
- Suspend a seat and verify existing sessions and new requests are denied. Reactivate it and confirm access returns without losing audit history.
- Expire an invitation, reuse an accepted invitation, and accept with a different email; all attempts must fail.

## Accounting collaboration

- Have seat 1 create a sale, expense, invoice, vendor bill, payment, and bank transfer. Seat 2 must see committed data after refresh without file copying.
- Attempt two simultaneous invoice creations and verify unique invoice numbers and balanced journals.
- Attempt duplicate supplier invoice and duplicate bank statement imports; both duplicates must be blocked or clearly staged without duplicate posting.
- Verify HST collected posts to HST payable, vendor ITC posts to HST recoverable, and every journal remains balanced to the cent.
- Verify a viewer cannot post or change data and that posted corrections use void/reversal workflows with confirmation and reason.

## Subscription administration

- Customer Support can renew, suspend, reactivate, and mark past due only with an audit reason.
- Customer Support cannot cancel service, change the plan, grant itself firm access, or inspect accounting data.
- A Platform Administrator performs an approved plan change and verifies the before/after record is append-only.
- Suspended service blocks application reads and writes while preserving data. Past-due service follows the documented read-only policy.

## Security, malware, and privacy

- Upload a plain synthetic CSV and verify it stages without posting.
- Upload the EICAR antivirus test file only in the isolated pilot; verify rejection/quarantine and Defender evidence. Never use live malware.
- Verify no OTP, raw SIN, database credential, email token, or contact-search key appears in browser output, API responses, logs, traces, or support screens.
- Confirm uploaded documents cannot be downloaded before a clean Defender scan event.
- Run dependency, secret, source, container, and infrastructure scans; resolve or formally accept every high/critical result.

## Reliability and recovery

- Run at least two API replicas, stop one replica, and verify requests continue.
- Restore PostgreSQL and one deleted/versioned blob into an isolated recovery environment.
- Reconcile trial balance, AR, AP, HST, invoice, bill, and bank control totals against the source environment.
- Confirm monitoring alerts reach the on-call contact for API unavailability, database failure, email failure, malware detection, and unusual authorization denials.

## Acceptance record

Record: environment/resource identifiers, application image digest, web artifact hash, migration version, tester names, test dates, defects, remediation evidence, backup restore time, and final approval by the product owner and security/accounting reviewers.
