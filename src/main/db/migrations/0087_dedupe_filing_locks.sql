-- Removes the duplicate "GST/HST filed" lock rows that 0062 inserted once per launch before it was
-- guarded. Filings are pointed at the lowest-id row for their label first, then every other row
-- with that label goes. Safe to re-run: a second pass finds nothing to delete.
UPDATE hst_filings
SET fiscal_period_id = (
  SELECT MIN(fp.id) FROM fiscal_periods fp
  WHERE fp.label = 'GST/HST filed — ' || hst_filings.period_start || ' to ' || hst_filings.period_end
);

DELETE FROM fiscal_periods
WHERE label LIKE 'GST/HST filed — %'
  AND id NOT IN (SELECT MIN(id) FROM fiscal_periods WHERE label LIKE 'GST/HST filed — %' GROUP BY label);
