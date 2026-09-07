import { useMemo, useState } from 'react';
import { Money } from '../../components/Money';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { MakeDepositModal } from '../invoices/MakeDepositModal';
import { JournalEntryLink } from '../../components/JournalEntryLink';
import { EnteredTd, EnteredText, EnteredTh } from '../../components/EnteredCell';

/** Bank deposits — the step between taking money and it appearing on the statement.
 *
 * Several customer payments usually reach the bank as one line: three cheques taken on Monday are
 * banked together on Tuesday and the statement shows one figure. Undeposited Funds is where those
 * payments wait, and a deposit is what batches them into the single amount the bank actually shows.
 *
 * Without this step every payment posts straight to the bank account and reconciliation becomes a
 * hunt for which three of them add up to the one line on the statement.
 */

export function DepositsPage() {
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deposits = useIpcQuery(() => window.api.deposits.listDetailed(), []);
  const waiting = useIpcQuery(() => window.api.deposits.getUndeposited(), []);
  const accounts = useIpcQuery(() => window.api.accounts.list({ activeOnly: true }), []);
  // The modal names each payment's customer, so it needs the list too.
  const customers = useIpcQuery(() => window.api.customers.list({}), []);

  const accountNameById = useMemo(() => new Map((accounts.data ?? []).map((a) => [a.id, a.name])), [accounts.data]);

  const waitingCents = (waiting.data ?? []).reduce((sum, item) => sum + item.totalCents, 0);
  const waitingCount = waiting.data?.length ?? 0;

  async function handleDelete(id: number) {
    if (!window.confirm('Delete this deposit? Its linked accounting entry will be voided and the included payments will return to Undeposited Funds. This cannot be undone.')) return;
    setError(null);
    const result = await window.api.deposits.delete(id);
    if (!result.ok) return setError(result.error);
    deposits.reload();
    waiting.reload();
  }

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={waitingCount === 0}
          onClick={() => setShowModal(true)}
          title={waitingCount === 0 ? 'Nothing is waiting in Undeposited Funds.' : undefined}
          className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
        >
          Make Deposit{waitingCount > 0 ? ` (${waitingCount})` : ''}
        </button>

        {waitingCount > 0 && (
          <span className="rounded bg-amber-50 px-3 py-1.5 text-sm text-amber-800">
            <Money cents={waitingCents} /> waiting in Undeposited Funds
          </span>
        )}
      </div>

      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {waitingCount > 0 && (
        <section className="rounded border border-gray-200 p-3">
          <h3 className="mb-2 text-sm font-semibold text-gray-900">Waiting to be banked</h3>
          <ul className="space-y-1 text-sm">
            {(waiting.data ?? []).map((item) => (
              <li key={`${item.kind}-${item.id}`} className="flex justify-between gap-3 border-b border-gray-100 pb-1 last:border-0">
                <span className="text-gray-600">
                  {item.kind === 'invoice' ? 'Invoice' : 'Sales receipt'} {item.number} · {item.date}
                </span>
                <span className="tabular-nums">
                  <Money cents={item.totalCents} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {deposits.loading && <p className="text-sm text-gray-500">Loading…</p>}
      {deposits.error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{deposits.error}</div>}

      {deposits.data && deposits.data.length === 0 && (
        <p className="text-sm text-gray-500">
          No deposits recorded yet. Payments received sit in Undeposited Funds until they are banked, so that several of them can
          land on the statement as the one line the bank actually shows.
        </p>
      )}

      {deposits.data && deposits.data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2 text-left font-medium">Date</th><EnteredTh className="px-3 py-2 text-left font-medium" />
                <th className="px-3 py-2 text-left font-medium">Banked into</th>
                <th className="px-3 py-2 text-right font-medium">Payments</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 text-left font-medium" />
              </tr>
            </thead>
            <tbody>
              {deposits.data.map((d) => (
                <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-1.5 tabular-nums text-gray-600">{d.depositDate}</td><EnteredTd at={d.createdAt} className="px-3 py-1.5" />
                  <td className="px-3 py-1.5">{accountNameById.get(d.bankAccountId) ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{d.itemCount}</td>
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                    <Money cents={d.totalCents} />
                  </td>
                  <td className="px-3 py-1.5">
                    <JournalEntryLink id={d.journalEntryId} label="View GL" className="mr-3" />
                    <button
                      type="button"
                      onClick={() => handleDelete(d.id)}
                      className="text-xs font-medium text-red-500 hover:underline"
                      title="Unbanks these payments and returns them to Undeposited Funds"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400">
        A deposit posts Debit the bank account, Credit Undeposited Funds for the combined total — so the ledger shows the single
        figure the bank statement shows, and reconciliation is not a hunt for which payments add up to it. Deleting one returns its
        payments to Undeposited Funds.
      </p>

      <MakeDepositModal
        open={showModal}
        customers={customers.data ?? []}
        onClose={() => setShowModal(false)}
        onDeposited={() => {
          deposits.reload();
          waiting.reload();
        }}
      />
    </div>
  );
}
