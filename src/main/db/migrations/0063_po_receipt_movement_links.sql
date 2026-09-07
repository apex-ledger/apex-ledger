-- Inventory movements already have generic source-document columns. Backfill PO receipt ownership
-- from the shared GRNI journal so old receipts can be reversed without touching unrelated stock.
UPDATE inventory_movements
SET source_document_type = 'purchaseOrderReceipt',
    source_document_id = (
      SELECT por.id FROM purchase_order_receipts por
      WHERE por.journal_entry_id = inventory_movements.journal_entry_id
      ORDER BY por.id DESC LIMIT 1
    )
WHERE journal_entry_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM purchase_order_receipts por WHERE por.journal_entry_id = inventory_movements.journal_entry_id);
