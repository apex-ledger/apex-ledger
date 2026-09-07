-- One item catalogue now serves purchasing, sales/POS, and inventory.
ALTER TABLE products ADD COLUMN purchase_price_cents INTEGER NOT NULL DEFAULT 0;

-- A simple bill can receive one catalogue item. Multi-item supplier purchases continue to use
-- Purchase Orders, whose lines already carry product and quantity.
ALTER TABLE bills ADD COLUMN product_id INTEGER REFERENCES products(id);
ALTER TABLE bills ADD COLUMN quantity REAL;
CREATE INDEX idx_bills_product ON bills(product_id);
