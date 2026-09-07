-- Late-payment interest: the annual rate a customer has agreed to (null = never charged), and on
-- each invoice the last day interest has been charged for, so a second run never bills the same
-- days twice.
ALTER TABLE customers ADD COLUMN late_interest_rate_percent REAL;
ALTER TABLE invoices ADD COLUMN late_interest_charged_through TEXT;
