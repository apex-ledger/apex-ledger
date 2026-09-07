-- Payment terms on contacts and on the documents themselves.
--
-- IMPORTANT: raw SQL, so the CamelCasePlugin does NOT translate anything here. Every identifier
-- must be written in snake_case exactly as the schema has it.
--
-- Stored in two places on purpose. The contact carries the DEFAULT — what this customer is normally
-- given — and each invoice or bill carries what was actually agreed at the time. Keeping only the
-- contact's value would mean changing a customer's terms silently moved the due date of an invoice
-- sent last year; keeping only the document's would mean retyping the same terms on every one.
--
-- Existing rows get no value at all rather than a guessed one. A due date is already stored on
-- every invoice and bill, so the term can be read back from the two dates (see termFromDates) and
-- stamping 'net30' over documents that were never on Net 30 would be inventing history.
ALTER TABLE customers ADD COLUMN payment_terms TEXT;
ALTER TABLE vendors ADD COLUMN payment_terms TEXT;
ALTER TABLE invoices ADD COLUMN payment_terms TEXT;
ALTER TABLE bills ADD COLUMN payment_terms TEXT;
