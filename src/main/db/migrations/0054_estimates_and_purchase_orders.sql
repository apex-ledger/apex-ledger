-- Estimates and purchase orders: documents that COMMIT to something without posting anything.
--
-- IMPORTANT: raw SQL — the CamelCasePlugin does NOT translate identifiers here. snake_case only.
--
-- Both are the same idea pointed in opposite directions. An estimate is what you have offered a
-- customer; a purchase order is what you have committed to a supplier. Neither is a transaction:
-- no money has moved and nothing is owed, so neither touches the ledger. That is exactly why they
-- need their own tables rather than a status flag on invoices and bills — an unaccepted quote
-- sitting in accounts receivable would overstate what the business is owed.
--
-- Each converts into its posting counterpart once it becomes real (estimate -> invoice,
-- purchase order -> bill), and keeps a link back so the same quote cannot be invoiced twice.

CREATE TABLE estimates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  estimate_number TEXT NOT NULL UNIQUE,
  estimate_date TEXT NOT NULL,
  -- When the offer lapses. Null means it does not expire.
  expiry_date TEXT,
  memo TEXT,
  total_cents INTEGER NOT NULL DEFAULT 0,
  -- 'draft' | 'sent' | 'accepted' | 'declined' | 'expired' | 'converted'
  status TEXT NOT NULL DEFAULT 'draft',
  -- The invoice this estimate became, once accepted and converted. What stops it converting twice.
  converted_invoice_id INTEGER REFERENCES invoices(id),
  converted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_estimates_customer ON estimates(customer_id);
CREATE INDEX idx_estimates_status ON estimates(status);

CREATE TABLE estimate_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  estimate_id INTEGER NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  line_order INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  revenue_account_id INTEGER NOT NULL REFERENCES accounts(id),
  tax_code TEXT,
  manual_hst_cents INTEGER,
  product_id INTEGER REFERENCES products(id)
);

CREATE INDEX idx_estimate_lines_estimate ON estimate_lines(estimate_id);

CREATE TABLE purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  po_number TEXT NOT NULL UNIQUE,
  order_date TEXT NOT NULL,
  -- When the goods or work are wanted by.
  expected_date TEXT,
  memo TEXT,
  total_cents INTEGER NOT NULL DEFAULT 0,
  -- 'draft' | 'sent' | 'received' | 'cancelled' | 'converted'
  status TEXT NOT NULL DEFAULT 'draft',
  converted_bill_id INTEGER REFERENCES bills(id),
  converted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_purchase_orders_vendor ON purchase_orders(vendor_id);
CREATE INDEX idx_purchase_orders_status ON purchase_orders(status);

CREATE TABLE purchase_order_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  line_order INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  -- Where the cost will land once this becomes a bill.
  category_account_id INTEGER NOT NULL REFERENCES accounts(id),
  tax_code TEXT,
  manual_hst_cents INTEGER,
  product_id INTEGER REFERENCES products(id)
);

CREATE INDEX idx_po_lines_po ON purchase_order_lines(purchase_order_id);
