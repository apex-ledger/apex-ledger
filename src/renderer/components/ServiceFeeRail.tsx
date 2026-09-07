import { useState } from 'react';
import type { Product } from '../../preload/index';
import { FIRM_SERVICE_GROUPS, FIRM_SERVICES } from '@shared/domain/sales/firmServices';

/** Kept under their old names for the callers and tests that import them here. */
export const SERVICE_FEE_GROUPS = FIRM_SERVICE_GROUPS;
export const PROFESSIONAL_SERVICE_FEES = FIRM_SERVICES;

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** The firm's services, one click from an invoice line.
 *
 * Two sources, in this order: the services the firm has saved in Items & Prices (with their
 * prices, since those are what the line will carry), then the standard catalogue for anything not
 * saved yet, grouped by category — choosing one of those opens item setup so the fee is entered
 * once and reused. A name on neither list is typed into the box and becomes an item the same way.
 * One row of dropdowns only: the chip strip that used to sit under it repeated the same list. */
export function ServiceFeeRail({ onChoose, services = [] }: { onChoose: (name: string) => void; services?: Product[] }) {
  const [newService, setNewService] = useState('');
  const saved = services.filter((product) => product.isActive && !product.trackQuantity).sort((a, b) => a.name.localeCompare(b.name));
  const savedNames = new Set(saved.map((product) => product.name.trim().toLowerCase()));

  function submitNewService() {
    const name = newService.trim();
    if (!name) return;
    onChoose(name);
    setNewService('');
  }

  return (
    <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/70 px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wide text-indigo-800">Services</div>
        {saved.length > 0 && (
          <select aria-label="Your services" defaultValue="" onChange={(event) => { if (event.target.value) onChoose(event.target.value); event.target.value = ''; }} className="max-w-72 rounded border border-indigo-300 bg-white px-2 py-1 text-xs font-semibold text-indigo-900">
            <option value="">Your services…</option>
            {saved.map((product) => <option key={product.id} value={product.name}>{product.name}{product.salePriceCents > 0 ? ` — ${dollars(product.salePriceCents)}` : ''}</option>)}
          </select>
        )}
        <select aria-label="All accounting service fees" defaultValue="" onChange={(event) => { if (event.target.value) onChoose(event.target.value); event.target.value = ''; }} className="max-w-64 rounded border border-indigo-200 bg-white px-2 py-1 text-xs text-indigo-900">
          <option value="">Choose any service…</option>
          {SERVICE_FEE_GROUPS.map((group) => <optgroup key={group.category} label={group.category}>{group.fees.map((fee) => <option key={fee} value={fee}>{fee}{savedNames.has(fee.toLowerCase()) ? ' ✓' : ''}</option>)}</optgroup>)}
        </select>
        <input
          aria-label="New service name"
          value={newService}
          onChange={(event) => setNewService(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submitNewService(); } }}
          placeholder="Add a service not listed…"
          className="w-56 min-w-0 rounded border border-indigo-200 bg-white px-2 py-1 text-xs"
        />
        <button type="button" onClick={submitNewService} disabled={!newService.trim()} className="rounded border border-indigo-300 bg-white px-2.5 py-1 text-xs font-semibold text-indigo-900 hover:bg-indigo-100 disabled:opacity-40">
          + Add service
        </button>
        <p className="ml-auto text-[11px] text-indigo-700">Prices come from Items &amp; Prices; edit them there once and every invoice follows.</p>
      </div>
    </div>
  );
}
