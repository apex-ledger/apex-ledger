-- An accepted estimate is a sales order: the customer has said yes, goods or work are owed, and
-- nothing is in the ledger yet. What a sales order tracks on top of a quote: whether it has been
-- fulfilled (shipped / done), when it is wanted by, which purchase order was raised to source it,
-- and when it was closed without invoicing. Same table, because it is the same document at a
-- later stage — a separate table would make "did this quote become an order" a join.
ALTER TABLE estimates ADD COLUMN fulfillment_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE estimates ADD COLUMN ship_date TEXT;
ALTER TABLE estimates ADD COLUMN required_by_date TEXT;
ALTER TABLE estimates ADD COLUMN converted_purchase_order_id INTEGER REFERENCES purchase_orders(id);
ALTER TABLE estimates ADD COLUMN closed_at TEXT;
