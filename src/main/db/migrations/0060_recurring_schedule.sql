ALTER TABLE recurring_templates ADD COLUMN schedule_frequency TEXT
  CHECK (schedule_frequency IS NULL OR schedule_frequency IN ('weekly', 'monthly', 'quarterly', 'annually'));
ALTER TABLE recurring_templates ADD COLUMN next_due_date TEXT;
ALTER TABLE recurring_templates ADD COLUMN last_used_date TEXT;
CREATE INDEX idx_recurring_templates_next_due ON recurring_templates(next_due_date);
