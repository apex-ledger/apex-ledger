# Capacity plan: 200+ seats

The tenant model does not allocate a process or database per firm. Firms,
memberships and companies share a PostgreSQL cluster while row-level security
and authenticated membership enforce isolation. This keeps the small pilot
economical and permits horizontal scaling later.

## Initial production target

- 200 named seats, approximately 40-80 concurrent active users
- Azure Container Apps: minimum 2 replicas, maximum 10
- 0.5-1 vCPU and 1-2 GiB memory per API replica to start
- PostgreSQL connection pool: 10 connections per replica
- Azure PostgreSQL connection pooling enabled before scaling beyond two replicas
- Autoscale on HTTP concurrency and CPU; do not scale only on named-seat count
- Blob Storage for documents; no PDFs or scans inside PostgreSQL rows
- Real-time outbox delivered through Azure Web PubSub or SignalR

## Growth controls already represented

- `seat_limit` is enforced transactionally per firm
- membership roles are independent from subscription seat count
- tenant-owned rows carry `firm_id`; company data also carries `company_id`
- row-level security is forced on tenant tables
- every write API will require an idempotency key
- versions prevent silent overwrites when two accountants edit the same record
- append-only audit records preserve actor, request and before/after state
- readiness and liveness probes permit safe rolling deployments

## Scale test gates

Before accepting 200 production seats, run load tests at 80 concurrent users for
posting, reports and file upload; prove that one firm's identifiers cannot return
another firm's rows; test duplicate requests and simultaneous edits; and perform
a backup restoration into an isolated environment.
