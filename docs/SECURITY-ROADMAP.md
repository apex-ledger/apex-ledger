# Security and resilience roadmap

Held on 2026-09-11 at the owner's request ("hold for now but keep a list to implement later").
Target: match or beat the claims on quickbooks.intuit.com/ca/security while keeping live data and
backups in Canada, which Intuit does not.

## Already in place (2026-09-11)

- HTTPS forced with HSTS; disks encrypted at rest (AES-256).
- Firewall: only 443 open to the internet; SSH from one address, keys only.
- Daily Azure VM backup, 30 days, geo-redundant within Canada, soft delete 14 days.
- Microsoft Defender for Servers plan 1; Defender for Endpoint agent auto-deploying.
- ClamAV on the server, signatures auto-updated, nightly scan at 07:15 UTC with quarantine.
- Automatic security updates; kernel rebooted 2026-09-11.
- Monthly budget CA$200 with emails at 50/80/100% actual and 100% forecast.
- Seat-based access enforced on the server; per-firm file isolation verified on every route.
- Always-on Activity Log; posted entries voided, never deleted.

## Stage 1: no extra cost, development time only

1. Multi-factor authentication for email sign-ins (authenticator-app codes); Microsoft sign-in
   already carries the firm's own MFA. Biggest lever on insurance premium and enterprise checklists.
2. App-level backup of every company file every four hours, 30 days kept, plus a copy to a separate
   Azure storage account (about CA$3/month). Nightly VM backup stays.
3. Sign-in log per user, visible to the firm owner (successes and failures, address, time).
4. Extra Azure Monitor alerts: CPU, disk space, failed sign-in bursts, antivirus detections.
5. Immutable backup vault (cannot be shortened or deleted, even by an attacker with the password).
6. Written policies: security, incident response, backup and restore, access control, privacy.
7. Rewrite website/security.html to state the above in Intuit's structure, plus "live data never
   leaves Canada".

## Stage 2: when the first paying enterprise firm signs

- Annual penetration test by a Canadian firm (CA$8,000 to $20,000).
- Warm standby VM in Canada East restored from backup, DNS switch on failure (about CA$90/month).
- Key Vault for secrets; private endpoints for storage.
- Cyber plus technology E&O insurance, CA$2M limits (CA$5,000 to $12,000/year).
- Lawyer's review of the Subscription Agreement and privacy page.

## Stage 3: when a client's contract demands it

- SOC 2 Type I then Type II (CA$30,000 to $50,000 first year, then $15,000 to $30,000/year).
- Web application firewall (Azure Front Door WAF, about CA$300/month) or Cloudflare (note: TLS
  terminates outside Canada in transit).
- Active-active across two regions (re-architecture away from files on one disk).
- ISO 27001, DDoS protection plan, managed 24/7 security monitoring.

## Reference: Intuit claims mapped (2026-09-11)

| Intuit claim | ApexLedger | Gap closed by |
|---|---|---|
| TLS in transit, AES-256 at rest | Same | — |
| Firewalled servers | Same | — |
| Physical security, certified data centres | Inherited (ISO 27001, SOC 1/2/3) | — |
| Permission levels | Four seat types, server-enforced | — |
| Users can export data | Company file download | — |
| Always-on activity log | Same | — |
| Backups multiple times a day, offsite | Nightly only | Stage 1 item 2 |
| 24/7 monitoring | Availability alert + Defender | Stage 1 item 4; managed service in Stage 3 |
| Multi-factor authentication | Microsoft sign-in only | Stage 1 item 1 |
| Multi-region failover | None | Stage 2 warm standby; Stage 3 active-active |
| Records every login | Not yet | Stage 1 item 3 |
| Privacy certification (TRUSTe) | PIPEDA statement | SOC 2 in Stage 3 |
| Live data in the US, backups in Canada | Live data and backups both in Canada | Already better |
