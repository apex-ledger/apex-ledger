import { useState } from 'react';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { Table, type TableColumn } from '../../components/Table';
import type { FiscalPeriod } from '@shared/domain/types';
import { isHstFilingPeriod } from '@shared/domain/ledger/postJournalEntry';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';

export function FiscalPeriodsPanel() {
  const { data: periods, error, reload } = useIpcQuery(() => window.api.fiscalPeriods.list(), []);
  const [label, setLabel] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreate() {
    setFormError(null);
    const result = await window.api.fiscalPeriods.create({ label, periodStart, periodEnd });
    if (!result.ok) return setFormError(result.error);
    setLabel('');
    setPeriodStart('');
    setPeriodEnd('');
    reload();
  }

  async function toggleLock(period: FiscalPeriod) {
    const result = period.isLocked
      ? await window.api.fiscalPeriods.unlock(period.id)
      : await window.api.fiscalPeriods.lock(period.id);
    if (!result.ok) return setFormError(result.error);
    setFormError(null);
    reload();
  }

  const columns: TableColumn<FiscalPeriod>[] = [
    { key: 'label', header: 'Label', render: (p) => p.label },
    { key: 'start', header: 'Start', render: (p) => p.periodStart },
    { key: 'end', header: 'End', render: (p) => p.periodEnd },
    {
      key: 'status',
      header: 'Status',
      render: (p) =>
        isHstFilingPeriod(p) ? (
          <span className="rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-700">Filed return — entries allowed</span>
        ) : p.isLocked ? (
          <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-700">Locked</span>
        ) : (
          <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">Open</span>
        ),
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: (p) =>
        isHstFilingPeriod(p) ? (
          <span className="text-xs text-gray-400">Manage in Sales Tax</span>
        ) : (
          <button type="button" onClick={() => toggleLock(p)} className="text-sm font-medium text-brand-600 hover:underline">
            {p.isLocked ? 'Unlock' : 'Lock'}
          </button>
        ),
    },
  ];

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-gray-700">Fiscal Periods</h3>
      {error && <div className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {periods && <Table columns={columns} rows={periods} rowKey={(p) => p.id} emptyMessage="No fiscal periods yet." />}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="block text-gray-600">Label</span>
          <input className="mt-1 rounded border border-gray-300 px-2 py-1" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="FY2026" />
        </label>
        <label className="text-sm">
          <span className="block text-gray-600">Start</span>
          <input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 rounded border border-gray-300 px-2 py-1" value={periodStart} onChange={(e) => setPeriodStart(clampIsoDate(e.target.value))} />
        </label>
        <label className="text-sm">
          <span className="block text-gray-600">End</span>
          <input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 rounded border border-gray-300 px-2 py-1" value={periodEnd} onChange={(e) => setPeriodEnd(clampIsoDate(e.target.value))} />
        </label>
        <button
          type="button"
          disabled={!label || !periodStart || !periodEnd}
          onClick={handleCreate}
          className="rounded-full bg-brand-100 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
        >
          Add Period
        </button>
      </div>
      {formError && <p className="mt-2 text-sm text-red-700">{formError}</p>}
    </div>
  );
}
