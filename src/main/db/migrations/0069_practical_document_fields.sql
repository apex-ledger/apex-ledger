-- Practical source-document fields that must survive after a form is saved.
ALTER TABLE customers ADD COLUMN company_name TEXT;
ALTER TABLE customers ADD COLUMN contact_name TEXT;
ALTER TABLE customers ADD COLUMN website TEXT;
ALTER TABLE customers ADD COLUMN shipping_address TEXT;

ALTER TABLE vendors ADD COLUMN company_name TEXT;
ALTER TABLE vendors ADD COLUMN contact_name TEXT;
ALTER TABLE vendors ADD COLUMN website TEXT;
ALTER TABLE vendors ADD COLUMN shipping_address TEXT;

ALTER TABLE products ADD COLUMN barcode TEXT;
ALTER TABLE products ADD COLUMN default_tax_code TEXT;
ALTER TABLE products ADD COLUMN reorder_point REAL NOT NULL DEFAULT 0;

ALTER TABLE invoices ADD COLUMN customer_po_number TEXT;
ALTER TABLE invoices ADD COLUMN shipping_address TEXT;

ALTER TABLE bills ADD COLUMN purchase_order_number TEXT;

CREATE UNIQUE INDEX idx_products_barcode_unique ON products(barcode) WHERE barcode IS NOT NULL AND barcode <> '';
