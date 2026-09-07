import { useState } from 'react';
import type { Contact } from '@shared/domain/types';
import { Combobox } from '../../components/Combobox';
import { DateInput } from '../../components/DateInput';
import { Money } from '../../components/Money';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { useUiStore } from '../../app/store/uiStore';
import { openOriginalEntry } from '../../utils/openOriginalEntry';
import { OpenEntryButton } from '../../components/OpenEntryButton';
import { EnteredTd, EnteredText, EnteredTh } from '../../components/EnteredCell';
import { localIsoDate } from '@shared/domain/dates/localDate';

/** A customer's account as they would see it — the document you send them.
 *
 * Not the same thing as the receivables ageing, which is the same money read from your side:
 * ageing answers "who is overdue and by how long" and is for chasing; a statement answers "here is
 * your account" and is for sending. */

function todayIso(): string {
  return localIsoDate();
}
function yearStartIso(): string {
  return `${todayIso().slice(0, 4)}-01-01`;
}

export function CustomerStatementPage() {
  const setView = useUiStore((s) => s.setView);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [periodStart, setPeriodStart] = useState(yearStartIso());
  const [periodEnd, setPeriodEnd] = useState(todayIso());

  const { data: customers } = useIpcQuery(() => window.api.customers.list({}), []);
  const { data, loading, error } = useIpcQuery(
    () =>
      customerId
        ? window.api.reports.customerStatement({ customerId, periodStart, periodEnd })
        : Promise.resolve({ ok: true as const, data: undefined }),
    [customerId, periodStart, periodEnd],
  );

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-gray-600">Customer</span>
          <div className="mt-1 w-64">
            <Combobox
              options={((customers ?? []) as Contact[]).map((c) => ({ value: String(c.id), label: c.name }))}
              value={customerId !== null ? String(customerId) : null}
              onChange={(v) => setCustomerId(v ? Number(v) : null)}
              placeholder="Choose a customer…"
            />
          </div>
        </label>
        <label className="text-sm">
          <span className="block text-gray-600">From</span>
          <DateInput value={periodStart} onChange={setPeriodStart} className="mt-1 w-32" />
        </label>
        <label className="text-sm">
          <span className="block text-gray-600">To</span>
          <DateInput value={periodEnd} onChange={setPeriodEnd} className="mt-1 w-32" />
        </label>
      </div>

      {!customerId && <p className="text-sm text-gray-400">Choose a customer to produce their statement.</p>}
      {loading && customerId && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {data && (
        <div className="rounded border border-gray-200 bg-white p-3">
          <div className="mb-3 flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Statement of account</h2>
              <p className="text-sm text-gray-600">{data.customerName}</p>
              <p className="text-xs text-gray-400">
                {data.periodStart} to {data.periodEnd}
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-gray-500">Balance owing</div>
              <div className={`text-lg font-semibold tabular-nums ${data.closingBalanceCents > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                <Money cents={data.closingBalanceCents} />
              </div>
            </div>
          </div>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                <th className="px-2 py-2 text-left font-medium">Date</th><EnteredTh className="px-2 py-2 text-left font-medium" />
                <th className="px-2 py-2 text-left font-medium">Description</th>
                <th className="px-2 py-2 text-right font-medium">Charges</th>
                <th className="px-2 py-2 text-right font-medium">Payments</th>
                <th className="px-2 py-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100 text-gray-600">
                <td className="px-2 py-1.5">{data.periodStart}</td>
                <td />
                <td className="px-2 py-1.5 italic">Balance brought forward</td>
                <td />
                <td />
                <td className="px-2 py-1.5 text-right tabular-nums">
                  <Money cents={data.openingBalanceCents} />
                </td>
              </tr>
              {data.lines.map((l, i) => (
                <tr
                  key={`${l.entryId}-${i}`}
                  onClick={() => void openOriginalEntry(l.entryId, setView)}
                  className="cursor-pointer border-b border-gray-100 hover:bg-brand-50"
                  title="Open original entry"
                >
                  <td className="px-2 py-1.5 text-gray-500">
                    <div className="flex items-center gap-2"><span>{l.entryDate}</span><OpenEntryButton entryId={l.entryId} /></div>
                  </td><EnteredTd at={l.createdAt} className="px-2 py-1.5" />
                  <td className="px-2 py-1.5">{l.description}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {l.chargeCents ? <Money cents={l.chargeCents} /> : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700">
                    {l.paymentCents ? <Money cents={l.paymentCents} /> : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    <Money cents={l.balanceCents} />
                  </td>
                </tr>
              ))}
              <tr className="border-t border-gray-300 font-semibold">
                <td className="px-2 py-2" colSpan={3}>
                  Total
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  <Money cents={data.totalChargesCents} />
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  <Money cents={data.totalPaymentsCents} />
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  <Money cents={data.closingBalanceCents} />
                </td>
              </tr>
            </tbody>
          </table>

          {data.lines.length === 0 && (
            <p className="mt-3 text-sm text-gray-400">Nothing was billed or paid in this period.</p>
          )}
        </div>
      )}

      <p className="text-xs text-gray-400">
        Built from the receivable account, not from invoices alone — so a credit note, a write-off, or a payment posted straight to
        the ledger all appear. A statement that omitted those would show a balance the customer disputes.
      </p>
    </div>
  );
}
