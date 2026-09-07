import type { View } from '../app/store/uiStore';

type Navigate = (view: View) => void;

/** Opens the business document that created a journal entry. Reports are read-only views; changes
 * belong on the original invoice/receipt/sheet. A plain or imported journal has no higher-level
 * document, so the journal editor is the safe fallback. */
export async function openOriginalEntry(entryId: number, navigate: Navigate): Promise<void> {
  const [invoices, receipts, bills, deposits, credits, payrollRuns, hstFilings] = await Promise.all([
    window.api.invoices.list(),
    window.api.salesReceipts.list(),
    window.api.bills.list(),
    window.api.deposits.list(),
    window.api.creditNotes.list(),
    window.api.payrollRuns.list(),
    window.api.hstFilings.list(),
  ]);

  if (invoices.ok) {
    const invoice = invoices.data.find((row) => row.invoiceJournalEntryId === entryId || row.paymentJournalEntryId === entryId);
    if (invoice) return navigate({ kind: 'invoiceEditor', id: invoice.id });
  }
  if (receipts.ok) {
    const receipt = receipts.data.find((row) => row.journalEntryId === entryId);
    if (receipt) return navigate({ kind: 'salesReceiptEditor', id: receipt.id });
  }
  if (bills.ok && bills.data.some((row) => row.billJournalEntryId === entryId || row.paymentJournalEntryId === entryId)) {
    return navigate({ kind: 'purchases' });
  }
  if (deposits.ok && deposits.data.some((row) => row.journalEntryId === entryId)) return navigate({ kind: 'deposits' });
  if (credits.ok && credits.data.some((row) => row.creditJournalEntryId === entryId || row.refundJournalEntryId === entryId)) {
    return navigate({ kind: 'creditNotes' });
  }
  if (payrollRuns.ok && payrollRuns.data.some((row) => row.journalEntryId === entryId)) return navigate({ kind: 'payroll' });
  if (hstFilings.ok && hstFilings.data.some((row) => row.journalEntryId === entryId)) return navigate({ kind: 'hstCentre' });

  navigate({ kind: 'journalForm', id: entryId });
}
