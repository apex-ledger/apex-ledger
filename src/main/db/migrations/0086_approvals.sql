-- Approval workflow for manual journal entries and purchase orders above a company threshold.
-- Bills already carry approval_status; this brings journals and POs to the same standard.
ALTER TABLE company_info ADD COLUMN approval_journal_threshold_cents INTEGER;
ALTER TABLE company_info ADD COLUMN approval_po_threshold_cents INTEGER;
ALTER TABLE journal_entries ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'notRequired';
ALTER TABLE journal_entries ADD COLUMN approved_by TEXT;
ALTER TABLE journal_entries ADD COLUMN approved_at TEXT;
ALTER TABLE journal_entries ADD COLUMN approval_note TEXT;
ALTER TABLE purchase_orders ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'notRequired';
ALTER TABLE purchase_orders ADD COLUMN approved_by TEXT;
ALTER TABLE purchase_orders ADD COLUMN approved_at TEXT;
ALTER TABLE purchase_orders ADD COLUMN approval_note TEXT;
