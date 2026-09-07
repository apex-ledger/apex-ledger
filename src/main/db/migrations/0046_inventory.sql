-- Products and their stock movements.
--
-- Until now this app recorded purchases as expenses and carried closing inventory as a single
-- figure typed in at year end from a physical count. That is workable for a small file and is why
-- the Inventory group in Reports has been empty — there was nothing to report on. These two tables
-- are what an inventory report, a stock valuation, and a real cost of goods sold all need.
--
-- Names are snake_case: this is raw SQL against the real schema, and Kysely's CamelCasePlugin
-- translates only for the application code, never for a migration.

CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- The code on the shelf label or the supplier's invoice. Unique when present so a scan or an
  -- import can find exactly one product, but optional because plenty of small shops do not use one.
  sku TEXT UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  -- What one of it is: each, kg, case, hour. Free text — the unit of a grocery item and of a
  -- consulting hour have nothing in common and a fixed list would fit neither.
  unit TEXT NOT NULL DEFAULT 'each',
  sale_price_cents INTEGER NOT NULL DEFAULT 0,
  -- Where the three sides of a stock transaction post. Nullable so a product can be set up before
  -- the chart of accounts has the right accounts on it.
  income_account_id INTEGER REFERENCES accounts(id),
  cogs_account_id INTEGER REFERENCES accounts(id),
  asset_account_id INTEGER REFERENCES accounts(id),
  -- Off for a service or a non-stock item: it can still be sold and priced, but no quantity is
  -- kept and it never appears on the stock report.
  track_quantity INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_active ON products(is_active);

-- One row per movement in or out. Stock on hand is the sum of these rather than a running total
-- held on the product: a stored total drifts the moment anything is edited or deleted, and cannot
-- answer "what was on hand at last year end", which is exactly what a balance sheet needs.
CREATE TABLE inventory_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  movement_date TEXT NOT NULL,
  -- Positive brings stock in, negative takes it out.
  quantity_delta REAL NOT NULL,
  -- Cost per unit for an inbound movement. Null on the way out: an issue always leaves at the
  -- running weighted average, never at whatever price was typed at the time.
  unit_cost_cents INTEGER,
  -- 'purchase' | 'sale' | 'adjustment' | 'opening'
  kind TEXT NOT NULL,
  -- The journal entry this movement was posted with, when there is one. Null for a stock count or
  -- a quantity correction that moved no money.
  journal_entry_id INTEGER REFERENCES journal_entries(id) ON DELETE SET NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_inventory_movements_product ON inventory_movements(product_id);
CREATE INDEX idx_inventory_movements_date ON inventory_movements(movement_date);
