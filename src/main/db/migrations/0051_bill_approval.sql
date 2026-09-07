-- Approval state on bills.
--
-- A bill arriving is not the same as a bill someone has agreed to pay. In any business with more
-- than one person, something has to sit between "the supplier sent this" and "money left the
-- account", and today there is nothing: a bill is entered and is immediately payable.
--
-- The state is deliberately separate from the paid/unpaid status a bill already carries. They
-- answer different questions — has anyone agreed to this, and has it been settled — and folding
-- them into one field would make "approved but unpaid" impossible to express, which is the state
-- most bills spend most of their life in.
--
-- Existing bills default to 'approved'. Anything already entered predates this workflow, and
-- retroactively marking a year of paid bills as awaiting approval would be false.

ALTER TABLE bills ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE bills ADD COLUMN approved_by TEXT;
ALTER TABLE bills ADD COLUMN approved_at TEXT;
-- Why it was rejected. Kept on the bill rather than thrown away, because "we are not paying this"
-- is a decision somebody will be asked about later.
ALTER TABLE bills ADD COLUMN approval_note TEXT;

CREATE INDEX idx_bills_approval ON bills(approval_status);
