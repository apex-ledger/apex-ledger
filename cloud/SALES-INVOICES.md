# Sales invoices

Version 0.1.323 implements the cloud sales lifecycle for Accounting subscriptions.

- Invoice numbers are allocated atomically per company and cannot be reused under concurrent requests.
- Lines support products/services or editable descriptions, three-decimal quantities, exact-cent pricing, and HST 13%, exempt, or explicit manual HST.
- Posting debits Accounts Receivable and credits each revenue account plus GST/HST Payable in one database transaction.
- Customer payments debit the selected bank account, credit Accounts Receivable, and update the invoice balance under a row lock.
- Posted content is immutable. “Void” requires confirmation and a reason, creates a dated reversing journal, and retains the original document and audit history.
- Copy loads the original lines into a new unsaved invoice; saving assigns the next number.
- Products/services use optimistic versions so one seat cannot silently overwrite another seat's update.
- Sales-tax events are append-only. A void adds a negative event on the void date instead of rewriting a previously reportable period.
