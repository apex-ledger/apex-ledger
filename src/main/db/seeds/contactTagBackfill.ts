import { sql } from 'kysely';
import type { AppDb } from '../schema';

/** Writes the customer or vendor onto the journal lines of documents that were posted without it.
 *
 * Customer statements, receivables by customer, P&L by customer and expenses by vendor read the
 * contact from the journal lines. Until September 2026 an invoice's receivable line carried the
 * customer only when the invoice had a discount, and payments, bills, bill payments, sales
 * receipts and credit notes carried no contact at all, so those reports showed part of the story.
 * The handlers now tag every line; this fills in the lines that already exist, from the document
 * each entry belongs to. Only null contacts are written, so a line that already names someone is
 * never changed, and running it again does nothing. */
export async function backfillContactTags(db: AppDb): Promise<number> {
  const statements = [
    // Invoices and their payments.
    sql`UPDATE journal_entry_lines SET customer_id = (SELECT i.customer_id FROM invoices i WHERE i.invoice_journal_entry_id = journal_entry_lines.journal_entry_id)
        WHERE customer_id IS NULL AND journal_entry_id IN (SELECT invoice_journal_entry_id FROM invoices WHERE invoice_journal_entry_id IS NOT NULL)`,
    sql`UPDATE journal_entry_lines SET customer_id = (SELECT i.customer_id FROM invoice_payments p JOIN invoices i ON i.id = p.invoice_id WHERE p.journal_entry_id = journal_entry_lines.journal_entry_id)
        WHERE customer_id IS NULL AND journal_entry_id IN (SELECT journal_entry_id FROM invoice_payments WHERE journal_entry_id IS NOT NULL)`,
    // Sales receipts.
    sql`UPDATE journal_entry_lines SET customer_id = (SELECT s.customer_id FROM sales_receipts s WHERE s.journal_entry_id = journal_entry_lines.journal_entry_id)
        WHERE customer_id IS NULL AND journal_entry_id IN (SELECT journal_entry_id FROM sales_receipts WHERE journal_entry_id IS NOT NULL)`,
    // Bills and their payments.
    sql`UPDATE journal_entry_lines SET vendor_id = (SELECT b.vendor_id FROM bills b WHERE b.bill_journal_entry_id = journal_entry_lines.journal_entry_id)
        WHERE vendor_id IS NULL AND journal_entry_id IN (SELECT bill_journal_entry_id FROM bills WHERE bill_journal_entry_id IS NOT NULL)`,
    sql`UPDATE journal_entry_lines SET vendor_id = (SELECT b.vendor_id FROM bill_payments p JOIN bills b ON b.id = p.bill_id WHERE p.journal_entry_id = journal_entry_lines.journal_entry_id)
        WHERE vendor_id IS NULL AND journal_entry_id IN (SELECT journal_entry_id FROM bill_payments WHERE journal_entry_id IS NOT NULL)`,
    // Credit notes: the credit itself and any refund, by kind.
    sql`UPDATE journal_entry_lines SET customer_id = (SELECT c.contact_id FROM credit_notes c WHERE c.kind = 'customer' AND journal_entry_lines.journal_entry_id IN (c.credit_journal_entry_id, c.refund_journal_entry_id))
        WHERE customer_id IS NULL AND journal_entry_id IN (SELECT credit_journal_entry_id FROM credit_notes WHERE kind = 'customer' AND credit_journal_entry_id IS NOT NULL UNION SELECT refund_journal_entry_id FROM credit_notes WHERE kind = 'customer' AND refund_journal_entry_id IS NOT NULL)`,
    sql`UPDATE journal_entry_lines SET vendor_id = (SELECT c.contact_id FROM credit_notes c WHERE c.kind = 'vendor' AND journal_entry_lines.journal_entry_id IN (c.credit_journal_entry_id, c.refund_journal_entry_id))
        WHERE vendor_id IS NULL AND journal_entry_id IN (SELECT credit_journal_entry_id FROM credit_notes WHERE kind = 'vendor' AND credit_journal_entry_id IS NOT NULL UNION SELECT refund_journal_entry_id FROM credit_notes WHERE kind = 'vendor' AND refund_journal_entry_id IS NOT NULL)`,
  ];
  let changed = 0;
  for (const statement of statements) {
    const result = await statement.execute(db);
    changed += Number(result.numAffectedRows ?? 0);
  }
  return changed;
}
