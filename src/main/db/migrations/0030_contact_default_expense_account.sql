ALTER TABLE vendors ADD COLUMN default_expense_account_id INTEGER REFERENCES accounts(id);
ALTER TABLE customers ADD COLUMN default_expense_account_id INTEGER REFERENCES accounts(id);
