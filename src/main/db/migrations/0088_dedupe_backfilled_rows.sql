-- Cleans up the rows that the 0071 and 0073 backfills inserted once per launch before they were
-- guarded: one bill line and one credit-note application per open. Exact copies go first; then a
-- header-shaped extra line 0 on a bill that also has a real line 0. Safe to re-run.
DELETE FROM bill_lines
WHERE id NOT IN (
  SELECT MIN(id) FROM bill_lines
  GROUP BY bill_id, line_order, category_account_id, IFNULL(description, ''), base_cents, IFNULL(tax_code, ''), tax_cents, IFNULL(product_id, 0), IFNULL(quantity, 0)
);

DELETE FROM bill_lines
WHERE id IN (
  SELECT bl.id FROM bill_lines bl
  JOIN bills b ON b.id = bl.bill_id
  WHERE bl.line_order = 0
    AND IFNULL(bl.description, '') = IFNULL(b.memo, '')
    AND bl.category_account_id = b.category_account_id
    AND EXISTS (
      SELECT 1 FROM bill_lines o
      WHERE o.bill_id = bl.bill_id AND o.line_order = 0 AND o.id <> bl.id
        AND NOT (IFNULL(o.description, '') = IFNULL(b.memo, '') AND o.category_account_id = b.category_account_id)
    )
);

-- The backfill dated its copy with the credit note date while the real application carries the
-- day it was applied, so the date is not part of the match. Copies are only removed when the
-- group adds up to more than the note itself, which a genuine second application never does.
DELETE FROM credit_note_applications
WHERE id NOT IN (
  SELECT MIN(a.id) FROM credit_note_applications a
  GROUP BY a.credit_note_id, IFNULL(a.target_id, 0), a.amount_cents
)
AND credit_note_id IN (
  SELECT a.credit_note_id FROM credit_note_applications a
  JOIN credit_notes cn ON cn.id = a.credit_note_id
  GROUP BY a.credit_note_id
  HAVING SUM(a.amount_cents) > cn.total_cents
);
