ALTER TABLE bills ADD COLUMN bill_number TEXT;

-- A supplier can never issue the same invoice number twice. Keep the field optional for receipts
-- and historic files, but make a supplied number case-insensitively unique for that vendor.
CREATE UNIQUE INDEX idx_bills_vendor_number
ON bills(vendor_id, bill_number COLLATE NOCASE)
WHERE bill_number IS NOT NULL AND trim(bill_number) <> '';
