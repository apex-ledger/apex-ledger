-- Ontario Employer Health Tax: whether the company may claim the $1,000,000 exemption (private
-- sector, under $5M of remuneration) and its share of it when split across an associated group.
ALTER TABLE company_info ADD COLUMN eht_exemption_eligible INTEGER NOT NULL DEFAULT 1;
ALTER TABLE company_info ADD COLUMN eht_exemption_cents INTEGER NOT NULL DEFAULT 100000000;
