# North Ledger 0.1.194 audit

## Company-specific account isolation

- North Ledger already stores each company in its own `.company` SQLite database and `accounts.list` always reads from the currently open company database.
- Company changes now bump the renderer data version so all live IPC-backed lists immediately refetch and cannot continue displaying data loaded for the prior company.
- Credit-note refund account choices are restricted to active `Cash and Bank` accounts (no A/R, inventory, prepaid assets, etc.).
- Banking Organise and Deposits account lists now request active accounts only.
- Existing transaction editors already request active accounts from the current company.

This implements the requirement that only accounts belonging to the company currently being worked on appear in operational screens.
