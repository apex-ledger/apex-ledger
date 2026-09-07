-- Brings older company files in line with the current Chart of Accounts templates, which name
-- account 1010 "Cash Account" and map it to GIFI 1001 "Cash". Files created by an earlier version
-- still carry it as "Petty Cash" against GIFI code 1010.
--
-- 1010 was never a real CRA GIFI code. It was dropped from the shipped seed once that was confirmed
-- against RC4088 Appendix A, but seedGifiCodes only inserts and updates rows, never deletes them,
-- so the stale entry survived in every existing file and kept appearing in the GIFI picker.
-- Petty cash rolls into 1001 "Cash".

-- Renamed only when the file does not already have a Cash Account, so a file that has both does not
-- end up with two identically named accounts. Anything left behind is a real merge decision for the
-- accountant, not something a migration should guess at.
UPDATE accounts
SET name = 'Cash Account'
WHERE lower(name) = 'petty cash'
  AND NOT EXISTS (SELECT 1 FROM accounts other WHERE lower(other.name) = 'cash account');

-- Order matters: accounts.gifi_code is a FOREIGN KEY to gifi_codes(code), so accounts have to move
-- off 1010 before the code row can be deleted.
UPDATE accounts SET gifi_code = '1001' WHERE gifi_code = '1010';

-- Only the shipped row (is_custom = 0). If an accountant deliberately created 1010 as a custom code
-- for their own reporting, that is their decision and it stays.
DELETE FROM gifi_codes WHERE code = '1010' AND is_custom = 0;
