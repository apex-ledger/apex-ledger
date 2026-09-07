ALTER TABLE hst_filings ADD COLUMN fiscal_period_id INTEGER REFERENCES fiscal_periods(id);

-- Existing filed returns must receive the same protection as new ones. The distinctive label
-- marks these locks as filing-owned so voiding a return never removes a year-end lock the user
-- created independently.
-- Guarded: the runner re-applies every migration on every open, so without the NOT EXISTS this
-- inserted one more lock row per launch.
INSERT INTO fiscal_periods (period_start, period_end, label, is_locked, locked_at)
SELECT h.period_start, h.period_end, 'GST/HST filed — ' || h.period_start || ' to ' || h.period_end, 1, datetime('now')
FROM hst_filings h
WHERE NOT EXISTS (SELECT 1 FROM fiscal_periods fp WHERE fp.label = 'GST/HST filed — ' || h.period_start || ' to ' || h.period_end);

UPDATE hst_filings
SET fiscal_period_id = (
  SELECT fp.id FROM fiscal_periods fp
  WHERE fp.label = 'GST/HST filed — ' || hst_filings.period_start || ' to ' || hst_filings.period_end
  ORDER BY fp.id ASC LIMIT 1
)
WHERE fiscal_period_id IS NULL;
