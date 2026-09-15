-- Where an employee's pay stubs and T4 slips are emailed. Nullable: most files have none yet, and
-- a slip is never sent to an address nobody entered. Idempotent — the runner re-applies every
-- migration on open and tolerates the duplicate-column error.
ALTER TABLE employees ADD COLUMN email TEXT;
