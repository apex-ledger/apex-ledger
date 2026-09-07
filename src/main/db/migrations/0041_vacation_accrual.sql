-- Optional vacation pay accrual. Default 0 keeps every existing employee on the current behaviour
-- (vacation paid out with each cheque), so posted pay runs stay consistent with how they were
-- calculated. When 1, vacation pay is accrued to a Vacation Pay Payable liability instead: the
-- expense is recognized each period, but no CPP/EI/income tax applies until it is actually paid
-- out, which is the CRA treatment for vacation pay held in trust.
ALTER TABLE employees ADD COLUMN vacation_pay_accrued INTEGER NOT NULL DEFAULT 0;

-- Marks a pay run that pays out previously accrued vacation. Its gross IS the vacation being paid,
-- so source deductions apply normally, but the debit clears Vacation Pay Payable instead of hitting
-- wages expense a second time (the expense was already recognized when it accrued).
ALTER TABLE payroll_runs ADD COLUMN is_vacation_payout INTEGER NOT NULL DEFAULT 0;
