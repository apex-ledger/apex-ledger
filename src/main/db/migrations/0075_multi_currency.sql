-- Multi-currency the way a firm with US clients needs it: a bank or card account can be held in
-- a foreign currency, and settling a foreign invoice or bill records the rate the money actually
-- converted at, so the realized exchange gain or loss is posted by the app instead of by hand.
ALTER TABLE accounts ADD COLUMN currency TEXT NOT NULL DEFAULT 'CAD';

ALTER TABLE invoice_payments ADD COLUMN foreign_amount_cents INTEGER;
ALTER TABLE invoice_payments ADD COLUMN exchange_rate REAL;
ALTER TABLE invoice_payments ADD COLUMN fx_gain_loss_cents INTEGER NOT NULL DEFAULT 0;

ALTER TABLE bill_payments ADD COLUMN foreign_amount_cents INTEGER;
ALTER TABLE bill_payments ADD COLUMN exchange_rate REAL;
ALTER TABLE bill_payments ADD COLUMN fx_gain_loss_cents INTEGER NOT NULL DEFAULT 0;
