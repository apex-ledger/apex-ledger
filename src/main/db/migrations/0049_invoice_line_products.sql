-- Links an invoice or sales receipt line to a product.
--
-- Until now selling something took two separate actions: raise the invoice, then go to Products and
-- record the stock movement. Nobody remembers both every time, so stock drifts from reality within
-- a week and the inventory reports quietly stop being true.
--
-- With a product on the line, posting the invoice can do all of it — revenue, receivable, cost of
-- goods sold, and the quantity — from one action.
--
-- Nullable on purpose: a line for consulting hours or a delivery charge has no product behind it,
-- and forcing one would make the common case harder to serve the uncommon one.

ALTER TABLE invoice_lines ADD COLUMN product_id INTEGER REFERENCES products(id);
ALTER TABLE sales_receipt_lines ADD COLUMN product_id INTEGER REFERENCES products(id);

CREATE INDEX idx_invoice_lines_product ON invoice_lines(product_id);
CREATE INDEX idx_sales_receipt_lines_product ON sales_receipt_lines(product_id);
