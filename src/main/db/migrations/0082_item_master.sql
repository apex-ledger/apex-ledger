-- Item master: the purchasing and warehouse facts an ERP keeps on an item beyond its price and
-- accounts. All optional; nothing here changes how a line posts.
ALTER TABLE products ADD COLUMN preferred_vendor_id INTEGER REFERENCES vendors(id);
ALTER TABLE products ADD COLUMN lead_time_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN minimum_order_quantity REAL NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN reorder_quantity REAL NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN bin_location TEXT;
ALTER TABLE products ADD COLUMN manufacturer TEXT;
ALTER TABLE products ADD COLUMN manufacturer_part_number TEXT;
ALTER TABLE products ADD COLUMN weight_kg REAL;
ALTER TABLE products ADD COLUMN notes TEXT;
