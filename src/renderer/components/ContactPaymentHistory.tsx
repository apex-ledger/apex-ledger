import { useEffect, useMemo, useState } from 'react';
import type { Account, Bill, BillPayment, Invoice, InvoicePayment } from '@shared/domain/types';
import { buildContactPaymentHistory, type TrackedDocument, type TrackedPayment } from '@shared/domain/contacts/paymentTracking';
import { useUiStore } from '../app/store/uiStore';
import { useDataChangeStore } from '../app/store/dataChangeStore';
import { Money } from './Money';
import { JournalEntryLink } from './JournalEntryLink';
import { localIsoDate } from '@shared/domain/dates/localDate';

function todayIso(): string {
  return localIsoDate();
}

/** Every invoice (or bill) for one contact with the payments made against it — the one place to
 * answer "what has this customer paid us, and what do they still owe?" without opening documents
 * one at a time. Read straight from the invoice/bill and payment rows, so it is always what the
 * ledger says. */
export function ContactPaymentHistory({ kind, contactId, contactName, onPay }: { kind: 'customer' | 'vendor'; contactId: number; contactName: string; onPay?: (documentId: number) => void }) {
  const setView = useUiStore((state) => state.setView);
  const dataVersion = useDataChangeStore((state) => state.version);
  const [documents, setDocuments] = useState<TrackedDocument[]>([]);
  const [payments, setPayments] = useState<TrackedPayment[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    const load = kind === 'customer'
      ? Promise.all([window.api.invoices.list(), window.api.invoices.payments(), window.api.accounts.list({ activeOnly: false })]).then(([docs, pays, accts]) => {
          if (cancelled) return;
          if (docs.ok) setDocuments(docs.data.map((row: Invoice) => ({ id: row.id, contactId: row.customerId, number: row.invoiceNumber, date: row.invoiceDate, dueDate: row.dueDate, totalCents: row.totalCents, balanceDueCents: row.balanceDueCents, status: row.status })));
          if (pays.ok) setPayments((pays.data as InvoicePayment[]).map((row) => ({ id: row.id, documentId: row.invoiceId, paymentDate: row.paymentDate, amountCents: row.amountCents, accountId: row.moneyAccountId, journalEntryId: row.journalEntryId, memo: row.memo })));
          if (accts.ok) setAccounts(accts.data);
        })
      : Promise.all([window.api.bills.list(), window.api.bills.payments(), window.api.accounts.list({ activeOnly: false })]).then(([docs, pays, accts]) => {
          if (cancelled) return;
          if (docs.ok) setDocuments(docs.data.map((row: Bill) => ({ id: row.id, contactId: row.vendorId, number: row.billNumber, date: row.billDate, dueDate: row.dueDate, totalCents: row.amountCents, balanceDueCents: row.balanceDueCents, status: row.status })));
          if (pays.ok) setPayments((pays.data as BillPayment[]).map((row) => ({ id: row.id, documentId: row.billId, paymentDate: row.paymentDate, amountCents: row.amountCents, accountId: row.bankAccountId, journalEntryId: row.journalEntryId, memo: row.memo })));
          if (accts.ok) setAccounts(accts.data);
        });
    void load.finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [kind, contactId, dataVersion]);

  const history = useMemo(
    () => buildContactPaymentHistory(contactId, documents, payments, new Map(accounts.map((a) => [a.id, a.name])), todayIso()),
    [contactId, documents, payments, accounts],
  );
  const word = kind === 'customer' ? 'invoice' : 'bill';

  function openDocument(id: number, status: string) {
    if (kind === 'customer') setView({ kind: 'invoiceEditor', id });
    else setView({ kind: 'purchases', tab: status === 'paid' ? 'paid' : 'unpaid', billId: id });
  }

  function toggle(id: number) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const tile = (label: string, cents: number, tone: string) => (
    <div className={`rounded-md px-2 py-1 ${tone}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-base font-semibold"><Money cents={cents} /></div>
    </div>
  );

  return (
    <section className="space-y-3" aria-label={`${contactName} ${word}s and payments`}>
      <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
        {tile(kind === 'customer' ? 'Invoiced' : 'Billed', history.summary.billedCents, 'bg-gray-50 text-gray-800')}
        {tile('Paid', history.summary.paidCents, 'bg-emerald-50 text-emerald-900')}
        {tile('Outstanding', history.summary.outstandingCents, history.summary.outstandingCents > 0 ? 'bg-amber-50 text-amber-900' : 'bg-gray-50 text-gray-800')}
        {tile(`Overdue (${history.summary.overdueCount})`, history.summary.overdueCents, history.summary.overdueCents > 0 ? 'bg-rose-50 text-rose-900' : 'bg-gray-50 text-gray-800')}
      </div>
      {history.summary.lastPaymentDate && <p className="text-xs text-gray-500">Last payment {history.summary.lastPaymentDate}.</p>}
      {!loaded ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : history.documents.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-5 text-center text-sm text-gray-500">No {word}s for {contactName} yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr><th className="px-3 py-2">{kind === 'customer' ? 'Invoice' : 'Bill'}</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Due</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Paid</th><th className="px-3 py-2 text-right">Balance</th><th className="px-3 py-2">Payments</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody>
              {history.documents.map((row) => {
                const expanded = open.has(row.document.id);
                return [
                  <tr key={row.document.id} className="border-t border-gray-100">
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => openDocument(row.document.id, row.document.status)} className="font-medium text-brand-700 hover:underline">{row.document.number ?? `${kind === 'customer' ? 'Invoice' : 'Bill'} ${row.document.id}`}</button>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{row.document.date}</td>
                    <td className="px-3 py-2 text-gray-600">{row.document.dueDate}{row.daysOverdue > 0 && <span className="ml-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">{row.daysOverdue}d late</span>}</td>
                    <td className="px-3 py-2 text-right tabular-nums"><Money cents={row.document.totalCents} /></td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-800"><Money cents={row.paidCents} /></td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${row.document.balanceDueCents > 0 ? 'text-amber-800' : 'text-gray-500'}`}><Money cents={row.document.balanceDueCents} /></td>
                    <td className="px-3 py-2">
                      {row.payments.length === 0 ? (
                        <span className="text-xs text-gray-400">{row.document.balanceDueCents === 0 ? 'Settled by credit' : 'None yet'}</span>
                      ) : (
                        <button type="button" onClick={() => toggle(row.document.id)} className="text-xs font-medium text-brand-700 hover:underline" aria-expanded={expanded}>
                          {row.payments.length} payment{row.payments.length === 1 ? '' : 's'} {expanded ? '▾' : '▸'}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {onPay && row.document.balanceDueCents > 0 && (
                        <button type="button" onClick={() => onPay(row.document.id)} className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-800 hover:bg-brand-200">{kind === 'customer' ? 'Receive' : 'Pay'}</button>
                      )}
                    </td>
                  </tr>,
                  expanded && (
                    <tr key={`${row.document.id}-payments`} className="bg-gray-50/60">
                      <td colSpan={8} className="px-3 py-2">
                        <table className="w-full text-xs">
                          <tbody>
                            {row.payments.map((payment) => (
                              <tr key={payment.id}>
                                <td className="py-1 pl-6 text-gray-600">{payment.paymentDate}</td>
                                <td className="py-1 text-gray-800">{kind === 'customer' ? 'Received into' : 'Paid from'} {payment.accountName}</td>
                                <td className="py-1 text-gray-500">{payment.memo ?? ''}</td>
                                <td className="py-1 text-right tabular-nums font-medium"><Money cents={payment.amountCents} /></td>
                                <td className="py-1 pl-3 text-right"><JournalEntryLink id={payment.journalEntryId} label="Journal" /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
