ALTER TABLE shareholders ADD COLUMN loan_account_id INTEGER REFERENCES accounts(id);
