ALTER TABLE employees ADD COLUMN sin TEXT;

ALTER TABLE vendors ADD COLUMN is_t4a_contractor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE vendors ADD COLUMN t4a_sin TEXT;
ALTER TABLE vendors ADD COLUMN t4a_business_number TEXT;

ALTER TABLE customers ADD COLUMN is_t4a_contractor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN t4a_sin TEXT;
ALTER TABLE customers ADD COLUMN t4a_business_number TEXT;
