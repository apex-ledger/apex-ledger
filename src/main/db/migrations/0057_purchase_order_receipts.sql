-- Purchase-order goods receipts. Receiving inventory is an accounting event even when the supplier
-- invoice has not arrived: Dr Inventory / Cr Goods Received Not Invoiced (GRNI). The later supplier
-- bill must clear GRNI into Accounts Payable rather than debit Inventory a second time.
ALTER TABLE purchase_orders ADD COLUMN received_at TEXT;
ALTER TABLE purchase_orders ADD COLUMN receipt_journal_entry_id INTEGER REFERENCES journal_entries(id);
ALTER TABLE purchase_order_lines ADD COLUMN received_quantity REAL NOT NULL DEFAULT 0;
