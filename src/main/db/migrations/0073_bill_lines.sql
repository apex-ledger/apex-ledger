-- A bill can carry several lines — a supplier invoice that is part materials, part freight, part
-- equipment, each to its own account with its own tax treatment (the "Split Bill" every other
-- ledger shows). The bills row keeps its header figures (amount_cents is the grand total, and
-- category_account_id / tax_code / manual_hst_cents now describe the first line) so every screen
-- and report that reads a bill as one row keeps working unchanged.
CREATE TABLE bill_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  line_order INTEGER NOT NULL,
  category_account_id INTEGER NOT NULL REFERENCES accounts(id),
  description TEXT,
  -- Pre-tax amount; tax is on top and posts to GST/HST Recoverable (see buildTaxSplitLines.ts).
  base_cents INTEGER NOT NULL CHECK (base_cents >= 0),
  tax_code TEXT,
  tax_cents INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  product_id INTEGER REFERENCES products(id),
  quantity REAL
);

CREATE INDEX idx_bill_lines_bill ON bill_lines(bill_id, line_order);

-- Every existing bill was a single line: rebuild it from the header so old and new bills read
-- the same way. The header's amount_cents is the total; the pre-tax base is total minus the tax
-- recorded on the header (manual_hst_cents holds the real tax for every code, not only Manual).
INSERT INTO bill_lines (bill_id, line_order, category_account_id, description, base_cents, tax_code, tax_cents, product_id, quantity)
SELECT id, 0, category_account_id, memo,
       amount_cents - COALESCE(CASE WHEN tax_code IS NULL THEN 0 ELSE manual_hst_cents END, 0),
       tax_code,
       COALESCE(CASE WHEN tax_code IS NULL THEN 0 ELSE manual_hst_cents END, 0),
       product_id, quantity
FROM bills
-- Guarded: migrations are re-applied on every open, so a bill that already has lines is skipped.
WHERE NOT EXISTS (SELECT 1 FROM bill_lines bl WHERE bl.bill_id = bills.id);
