-- Employee mailing address — required on a T4 slip (the employee's name and address block).
-- Split into the same fields as company_info's address so both print the same way.
ALTER TABLE employees ADD COLUMN address_line1 TEXT;
ALTER TABLE employees ADD COLUMN address_line2 TEXT;
ALTER TABLE employees ADD COLUMN address_city TEXT;
ALTER TABLE employees ADD COLUMN address_province TEXT;
ALTER TABLE employees ADD COLUMN address_postal_code TEXT;
