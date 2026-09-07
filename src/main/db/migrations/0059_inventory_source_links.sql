-- Trace stock movements back to the business document that created them. This lets invoice posting
-- and COGS remain one atomic event and prevents the same invoice line from reducing stock twice.
ALTER TABLE inventory_movements ADD COLUMN source_document_type TEXT;
ALTER TABLE inventory_movements ADD COLUMN source_document_id INTEGER;
ALTER TABLE inventory_movements ADD COLUMN source_line_id INTEGER;
CREATE INDEX idx_inventory_movements_source ON inventory_movements(source_document_type, source_document_id);
CREATE UNIQUE INDEX idx_inventory_movements_invoice_line
  ON inventory_movements(source_document_type, source_line_id)
  WHERE source_document_type = 'invoice' AND source_line_id IS NOT NULL;
