import { useEffect, useState } from 'react';
import { PAYROLL_ITEM_KIND_LABELS, type PayrollItemDefinition, type PayrollItemKind } from '@shared/domain/payroll/payrollItems';
import { CurrencyInput } from '../../components/CurrencyInput';
import { Money } from '../../components/Money';

const KINDS = Object.keys(PAYROLL_ITEM_KIND_LABELS) as PayrollItemKind[];
const T4_BOXES: Array<{ value: '' | 'rpp20' | 'unionDues44' | 'charity46'; label: string }> = [
  { value: '', label: 'None' },
  { value: 'rpp20', label: 'Box 20 — RPP contributions' },
  { value: 'unionDues44', label: 'Box 44 — Union dues' },
  { value: 'charity46', label: 'Box 46 — Charitable donations' },
];

const blank = (): PayrollItemDefinition => ({ name: '', kind: 'earning', cppApplies: true, eiApplies: true, taxApplies: true, t4Box: null, defaultAmountCents: 0, accountId: null, isActive: true });

function t4Label(box: PayrollItemDefinition['t4Box']): string {
  if (box === 'rpp20') return 'Box 20';
  if (box === 'unionDues44') return 'Box 44';
  if (box === 'charity46') return 'Box 46';
  return '';
}

/** The company's catalogue of pay-stub items — bonuses, benefits, deductions, reimbursements and
 * employer contributions — with how each is treated for CPP, EI, tax and the T4. */
export function PayrollItemsPanel() {
  const [items, setItems] = useState<PayrollItemDefinition[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PayrollItemDefinition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.api.payrollItems.list().then((r) => {
      if (r.ok) setItems(r.data);
    });
  }, []);

  async function save() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    const r = await window.api.payrollItems.save(editing);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setItems(r.data);
    setEditing(null);
  }

  function changeKind(kind: PayrollItemKind) {
    if (!editing) return;
    const cash = kind === 'earning';
    const benefit = kind === 'taxableBenefit';
    setEditing({ ...editing, kind, cppApplies: cash || benefit, eiApplies: cash, taxApplies: cash || benefit, t4Box: kind === 'deduction' ? editing.t4Box : null });
  }

  const flagsRelevant = editing?.kind === 'earning' || editing?.kind === 'taxableBenefit';
  const boxRelevant = editing?.kind === 'deduction';
  const activeCount = items.filter((i) => i.isActive).length;

  return (
    <section className="rounded border border-gray-200 bg-white" data-testid="payroll-items-panel">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between px-3 py-2 text-left">
        <span className="text-sm font-semibold text-gray-800">
          Payroll Items <span className="ml-1 text-xs font-normal text-gray-400">bonuses, benefits, deductions, reimbursements · {activeCount} active</span>
        </span>
        <span className="text-xs text-gray-400">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="border-t border-gray-100 px-3 pb-3">
          <div className="flex items-center justify-between py-2">
            <p className="text-xs text-gray-500">The CPP, EI and tax treatment is copied onto each pay run when the item is used, so editing here never changes a past stub.</p>
            <button type="button" onClick={() => setEditing(blank())} className="rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-200">
              Add item
            </button>
          </div>
          {editing && (
            <div className="mb-3 grid grid-cols-6 gap-2 rounded bg-gray-50 p-3 text-sm">
              {error && <div className="col-span-6 rounded bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>}
              <label className="col-span-2 block">
                <span className="text-xs text-gray-500">Name</span>
                <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </label>
              <label className="col-span-2 block">
                <span className="text-xs text-gray-500">Kind</span>
                <select className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1" value={editing.kind} onChange={(e) => changeKind(e.target.value as PayrollItemKind)}>
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {PAYROLL_ITEM_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-span-2 block">
                <span className="text-xs text-gray-500">Default amount</span>
                <CurrencyInput valueCents={editing.defaultAmountCents} onChange={(c) => setEditing({ ...editing, defaultAmountCents: c })} />
              </label>
              {flagsRelevant && (
                <div className="col-span-4 flex items-center gap-3 text-xs text-gray-600">
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={editing.cppApplies} onChange={(e) => setEditing({ ...editing, cppApplies: e.target.checked })} /> CPP pensionable
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={editing.eiApplies} onChange={(e) => setEditing({ ...editing, eiApplies: e.target.checked })} /> EI insurable
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={editing.taxApplies} onChange={(e) => setEditing({ ...editing, taxApplies: e.target.checked })} /> Income tax applies
                  </label>
                </div>
              )}
              {boxRelevant && (
                <label className="col-span-4 block">
                  <span className="text-xs text-gray-500">T4 box</span>
                  <select className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1" value={editing.t4Box ?? ''} onChange={(e) => setEditing({ ...editing, t4Box: (e.target.value || null) as PayrollItemDefinition['t4Box'] })}>
                    {T4_BOXES.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="col-span-1 flex items-end gap-1 pb-1 text-xs text-gray-600">
                <input type="checkbox" checked={editing.isActive} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} /> Active
              </label>
              <div className="col-span-6 flex justify-end gap-2">
                <button type="button" onClick={() => setEditing(null)} className="rounded-full px-3 py-1 text-xs text-gray-600 hover:bg-gray-100">
                  Cancel
                </button>
                <button type="button" disabled={busy || !editing.name.trim()} onClick={save} className="rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50">
                  Save
                </button>
              </div>
            </div>
          )}
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-400">
                <th className="py-1">Item</th>
                <th className="py-1">Kind</th>
                <th className="py-1">CPP</th>
                <th className="py-1">EI</th>
                <th className="py-1">Tax</th>
                <th className="py-1">T4</th>
                <th className="py-1 text-right">Default</th>
                <th className="py-1"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((i) => {
                const flagged = i.kind === 'earning' || i.kind === 'taxableBenefit';
                return (
                  <tr key={i.id} className={i.isActive ? '' : 'text-gray-400 line-through'}>
                    <td className="py-1 pr-2">{i.name}</td>
                    <td className="py-1 pr-2 text-gray-500">{PAYROLL_ITEM_KIND_LABELS[i.kind]}</td>
                    <td className="py-1">{flagged ? (i.cppApplies ? 'Yes' : '—') : ''}</td>
                    <td className="py-1">{flagged ? (i.eiApplies ? 'Yes' : '—') : ''}</td>
                    <td className="py-1">{flagged ? (i.taxApplies ? 'Yes' : '—') : ''}</td>
                    <td className="py-1 text-gray-500">{t4Label(i.t4Box)}</td>
                    <td className="py-1 text-right">{i.defaultAmountCents > 0 ? <Money cents={i.defaultAmountCents} /> : ''}</td>
                    <td className="py-1 text-right">
                      <button type="button" onClick={() => setEditing({ ...i })} className="text-brand-600 hover:underline">
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
