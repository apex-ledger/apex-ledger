# Client and accountant collaboration

Version `0.1.328` supports the common workflow where a business records its own sales, expenses, and taxes and later gives its accountant controlled access.

## Workflow

1. The business owner selects **Invite my accountant**.
2. They enter the accountant's named email, select **Can edit — accountant**, and choose the client company.
3. The accountant opens the one-time link and signs in using that exact email.
4. The client workspace appears as an additional authorized workspace for the accountant.
5. Both parties work against the same live accounting records. The accountant can review and make permitted corrections; posted records use controlled adjustments or reversals rather than silent rewriting.
6. The owner can change client assignments, cancel a pending invitation, or suspend access without deleting the accountant's audit history.

The design intentionally avoids copying the client's live database into the accountant's firm. Formal downloads and migration exports will be implemented as a separate controlled export feature with control totals and an audit record.
