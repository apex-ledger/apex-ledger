import { useUiStore } from '../../app/store/uiStore';
import { Money } from '../../components/Money';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { daysUntilDue } from '@shared/domain/contacts/paymentTerms';
import { localIsoDate } from '@shared/domain/dates/localDate';

/** The Sales landing tab: what to do, and how the money side is going.
 *
 * The Sales workflow strip above this tab is where you raise things; this tab answers the two
 * questions worth asking before you raise anything: what is owed, and how much of it is late.
 *
 * Bucketed here from the invoice list rather than from a report handler, because that is where the
 * ageing report gets its figures too — reading them a second way would eventually disagree with it.
 */

function todayIso(): string {
  return localIsoDate();
}

export function SalesOverviewTab() {
  const setView = useUiStore((s) => s.setView);
  const today = todayIso();

  const invoices = useIpcQuery(() => window.api.invoices.list({}), []);

  const unpaid = (invoices.data ?? []).filter((i) => i.status === 'unpaid');
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 };

  for (const invoice of unpaid) {
    const remaining = daysUntilDue(invoice.dueDate, today);
    const late = remaining === null ? 0 : -remaining;
    if (late <= 0) buckets.current += invoice.totalCents;
    else if (late <= 30) buckets.d30 += invoice.totalCents;
    else if (late <= 60) buckets.d60 += invoice.totalCents;
    else if (late <= 90) buckets.d90 += invoice.totalCents;
    else buckets.over90 += invoice.totalCents;
  }

  const overdueCents = buckets.d30 + buckets.d60 + buckets.d90 + buckets.over90;
  const totalOwed = overdueCents + buckets.current;

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-gray-200 px-3 py-2">
        <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">What customers owe</h2>

        {invoices.loading && <p className="text-sm text-gray-500">Loading…</p>}
        {invoices.error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{invoices.error}</div>}

        {invoices.data && unpaid.length === 0 && <p className="text-sm text-gray-500">Nothing outstanding — every invoice is paid.</p>}

        {unpaid.length > 0 && (
          <>
            <div className="flex flex-wrap gap-3">
              <Figure label="Not yet due" cents={buckets.current} tone="bg-emerald-50 text-emerald-800" />
              <Figure label="1–30 days late" cents={buckets.d30} tone="bg-amber-50 text-amber-800" />
              <Figure label="31–60 days" cents={buckets.d60} tone="bg-orange-50 text-orange-800" />
              <Figure label="61–90 days" cents={buckets.d90} tone="bg-rose-50 text-rose-800" />
              <Figure label="Over 90 days" cents={buckets.over90} tone="bg-rose-100 text-rose-900" />
              <Figure label="Total owed" cents={totalOwed} tone="bg-gray-100 text-gray-800" />
            </div>

            <button
              type="button"
              onClick={() => setView({ kind: 'report', report: 'agingReceivable' })}
              className="mt-3 text-sm text-brand-600 hover:underline"
            >
              Open the full ageing report →
            </button>

            {overdueCents > 0 && (
              <p className="mt-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <Money cents={overdueCents} /> is past its due date. The terms on a customer decide when that clock starts — one left
                on Due on receipt counts as late the day after the invoice is raised.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Figure({ label, cents, tone }: { label: string; cents: number; tone: string }) {
  return (
    <div className={`min-w-[8rem] rounded px-3 py-2 ${tone}`}>
      <div className="text-xs uppercase tracking-wide opacity-75">{label}</div>
      <div className="text-lg font-semibold tabular-nums">
        <Money cents={cents} />
      </div>
    </div>
  );
}
