-- Receipt-level audit trail and GRNI supplier-bill matching metadata.
CREATE TABLE purchase_order_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  receipt_date TEXT NOT NULL,
  journal_entry_id INTEGER REFERENCES journal_entries(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_po_receipts_po ON purchase_order_receipts(purchase_order_id);

CREATE TABLE purchase_order_receipt_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id INTEGER NOT NULL REFERENCES purchase_order_receipts(id) ON DELETE CASCADE,
  purchase_order_line_id INTEGER NOT NULL REFERENCES purchase_order_lines(id) ON DELETE CASCADE,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit_cost_cents INTEGER NOT NULL CHECK (unit_cost_cents >= 0),
  accrued_cost_cents INTEGER NOT NULL CHECK (accrued_cost_cents >= 0)
);
CREATE INDEX idx_po_receipt_lines_receipt ON purchase_order_receipt_lines(receipt_id);
CREATE INDEX idx_po_receipt_lines_line ON purchase_order_receipt_lines(purchase_order_line_id);

ALTER TABLE purchase_orders ADD COLUMN matched_bill_id INTEGER REFERENCES bills(id);
ALTER TABLE purchase_orders ADD COLUMN matched_at TEXT;
