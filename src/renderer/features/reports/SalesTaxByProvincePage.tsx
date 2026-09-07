import { useState } from 'react';
import type { SalesTaxByProvinceResult } from '@shared/domain/ledger/salesTaxByProvince';
import type { ProvincialSalesTaxResult } from '@shared/domain/ledger/provincialSalesTax';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { DateInput } from '../../components/DateInput';
import { Money } from '../../components/Money';
import { EnteredTd, EnteredTh } from '../../components/EnteredCell';
import { OpenEntryButton } from '../../components/OpenEntryButton';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { useUiStore } from '../../app/store/uiStore';
import { openOriginalEntry } from '../../utils/openOriginalEntry';

function yearStart(): string { return `${localIsoDate().slice(0, 4)}-01-01`; }

/** Sales tax across the whole of Canada: every province and territory with its rate, which
 * return it files on, and the period's federal (GST/HST) and provincial (PST/RST/QST) figures kept
 * apart. Beneath it, the provincial returns themselves — what is owed to BC, Saskatchewan,
 * Manitoba and Revenu Québec — down to the transaction. The GST/HST return stays on its own
 * HST pages; nothing here double-counts a dollar with them. */
export function SalesTaxByProvincePage() {
  const setView = useUiStore((s) => s.setView);
  const [periodStart, setPeriodStart] = useState(yearStart());
  const [periodEnd, setPeriodEnd] = useState(localIsoDate());
  const { data, loading, error } = useIpcQuery<SalesTaxByProvinceResult>(() => window.api.reports.salesTaxByProvince({ periodStart, periodEnd }), [periodStart, periodEnd]);
  const { data: returns } = useIpcQuery<ProvincialSalesTaxResult>(() => window.api.reports.provincialSalesTax({ periodStart, periodEnd }), [periodStart, periodEnd]);
  // 7% and 14% read as whole numbers; Quebec's 9.975% keeps its decimals.
  const pct = (r: number) => `${parseFloat((r * 100).toFixed(3))}%`;

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <DateInput value={periodStart} onChange={setPeriodStart} className="w-32" />
        <span className="text-sm text-gray-400">to</span>
        <DateInput value={periodEnd} onChange={setPeriodEnd} className="w-32" />
        <span className="text-xs text-gray-500">Federal = GST/HST (CRA return). Provincial = PST, RST or QST (province's return). Purchases: ITC = GST/HST claimable; ITR = QST refundable (Quebec registrants only).</span>
      </div>
      {loading && <p className="text-sm text-gray-400">Loading…</p>}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {data && (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="w-full min-w-[1100px] border-collapse text-sm">
            <caption className="caption-top border-b border-gray-100 px-4 py-2 text-center">
              <span className="block text-lg font-semibold text-gray-900">Sales Tax by Province — all of Canada</span>
              <span className="block text-sm text-gray-600" data-export-row>{periodStart} to {periodEnd}</span>
            </caption>
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Province / territory</th>
                <th className="px-3 py-2 text-left">Rate</th>
                <th className="px-3 py-2 text-left">Filed with</th>
                <th className="px-3 py-2 text-right">Taxable sales</th>
                <th className="px-3 py-2 text-right">Federal collected</th>
                <th className="px-3 py-2 text-right">Federal ITC</th>
                <th className="px-3 py-2 text-right">Federal net</th>
                <th className="px-3 py-2 text-right">Provincial collected</th>
                <th className="px-3 py-2 text-right">Provincial ITR</th>
                <th className="px-3 py-2 text-right">Provincial net</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.label} className={`border-b border-gray-100 ${r.lineCount === 0 ? 'text-gray-400' : ''}`}>
                  <td className="px-3 py-1.5 font-medium">{r.label}</td>
                  <td className="px-3 py-1.5 tabular-nums">{r.jurisdiction ? `${pct(r.jurisdiction.rate)}${r.jurisdiction.provincialTaxName ? ` (GST ${pct(r.jurisdiction.federalRate)} + ${r.jurisdiction.provincialTaxName} ${pct(r.jurisdiction.provincialRate)})` : ''}` : '—'}</td>
                  <td className="px-3 py-1.5 text-xs">{r.jurisdiction?.filedWith ?? 'CRA (GST/HST)'}</td>
                  <td className="px-3 py-1.5 text-right"><Money cents={r.taxableSalesCents} /></td>
                  <td className="px-3 py-1.5 text-right"><Money cents={r.federalCollectedCents} /></td>
                  <td className="px-3 py-1.5 text-right"><Money cents={r.federalItcCents} /></td>
                  <td className="px-3 py-1.5 text-right font-medium"><Money cents={r.federalNetCents} /></td>
                  <td className="px-3 py-1.5 text-right">{r.jurisdiction?.provincialTaxName ? <Money cents={r.provincialCollectedCents} /> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-1.5 text-right">{r.jurisdiction?.code === 'QC' ? <Money cents={r.provincialItrCents} /> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-1.5 text-right font-medium">{r.jurisdiction?.provincialTaxName ? <Money cents={r.provincialNetCents} /> : <span className="text-gray-300">—</span>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td className="px-3 py-2" colSpan={3}>Total</td>
                <td className="px-3 py-2 text-right"><Money cents={data.totals.taxableSalesCents} /></td>
                <td className="px-3 py-2 text-right"><Money cents={data.totals.federalCollectedCents} /></td>
                <td className="px-3 py-2 text-right"><Money cents={data.totals.federalItcCents} /></td>
                <td className="px-3 py-2 text-right"><Money cents={data.totals.federalNetCents} /></td>
                <td className="px-3 py-2 text-right"><Money cents={data.totals.provincialCollectedCents} /></td>
                <td className="px-3 py-2 text-right"><Money cents={data.totals.provincialItrCents} /></td>
                <td className="px-3 py-2 text-right"><Money cents={data.totals.provincialNetCents} /></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {returns && returns.rows.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Provincial returns — transaction detail</h2>
          {returns.rows.map((row) => (
            <div key={row.province} className="overflow-x-auto rounded border border-gray-200 bg-white">
              <table className="w-full border-collapse text-sm">
                <caption className="caption-top border-b border-gray-100 px-4 py-2 text-left">
                  <span className="font-semibold text-gray-900">{row.taxName} — {row.province}</span>
                  <span className="ml-3 text-gray-600">collected <Money cents={row.collectedCents} /> on sales of <Money cents={row.taxableSalesCents} /></span>
                  {row.refundableCents > 0 && <span className="ml-3 text-gray-600">· refundable <Money cents={row.refundableCents} /> on purchases of <Money cents={row.taxablePurchasesCents} /></span>}
                  <span className="ml-3 font-semibold text-gray-900">· net owing <Money cents={row.netCents} /></span>
                </caption>
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr><th className="px-3 py-2 text-left">Date</th><EnteredTh className="px-3 py-2 text-left" /><th className="px-3 py-2 text-left">Reference</th><th className="px-3 py-2 text-left">Memo</th><th className="px-3 py-2 text-left">Side</th><th className="px-3 py-2 text-right">Base</th><th className="px-3 py-2 text-right">{row.taxName}</th></tr>
                </thead>
                <tbody>
                  {row.lines.map((l, i) => (
                    <tr key={`${l.entryId}-${i}`} onClick={() => void openOriginalEntry(l.entryId, setView)} className="cursor-pointer border-b border-gray-100 hover:bg-brand-50">
                      <td className="px-3 py-1.5"><div className="flex items-center gap-2"><span>{l.entryDate}</span><OpenEntryButton entryId={l.entryId} compact /></div></td>
                      <EnteredTd at={l.createdAt} className="px-3 py-1.5" />
                      <td className="px-3 py-1.5">{l.reference ?? '—'}</td>
                      <td className="px-3 py-1.5">{l.memo ?? '—'}</td>
                      <td className="px-3 py-1.5">{l.direction === 'sale' ? 'Collected' : 'Paid'}</td>
                      <td className="px-3 py-1.5 text-right"><Money cents={l.baseCents} /></td>
                      <td className="px-3 py-1.5 text-right"><Money cents={l.provincialTaxCents} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
