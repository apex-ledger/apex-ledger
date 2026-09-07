import { useEffect, useState, type RefObject } from 'react';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';

type QuickPeriod = 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'thisYear' | 'lastYear';

function iso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function quickReportPeriod(period: QuickPeriod, anchor = new Date()): { from: string; to: string } {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  if (period === 'thisMonth') return { from: iso(new Date(year, month, 1)), to: iso(new Date(year, month + 1, 0)) };
  if (period === 'lastMonth') return { from: iso(new Date(year, month - 1, 1)), to: iso(new Date(year, month, 0)) };
  if (period === 'thisQuarter') {
    const firstMonth = Math.floor(month / 3) * 3;
    return { from: iso(new Date(year, firstMonth, 1)), to: iso(new Date(year, firstMonth + 3, 0)) };
  }
  if (period === 'lastYear') return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

function setNativeDate(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

export function ReportPeriodControls({ targetRef, reportKey }: { targetRef: RefObject<HTMLDivElement>; reportKey: string }) {
  const initial = quickReportPeriod('thisYear');
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);

  useEffect(() => {
    const inputs = targetRef.current?.querySelectorAll<HTMLInputElement>('input[type="date"]');
    if (!inputs?.length) return;
    if (inputs.length >= 2) setFrom(inputs[0].value || initial.from);
    setTo(inputs[inputs.length >= 2 ? 1 : 0].value || initial.to);
    // Each report owns its dates; this only mirrors them when the sheet changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportKey]);

  function choose(period: QuickPeriod) {
    const anchor = from ? new Date(`${from}T12:00:00`) : new Date();
    const range = quickReportPeriod(period, anchor);
    setFrom(range.from); setTo(range.to);
  }

  function apply() {
    const inputs = [...(targetRef.current?.querySelectorAll<HTMLInputElement>('input[type="date"]') ?? [])];
    if (inputs.length === 1) setNativeDate(inputs[0], to);
    if (inputs.length >= 2) {
      setNativeDate(inputs[0], from);
      setNativeDate(inputs[1], to);
    }
  }

  return (
    // Inline in the report toolbar: a small toggle, and when open the period fields sit on the
    // same row as everything else instead of in their own band above the sheet.
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => setOpen((current) => !current)} className="whitespace-nowrap rounded border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100">{open ? '▾' : '▸'} Report period</button>
      {open && <>
        <select aria-label="Quick fill report period" onChange={(event) => event.target.value && choose(event.target.value as QuickPeriod)} defaultValue="" className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700"><option value="">Quick fill…</option><option value="thisMonth">This month</option><option value="lastMonth">Last month</option><option value="thisQuarter">This quarter</option><option value="thisYear">This calendar year</option><option value="lastYear">Last calendar year</option></select>
        <input aria-label="Report period from" type="date" min={DATE_MIN} max={DATE_MAX} value={from} onChange={(event) => setFrom(clampIsoDate(event.target.value))} className="rounded border border-gray-300 px-2 py-1 text-xs" />
        <span className="text-xs text-gray-400">to</span>
        <input aria-label="Report period to" type="date" min={DATE_MIN} max={DATE_MAX} value={to} onChange={(event) => setTo(clampIsoDate(event.target.value))} className="rounded border border-gray-300 px-2 py-1 text-xs" />
        <button type="button" onClick={apply} className="rounded-full bg-brand-800 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700" title="One-date reports use the To date">Apply</button>
      </>}
    </div>
  );
}
