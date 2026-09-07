-- A recurring template can post as a vendor bill (unpaid, into Accounts Payable) instead of a
-- paid expense. Rent, insurance and subscriptions arrive as bills; keying them each month was
-- the last recurring thing still done by hand.
ALTER TABLE recurring_templates ADD COLUMN bill_vendor_id INTEGER REFERENCES vendors(id);
ALTER TABLE recurring_templates ADD COLUMN bill_due_days INTEGER;
