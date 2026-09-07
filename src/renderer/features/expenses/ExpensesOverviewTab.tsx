import { useUiStore } from '../../app/store/uiStore';
import { Money } from '../../components/Money';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { daysUntilDue } from '@shared/domain/contacts/paymentTerms';
import { localIsoDate } from '@shared/domain/dates/localDate';

/** The Expenses landing tab — the mirror of the Sales overview.
 *
 * Same buckets, read the other way: what is owed to vendors and how much of it is late. Approval
 * is surfaced alongside, because a bill waiting on somebody is not the same as a bill waiting on
 * money, and only one of those is fixed by paying it.
 */

function todayIso(): string {
  return localIsoDate();
}

export function ExpensesOverviewTab() {
  const setView = useUiStore((s) => s.setView);
  const today = todayIso();

  const bills = useIpcQuery(() => window.api.bills.list({}), []);
  const approvals = useIpcQuery(() => window.api.bills.approvalReport({}), []);

  const unpaid = (bills.data ?? []).filter((b) => b.status === 'unpaid');
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 };

  for (const bill of unpaid) {
    const remaining = daysUntilDue(bill.dueDate, today);
    const late = remaining === null ? 0 : -remaining;
    if (late <= 0) buckets.current += bill.amountCents;
    else if (late <= 30) buckets.d30 += bill.amountCents;
    else if (late <= 60) buckets.d60 += bill.amountCents;
    else if (late <= 90) buckets.d90 += bill.amountCents;
    else buckets.over90 += bill.amountCents;
  }

  const overdueCents = buckets.d30 + buckets.d60 + buckets.d90 + buckets.over90;
  const totalOwed = overdueCents + buckets.current;

  return (
    <div className="space-y-3">
      {approvals.data && approvals.data.pendingCount > 0 && (
        <button
          type="button"
          onClick={() => setView({ kind: 'report', report: 'billApproval' })}
          className="block w-full rounded bg-amber-50 px-3 py-2 text-left text-sm text-amber-800 hover:bg-amber-100"
        >
          {approvals.data.pendingCount === 1 ? '1 bill is' : `${approvals.data.pendingCount} bills are`} waiting on approval,
          worth <Money cents={approvals.data.pendingCents} />. Until approved, they cannot be paid.
        </button>
      )}

      <section className="rounded-lg border border-gray-200 px-3 py-2">
        <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">What you owe vendors</h2>

        {bills.loading && <p className="text-sm text-gray-500">Loading…</p>}
        {bills.error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{bills.error}</div>}
        {bills.data && unpaid.length === 0 && <p className="text-sm text-gray-500">Nothing outstanding — every bill is paid.</p>}

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
              onClick={() => setView({ kind: 'report', report: 'agingPayable' })}
              className="mt-3 text-sm text-brand-600 hover:underline"
            >
              Open the full ageing report →
            </button>

            {overdueCents > 0 && (
              <p className="mt-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <Money cents={overdueCents} /> is past its due date. Terms set on a vendor decide when that clock starts, so a
                vendor who actually gives you 60 days should not be left on Net 30.
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
