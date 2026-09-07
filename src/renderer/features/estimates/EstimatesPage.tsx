import { useMemo, useState } from 'react';
import { useUiStore } from '../../app/store/uiStore';
import { Money } from '../../components/Money';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { EnteredTd, EnteredText, EnteredTh } from '../../components/EnteredCell';
import { localIsoDate } from '@shared/domain/dates/localDate';
import {
  ESTIMATE_LABELS,
  canTransitionEstimate,
  displayEstimateStatus,
  type EstimateStatus,
} from '@shared/domain/sales/commitmentDocuments';

/** Quotes offered to customers, and what became of them.
 *
 * Nothing on this screen has touched the ledger. An estimate is an offer, not a transaction — it
 * appears in the books only when it is turned into an invoice, which is what the Convert button
 * does. Until then a quote for $50,000 changes no figure anywhere, which is exactly right: it is
 * the amount least likely to arrive.
 */

const STATUS_STYLES: Record<EstimateStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-sky-50 text-sky-800',
  accepted: 'bg-emerald-50 text-emerald-800',
  declined: 'bg-rose-50 text-rose-800',
  expired: 'bg-amber-50 text-amber-800',
  converted: 'bg-violet-50 text-violet-800',
  closed: 'bg-gray-100 text-gray-600',
};

function todayIso(): string {
  return localIsoDate();
}

export function EstimatesPage() {
  const setView = useUiStore((s) => s.setView);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<'open' | 'all'>('open');
  const today = todayIso();

  const estimates = useIpcQuery(() => window.api.estimates.list(), []);
  const customers = useIpcQuery(() => window.api.customers.list({}), []);
  const nameById = useMemo(() => new Map((customers.data ?? []).map((c) => [c.id, c.name])), [customers.data]);

  const rows = (estimates.data ?? []).map((e) => ({ ...e, shown: displayEstimateStatus(e.status, e.expiryDate, today) }));
  // "Open" is what somebody is chasing: everything still capable of becoming an invoice.
  const visible = statusFilter === 'all' ? rows : rows.filter((r) => r.shown !== 'converted' && r.shown !== 'declined');

  const openValueCents = rows
    .filter((r) => r.shown === 'sent' || r.shown === 'accepted' || r.shown === 'draft')
    .reduce((sum, r) => sum + r.totalCents, 0);

  async function run(id: number, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setActionError(null);
    setBusyId(id);
    const result = await fn();
    setBusyId(null);
    if (!result.ok) setActionError(result.error ?? 'Something went wrong.');
    else estimates.reload();
  }

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setView({ kind: 'estimateEditor', id: 'new' })}
          className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200"
        >
          New Estimate
        </button>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'open' | 'all')}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          <option value="open">Still open</option>
          <option value="all">All estimates</option>
        </select>

        {openValueCents > 0 && (
          <span className="rounded bg-sky-50 px-3 py-1.5 text-sm text-sky-800">
            <Money cents={openValueCents} /> quoted and not yet invoiced
          </span>
        )}
      </div>

      {estimates.loading && <p className="text-sm text-gray-500">Loading…</p>}
      {estimates.error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{estimates.error}</div>}
      {actionError && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</div>}

      {estimates.data && visible.length === 0 && (
        <p className="text-sm text-gray-500">
          {rows.length === 0 ? 'No estimates yet. Create one to quote a customer without it touching the books.' : 'Nothing open.'}
        </p>
      )}

      {visible.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2 text-left font-medium">Number</th>
                <th className="px-3 py-2 text-left font-medium">Date</th><EnteredTh className="px-3 py-2 text-left font-medium" />
                <th className="px-3 py-2 text-left font-medium">Customer</th>
                <th className="px-3 py-2 text-left font-medium">Expires</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td
                    className="cursor-pointer px-3 py-1.5 font-medium text-brand-700 hover:underline"
                    onClick={() => setView({ kind: 'estimateEditor', id: row.id })}
                  >
                    {row.estimateNumber}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums text-gray-600">{row.estimateDate}</td><EnteredTd at={row.createdAt} className="px-3 py-1.5" />
                  <td className="px-3 py-1.5">{nameById.get(row.customerId) ?? '—'}</td>
                  <td className="px-3 py-1.5 tabular-nums text-gray-600">{row.expiryDate ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                    <Money cents={row.totalCents} />
                  </td>
                  <td className="px-3 py-1.5">
                    <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLES[row.shown]}`}>{ESTIMATE_LABELS[row.shown]}</span>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex flex-wrap gap-1">
                      {(['sent', 'accepted', 'declined'] as EstimateStatus[])
                        .filter((next) => canTransitionEstimate(row.status, next))
                        .map((next) => (
                          <button
                            key={next}
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => void run(row.id, () => window.api.estimates.setStatus({ id: row.id, status: next }))}
                            className="rounded border border-gray-300 px-1.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                          >
                            {ESTIMATE_LABELS[next]}
                          </button>
                        ))}

                      {row.convertedInvoiceId === null && row.status !== 'declined' && (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() =>
                            void run(row.id, async () => {
                              const r = await window.api.estimates.convertToInvoice({ id: row.id });
                              if (r.ok) setView({ kind: 'invoiceEditor', id: r.data.invoice.id });
                              return r;
                            })
                          }
                          className="rounded bg-brand-100 px-1.5 py-0.5 text-[11px] font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
                        >
                          Create invoice
                        </button>
                      )}

                      {row.convertedInvoiceId !== null && (
                        <button
                          type="button"
                          onClick={() => setView({ kind: 'invoiceEditor', id: row.convertedInvoiceId as number })}
                          className="rounded border border-gray-300 px-1.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50"
                        >
                          Open invoice
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400">
        An estimate is an offer, not a transaction — nothing here appears in the books until it is turned into an invoice. A quote
        that has passed its expiry date shows as expired without its stored status being changed, so accepting one later still works.
      </p>
    </div>
  );
}
