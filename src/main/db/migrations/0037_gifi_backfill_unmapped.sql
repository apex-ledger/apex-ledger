-- Backfill GIFI codes for the two chart-of-accounts template accounts that shipped unmapped
-- (gifi_code NULL), so existing companies stop flagging them as "Unmapped" on the GIFI Export and
-- dashboard.
--   1290 Suspense Account (Bank Errors)  is a current asset       to 1480 "Other current assets"
--   5990 Vendor Refunds & Rebates        is an operating expense  to 9270 "Other expenses"
--     (a credit-balance/contra expense that correctly reduces total expenses on the GIFI schedule)
-- NOTE: this file must contain no semicolon characters except the two statement terminators below.
-- The migration runner splits statements on the semicolon, so one anywhere else (even in a comment)
-- would cut a statement in half and produce a bogus SQL fragment.
-- The EXISTS check never violates the accounts.gifi_code foreign key when an older company file
-- lacks those GIFI rows, and the gifi_code IS NULL check only touches still-unmapped accounts so a
-- hand assignment is never overwritten.
UPDATE accounts SET gifi_code = '1480'
WHERE code = '1290' AND gifi_code IS NULL
  AND EXISTS (SELECT 1 FROM gifi_codes WHERE code = '1480');

UPDATE accounts SET gifi_code = '9270'
WHERE code = '5990' AND gifi_code IS NULL
  AND EXISTS (SELECT 1 FROM gifi_codes WHERE code = '9270');
