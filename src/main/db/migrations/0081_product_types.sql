-- Product type and category, and bundles. The type replaces the bare track-quantity flag as the
-- thing the dropdown groups by; existing rows keep their behaviour (counted stock stays
-- inventory, everything else reads as a service). A bundle is a kit of other products sold as one
-- line and expanded into its components when picked.
ALTER TABLE products ADD COLUMN product_type TEXT NOT NULL DEFAULT 'inventory';
ALTER TABLE products ADD COLUMN category TEXT;
-- Guarded so a re-run never touches a type the user has since chosen (bundle, non-inventory).
UPDATE products SET product_type = 'service' WHERE track_quantity = 0 AND product_type = 'inventory';

CREATE TABLE product_bundle_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bundle_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  component_product_id INTEGER NOT NULL REFERENCES products(id),
  quantity REAL NOT NULL DEFAULT 1
);
CREATE INDEX idx_product_bundle_items_bundle ON product_bundle_items(bundle_product_id);
