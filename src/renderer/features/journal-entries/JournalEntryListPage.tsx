import { useRef, useMemo, useState } from 'react';
import type { JournalEntry, JournalEntryStatus } from '@shared/domain/types';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { Table, type TableColumn } from '../../components/Table';
import { Money } from '../../components/Money';
import { AccountQuickTabs } from '../../components/AccountQuickTabs';
import { EditableDateCell } from '../../components/EditableDateCell';
import { useUiStore } from '../../app/store/uiStore';
import { confirmDialog } from '../../app/store/confirmStore';
import { confirmLockedOverride } from '../../utils/lockedPeriodGuard';
import { ReportActions } from '../../components/ReportActions';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { EnteredTd, EnteredText, EnteredTh } from '../../components/EnteredCell';

const STATUSES: (JournalEntryStatus | 'All')[] = ['All', 'draft', 'posted', 'void'];

export function JournalEntryListPage() {
  // Anything on this screen can be taken to a spreadsheet, same as a report.
  const exportRef = useRef<HTMLDivElement>(null);
  const setView = useUiStore((s) => s.setView);
  const [status, setStatus] = useState<JournalEntryStatus | 'All'>('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [accountId, setAccountId] = useState<number | null>(null);

  const [voidError, setVoidError] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<number | null>(null);

  const { data: entries, loading, error, reload } = useIpcQuery(
    () =>
      window.api.journal.list({
        status: status === 'All' ? undefined : status,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        accountId: accountId ?? undefined,
      }),
    [status, dateFrom, dateTo, accountId],
  );

  // Voiding directly from the list — a faster path than opening the entry first, and doesn't
  // depend on scrolling to find the action button on the detail page.
  async function handleVoid(e: JournalEntry) {
    // If the entry is in a locked (e.g. HST-filed) period, this pops the strong override
    // confirmation instead; otherwise it's a no-op and we show the normal void confirm below.
    const lock = await confirmLockedOverride(e.entryDate, 'void', e.lines);
    if (!lock.proceed) return;
    if (!lock.override) {
      if (
        !(await confirmDialog(
          `Void this ${e.entryDate} entry${e.memo ? ` ("${e.memo}")` : ''}? This removes it from every balance and report, but keeps it visible (marked void) for the audit trail.`,
        ))
      ) {
        return;
      }
    }
    setVoidError(null);
    setVoidingId(e.id);
    const result = await window.api.journal.void(e.id, lock.override);
    setVoidingId(null);
    if (!result.ok) return setVoidError(result.error);
    reload();
  }

  // Same base/total/HST breakdown as the Quick Entry ledger's Sales/Expense tabs, read from the
  // category line's own stored baseCents and the dedicated GST/HST line — so the two views can be
  // cross-checked against each other line by line, not just by a single lump Amount figure.
  const columns: TableColumn<JournalEntry>[] = [
    { key: 'date', header: 'Date', render: (e) => <EditableDateCell entryId={e.id} value={e.entryDate} onSaved={reload} /> },
    { key: 'entered', header: 'Entered', render: (e) => <EnteredText at={e.createdAt} /> },
    { key: 'memo', header: 'Memo', render: (e) => e.memo ?? '—' },
    { key: 'reference', header: 'Reference', render: (e) => e.reference ?? '—' },
    { key: 'period', header: 'Period', render: (e) => (e.periodFrom && e.periodTo ? `${e.periodFrom} – ${e.periodTo}` : '—') },
    {
      key: 'baseAmt',
      header: 'Base Amt',
      align: 'right',
      render: (e) => {
        const baseCents = e.lines.reduce((sum, l) => sum + (l.baseCents ?? 0), 0);
        return baseCents > 0 ? <Money cents={baseCents} /> : '—';
      },
    },
    {
      key: 'hst',
      header: 'HST',
      align: 'right',
      render: (e) => {
        const gstLine = e.lines.find((l) => l.description === 'GST/HST' || l.description === 'GST/HST collected');
        const taxCents = gstLine ? gstLine.debitCents || gstLine.creditCents : 0;
        return taxCents > 0 ? <Money cents={taxCents} /> : '—';
      },
    },
    {
      key: 'amount',
      header: 'Total Amt',
      align: 'right',
      render: (e) => <Money cents={e.lines.reduce((sum, l) => sum + l.debitCents, 0)} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (e) => {
        const style =
          e.status === 'posted' ? 'bg-green-100 text-green-800 ring-1 ring-green-200' : e.status === 'void' ? 'bg-gray-200 text-gray-600' : 'bg-amber-100 text-amber-800 ring-1 ring-amber-200';
        return <span className={`rounded px-1.5 py-0.5 text-xs ${style}`}>{e.status}</span>;
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (e) =>
        e.status === 'posted' ? (
          <button
            type="button"
            disabled={voidingId === e.id}
            onClick={(ev) => {
              ev.stopPropagation();
              handleVoid(e);
            }}
            className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
          >
            {voidingId === e.id ? 'Voiding…' : 'Void'}
          </button>
        ) : null,
    },
  ];

  // Sums exactly what's currently shown in the table — respects whatever Status/Date/Account
  // filters are applied above, same per-entry math as the Base Amt/HST/Total Amt columns, so the
  // footer always reconciles to the rows visible on screen.
  const totals = useMemo(() => {
    return (entries ?? []).reduce(
      (acc, e) => {
        const baseCents = e.lines.reduce((sum, l) => sum + (l.baseCents ?? 0), 0);
        const gstLine = e.lines.find((l) => l.description === 'GST/HST' || l.description === 'GST/HST collected');
        const hstCents = gstLine ? gstLine.debitCents || gstLine.creditCents : 0;
        const totalCents = e.lines.reduce((sum, l) => sum + l.debitCents, 0);
        return { baseCents: acc.baseCents + baseCents, hstCents: acc.hstCents + hstCents, totalCents: acc.totalCents + totalCents };
      },
      { baseCents: 0, hstCents: 0, totalCents: 0 },
    );
  }, [entries]);

  return (
    <div ref={exportRef}>
      <ReportActions targetRef={exportRef} reportName="Journal Entries" />
    <div>
      <AccountQuickTabs selectedAccountId={accountId} onSelect={setAccountId} showAllTab />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setView({ kind: 'journalForm', id: 'new' })}
          className="rounded-full bg-brand-100 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-200"
        >
          + New Journal Entry
        </button>
        <button
          type="button"
          onClick={() => setView({ kind: 'quickEntry', type: 'transfer' })}
          className="rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100"
        >
          + Quick Entry (simple 2-line)
        </button>
        <select className="rounded border border-gray-300 px-2 py-1.5 text-sm" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === 'All' ? 'All statuses' : s}
            </option>
          ))}
        </select>
        <input type="date" min={DATE_MIN} max={DATE_MAX} className="rounded border border-gray-300 px-2 py-1.5 text-sm" value={dateFrom} onChange={(e) => setDateFrom(clampIsoDate(e.target.value))} />
        <span className="text-sm text-gray-400">to</span>
        <input type="date" min={DATE_MIN} max={DATE_MAX} className="rounded border border-gray-300 px-2 py-1.5 text-sm" value={dateTo} onChange={(e) => setDateTo(clampIsoDate(e.target.value))} />
      </div>

      {error && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {voidError && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{voidError}</div>}
      {loading && <p className="text-sm text-gray-400">Loading…</p>}

      {entries && (
        <Table
          columns={columns}
          rows={entries}
          rowKey={(e) => e.id}
          onRowClick={(e) => setView({ kind: 'journalForm', id: e.id })}
          emptyMessage="No journal entries yet."
          footer={
            entries.length > 0 ? (
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-gray-700">
                  <td className="px-3 py-2" colSpan={4}>
                    Total ({entries.length})
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    <Money cents={totals.baseCents} />
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    <Money cents={totals.hstCents} />
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    <Money cents={totals.totalCents} />
                  </td>
                  <td className="px-3 py-2" colSpan={2} />
                </tr>
              </tfoot>
            ) : undefined
          }
        />
      )}
    </div>
    </div>
  );
}
