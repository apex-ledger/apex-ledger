import { useEffect, useState } from 'react';
import type { T4SlipResult } from '@shared/domain/payroll/computeT4Slip';
import type { T4ASlipResult } from '@shared/domain/payroll/computeT4ASlip';
import type { T5018SlipResult } from '@shared/domain/payroll/computeT5018Slip';
import { Money } from '../../components/Money';

function currentTaxYear(): number {
  return new Date().getFullYear();
}

export function YearEndSlipsPanel() {
  const [taxYear, setTaxYear] = useState(currentTaxYear());
  const [t4Preview, setT4Preview] = useState<T4SlipResult[]>([]);
  const [t4aPreview, setT4aPreview] = useState<T4ASlipResult[]>([]);
  const [t5018Preview, setT5018Preview] = useState<T5018SlipResult[]>([]);
  const [t4Downloading, setT4Downloading] = useState(false);
  const [t4aDownloading, setT4aDownloading] = useState(false);
  const [t5018Downloading, setT5018Downloading] = useState(false);
  const [t4Error, setT4Error] = useState<string | null>(null);
  const [t4aError, setT4aError] = useState<string | null>(null);
  const [t5018Error, setT5018Error] = useState<string | null>(null);

  useEffect(() => {
    window.api.payroll.getT4Preview(taxYear).then((r) => setT4Preview(r.ok ? r.data : []));
    window.api.payroll.getT4APreview(taxYear).then((r) => setT4aPreview(r.ok ? r.data : []));
    window.api.payroll.getT5018Preview(taxYear).then((r) => setT5018Preview(r.ok ? r.data : []));
  }, [taxYear]);

  async function handleDownloadT4() {
    setT4Downloading(true);
    setT4Error(null);
    const result = await window.api.payroll.generateT4Slips({ taxYear });
    setT4Downloading(false);
    if (!result.ok) setT4Error(result.error);
  }

  async function handleDownloadT4A() {
    setT4aDownloading(true);
    setT4aError(null);
    const result = await window.api.payroll.generateT4ASlips({ taxYear });
    setT4aDownloading(false);
    if (!result.ok) setT4aError(result.error);
  }

  async function handleDownloadT5018() {
    setT5018Downloading(true);
    setT5018Error(null);
    const result = await window.api.payroll.generateT5018Slips({ taxYear });
    setT5018Downloading(false);
    if (!result.ok) setT5018Error(result.error);
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-900">Year-End Slips (T4 / T4A / T5018)</h2>
        <label className="text-sm">
          <span className="text-gray-600">Tax Year</span>
          <input
            type="number"
            className="ml-2 w-24 rounded border border-gray-300 px-2 py-1.5 text-sm"
            value={taxYear}
            onChange={(e) => setTaxYear(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">T4 — Employees</h3>
            <button
              type="button"
              disabled={t4Downloading || t4Preview.length === 0}
              onClick={handleDownloadT4}
              className="rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
            >
              {t4Downloading ? 'Generating…' : 'Download T4 Slips (PDF)'}
            </button>
          </div>
          {t4Error && <p className="mb-2 text-xs text-red-600">{t4Error}</p>}
          {t4Preview.length === 0 ? (
            <p className="text-sm text-gray-400">No posted pay runs with a pay date in {taxYear}.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="pb-1.5">Employee</th>
                  <th className="pb-1.5 text-right">Box 14</th>
                </tr>
              </thead>
              <tbody>
                {t4Preview.map((s) => (
                  <tr key={s.employeeId} className="border-b border-gray-100">
                    <td className="py-1.5 text-gray-700">{s.employeeName}</td>
                    <td className="py-1.5 text-right">
                      <Money cents={s.employmentIncomeCents} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">T4A — Contractors (Box 048)</h3>
            <button
              type="button"
              disabled={t4aDownloading || t4aPreview.length === 0}
              onClick={handleDownloadT4A}
              className="rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
            >
              {t4aDownloading ? 'Generating…' : 'Download T4A Slips (PDF)'}
            </button>
          </div>
          {t4aError && <p className="mb-2 text-xs text-red-600">{t4aError}</p>}
          {t4aPreview.length === 0 ? (
            <p className="text-sm text-gray-400">
              No T4A-flagged vendors with a paid bill in {taxYear}. Flag a vendor as a T4A contractor from the Vendors tab.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="pb-1.5">Vendor</th>
                  <th className="pb-1.5 text-right">Box 048</th>
                </tr>
              </thead>
              <tbody>
                {t4aPreview.map((s) => (
                  <tr key={s.vendorId} className="border-b border-gray-100">
                    <td className="py-1.5 text-gray-700">{s.vendorName}</td>
                    <td className="py-1.5 text-right">
                      <Money cents={s.feesForServicesCents} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">T5018 — Subcontractors (Box 22)</h3>
            <button
              type="button"
              disabled={t5018Downloading || t5018Preview.length === 0}
              onClick={handleDownloadT5018}
              className="rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
            >
              {t5018Downloading ? 'Generating…' : 'Download T5018 Slips (PDF)'}
            </button>
          </div>
          {t5018Error && <p className="mb-2 text-xs text-red-600">{t5018Error}</p>}
          {t5018Preview.length === 0 ? (
            <p className="text-sm text-gray-400">
              No T5018-flagged vendors with $500+ in paid bills in {taxYear}. Flag a construction subcontractor from the Vendors tab.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="pb-1.5">Vendor</th>
                  <th className="pb-1.5 text-right">Box 22</th>
                </tr>
              </thead>
              <tbody>
                {t5018Preview.map((s) => (
                  <tr key={s.vendorId} className="border-b border-gray-100">
                    <td className="py-1.5 text-gray-700">{s.vendorName}</td>
                    <td className="py-1.5 text-right">
                      <Money cents={s.totalPaymentsCents} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <p className="mt-3 text-xs text-gray-400">
        Working copies only — verify the information and amounts before filing the required slips and summaries.
      </p>
    </section>
  );
}
