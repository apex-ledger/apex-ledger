import { useState } from 'react';
import { Money } from '../../components/Money';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { APPROVAL_LABELS, canTransition, daysWaiting, type ApprovalStatus } from '@shared/domain/purchases/billApproval';
import { ReportDateRange } from '../../components/ReportDateRange';
import { localIsoDate } from '@shared/domain/dates/localDate';

function todayIso(): string { return localIsoDate(); }
function yearStartIso(): string { return `${todayIso().slice(0, 4)}-01-01`; }

/** What is waiting on somebody, and what got paid without anyone deciding.
 *
 * Approval is kept separate from paid/unpaid because they answer different questions. This screen
 * is where the separation earns its keep: bills sitting approved-but-unpaid are normal, bills
 * sitting unapproved for a month are not, and both are invisible on a plain bill list.
 */

const STATUS_STYLES: Record<ApprovalStatus, string> = {
  pending: 'bg-amber-50 text-amber-800',
  approved: 'bg-emerald-50 text-emerald-800',
  rejected: 'bg-rose-50 text-rose-800',
  onHold: 'bg-slate-100 text-slate-700',
};

/** A wait long enough that the bill has stopped being in somebody's inbox and started being
 * forgotten — which is how vendors stop delivering. */
const STALE_DAYS = 14;

export function BillApprovalPage() {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [periodStart, setPeriodStart] = useState(yearStartIso());
  const [periodEnd, setPeriodEnd] = useState(todayIso());

  const { data, loading, error, reload } = useIpcQuery(
    () => window.api.bills.approvalReport({ periodStart, periodEnd, asOfDate: periodEnd }),
    [periodStart, periodEnd],
  );

  async function setStatus(id: number, next: ApprovalStatus) {
    setActionError(null);

    // Rejecting without a reason leaves a decision nobody can explain later, so it is asked for
    // here rather than being quietly optional.
    let note: string | null = null;
    if (next === 'rejected') {
      note = window.prompt('Why is this bill being rejected?')?.trim() || null;
      if (!note) return;
    }

    setBusyId(id);
    const result = await window.api.bills.setApproval({ id, approvalStatus: next, note });
    setBusyId(null);

    if (!result.ok) setActionError(result.error);
    else reload();
  }

  return (
    <div className="space-y-3">
      <ReportDateRange from={periodStart} to={periodEnd} onFromChange={setPeriodStart} onToChange={setPeriodEnd} />
      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {actionError && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</div>}

      {data && (
        <>
          <div className="flex flex-wrap gap-3">
            <Summary label="Awaiting approval" value={data.pendingCount} accent="bg-amber-50 text-amber-800" />
            <Summary label="Value awaiting" money={data.pendingCents} accent="bg-amber-50 text-amber-800" />
            <Summary label="On hold" value={data.onHoldCount} accent="bg-slate-100 text-slate-700" />
            <Summary label="Rejected" value={data.rejectedCount} accent="bg-rose-50 text-rose-800" />
          </div>

          {data.paidWithoutApprovalCount > 0 && (
            <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {data.paidWithoutApprovalCount === 1
                ? '1 bill was paid without ever being approved.'
                : `${data.paidWithoutApprovalCount} bills were paid without ever being approved.`}{' '}
              Approval was added to a system where bills could always be paid, and bank import matching can settle one without anyone
              looking — so this is worth checking rather than assuming.
            </div>
          )}

          {data.rows.length === 0 && <p className="text-sm text-gray-500">There are no bills yet.</p>}

          {data.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-3 py-2 text-left font-medium">Vendor</th>
                    <th className="px-3 py-2 text-left font-medium">Bill date</th>
                    <th className="px-3 py-2 text-right font-medium">Waiting</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-3 py-2 text-left font-medium">Approval</th>
                    <th className="px-3 py-2 text-left font-medium">Paid</th>
                    <th className="px-3 py-2 text-left font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => {
                    const waited = row.approvalStatus === 'pending' ? daysWaiting(row.billDate, data.asOfDate) : null;
                    return (
                      <tr key={row.id} className="border-b border-gray-100">
                        <td className="px-3 py-1.5">{row.vendorName}</td>
                        <td className="px-3 py-1.5 tabular-nums text-gray-500">{row.billDate}</td>
                        <td
                          className={`px-3 py-1.5 text-right tabular-nums ${
                            waited !== null && waited >= STALE_DAYS ? 'font-medium text-rose-700' : 'text-gray-500'
                          }`}
                        >
                          {waited === null ? '—' : `${waited}d`}
                        </td>
                        <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                          <Money cents={row.totalCents} />
                        </td>
                        <td className="px-3 py-1.5">
                          <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLES[row.approvalStatus]}`}>
                            {APPROVAL_LABELS[row.approvalStatus]}
                          </span>
                          {row.approvalNote && <span className="ml-2 text-xs italic text-gray-500">{row.approvalNote}</span>}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-gray-500">
                          {row.isPaid ? (
                            <span className={row.approvalStatus !== 'approved' ? 'font-medium text-rose-700' : ''}>Paid</span>
                          ) : (
                            'Unpaid'
                          )}
                        </td>
                        <td className="px-3 py-1.5">
                          <div className="flex gap-1">
                            {(['approved', 'onHold', 'rejected'] as ApprovalStatus[])
                              .filter((next) => canTransition(row.approvalStatus, next))
                              .map((next) => (
                                <button
                                  key={next}
                                  type="button"
                                  disabled={busyId === row.id}
                                  onClick={() => void setStatus(row.id, next)}
                                  className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-50 disabled:opacity-50"
                                >
                                  {next === 'approved' ? 'Approve' : next === 'onHold' ? 'Hold' : 'Reject'}
                                </button>
                              ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-gray-400">
            Waiting first, oldest at the top — those are the ones going stale. Only an approved bill can be paid; a bill on hold or
            rejected is refused at the payment screen rather than here.
          </p>
        </>
      )}
    </div>
  );
}

function Summary({ label, value, money, accent }: { label: string; value?: number; money?: number; accent: string }) {
  return (
    <div className={`rounded px-3 py-2 ${accent}`}>
      <div className="text-xs uppercase tracking-wide opacity-75">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{money !== undefined ? <Money cents={money} /> : value}</div>
    </div>
  );
}
