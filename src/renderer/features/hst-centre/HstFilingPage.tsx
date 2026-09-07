import { useCallback, useEffect, useState } from 'react';
import type { HstFiling } from '@shared/domain/types';
import type { HstFilingPreview } from '@shared/domain/ledger/hstFiling';
import { Money } from '../../components/Money';
import { buttonClass } from '../../components/Button';
import { JournalEntryLink } from '../../components/JournalEntryLink';
import { useUiStore } from '../../app/store/uiStore';
import { craHstAccountNumber } from '@shared/domain/company/craAccountNumber';
import { hstFilingTimingError, latestCompletedCalendarQuarter } from '@shared/domain/ledger/hstFiling';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { EnteredTd, EnteredText, EnteredTh } from '../../components/EnteredCell';
import { localIsoDate } from '@shared/domain/dates/localDate';

/** CRA's own entry points — the ones canada.ca links to. A deeper page (the eligibility step,
 * the payment voucher) refuses a direct visit with "Bookmark error", because CRA only serves
 * it after its first page has started a session. Nothing can pre-fill a CRA page; the figures to
 * type are shown beside the buttons and copied to the clipboard when a button is pressed. */
export const CRA_GST_HST_NETFILE_URL = 'https://apps.cra-arc.gc.ca/ebci/ghnf/netf/prot/ntr.action?request_locale=en_CA';
export const CRA_MY_PAYMENT_URL = 'https://apps.cra-arc.gc.ca/ebci/fppp/mypymnt/pub/ntr.action?request_locale=en_CA';

function todayIso(): string {
  return localIsoDate();
}

export function craFilingClipboard(accountNumber: string, periodStart: string, periodEnd: string): string {
  return `GST/HST account number: ${accountNumber}\nReporting period start: ${periodStart}\nReporting period end: ${periodEnd}`;
}

export function HstFilingPage() {
  const setView = useUiStore((state) => state.setView);
  const quarter = latestCompletedCalendarQuarter(todayIso());
  const [periodStart, setPeriodStart] = useState(quarter.start);
  const [periodEnd, setPeriodEnd] = useState(quarter.end);
  const [filingDate, setFilingDate] = useState(todayIso());
  const [memo, setMemo] = useState('');
  const [preview, setPreview] = useState<HstFilingPreview | null>(null);
  const [filings, setFilings] = useState<HstFiling[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hstAccountNumber, setHstAccountNumber] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  /** Opens Sales Tax Detail on this period, on the side of the figure that was clicked. */
  function openDetail(side: 'collected' | 'paid', start = periodStart, end = periodEnd) {
    setView({ kind: 'report', report: 'salesTaxDetail', salesTax: { periodStart: start, periodEnd: end, side } });
  }

  async function copyField(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(key);
      window.setTimeout(() => setCopiedField(null), 1500);
    } catch {
      // Clipboard can be blocked by policy; the value stays visible to type.
    }
  }

  const reloadFilings = useCallback(() => {
    window.api.hstFilings.list().then((r) => {
      if (r.ok) setFilings(r.data);
    });
  }, []);

  useEffect(() => {
    reloadFilings();
  }, [reloadFilings]);

  useEffect(() => {
    window.api.company.get().then((r) => {
      if (r.ok) setHstAccountNumber(craHstAccountNumber(r.data.hstNumber, r.data.businessNumber));
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    window.api.hstFilings.preview({ periodStart, periodEnd }).then((r) => {
      if (cancelled) return;
      if (r.ok) setPreview(r.data);
      else {
        setPreview(null);
        setError(r.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [periodStart, periodEnd]);

  const net = preview?.netPayableCents ?? 0;
  const alreadyFiled = (preview?.overlappingFilings.length ?? 0) > 0;
  const nothingToFile = preview !== null && preview.collectedCents === 0 && preview.itcCents === 0;
  const timingError = hstFilingTimingError(periodEnd, filingDate, todayIso());

  async function handleFile() {
    if (timingError) return setError(timingError);
    setBusy(true);
    setError(null);
    const result = await window.api.hstFilings.create({ periodStart, periodEnd, filingDate, paymentAccountId: null, memo: memo.trim() || null });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setMemo('');
    reloadFilings();
    const refreshed = await window.api.hstFilings.preview({ periodStart, periodEnd });
    if (refreshed.ok) setPreview(refreshed.data);
  }

  async function handleVoid(id: number) {
    const filing = filings.find((item) => item.id === id);
    if (!window.confirm(`Void${filing ? ` the HST return for ${filing.periodStart} to ${filing.periodEnd}` : ' this HST return'}? Its filing journal entry will be voided and the period can be filed again.`)) return;
    setBusy(true);
    setError(null);
    const result = await window.api.hstFilings.void(id);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    reloadFilings();
    const refreshed = await window.api.hstFilings.preview({ periodStart, periodEnd });
    if (refreshed.ok) setPreview(refreshed.data);
  }

  async function copyCraDetails() {
    if (!hstAccountNumber) return;
    try {
      await navigator.clipboard.writeText(craFilingClipboard(hstAccountNumber, periodStart, periodEnd));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission can be denied by Windows/browser policy. The CRA page must still
      // open; the same account and reporting period remain visible immediately above for typing.
    }
  }

  return (
    <div className="w-full space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-brand-900">Sales Tax Return</h2>
        <p className="mt-1 text-sm text-gray-500">
          Review taxable income, HST received from customers, and HST paid on purchases (ITCs). Filing clears the tax accounts and records the net as
          owing to CRA or as a refund receivable. It does not move cash; record the actual payment or refund separately when it reaches the bank.
        </p>
      </div>

      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="rounded border border-gray-200 bg-white p-3">
        <div className="grid grid-cols-3 gap-3">
          <label className="block text-sm">
            <span className="text-gray-600">Period start</span>
            <input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={periodStart} onChange={(e) => setPeriodStart(clampIsoDate(e.target.value))} />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Period end</span>
            <input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={periodEnd} onChange={(e) => setPeriodEnd(clampIsoDate(e.target.value))} />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Filing date</span>
            <input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={filingDate} onChange={(e) => setFilingDate(clampIsoDate(e.target.value))} />
          </label>
        </div>

        <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-3">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
            <label className="block text-sm">
              <span className="text-blue-800">CRA GST/HST account</span>
              <input
                aria-label="CRA GST/HST account"
                readOnly
                className="mt-1 w-full rounded border border-blue-200 bg-white px-2 py-1.5 font-mono"
                value={hstAccountNumber}
                placeholder="Add 123456789RT0001 in Company Settings"
              />
            </label>
            <div className="text-sm text-blue-900">
              <span className="block text-blue-800">Reporting period</span>
              <span className="mt-1 block rounded border border-blue-200 bg-white px-2 py-1.5 font-mono">
                {periodStart} to {periodEnd}
              </span>
            </div>
            <button type="button" disabled={!hstAccountNumber} onClick={copyCraDetails} className={buttonClass('secondary', 'sm')}>
              {copied ? 'Copied' : 'Copy CRA details'}
            </button>
          </div>
          {!hstAccountNumber ? (
            <p className="mt-2 text-xs text-amber-700">
              A complete GST/HST account number is missing.{' '}
              <button type="button" onClick={() => setView({ kind: 'companySettings' })} className="font-medium underline">
                Add it in Company Settings
              </button>
              .
            </p>
          ) : (
            <p className="mt-2 text-xs text-blue-700">
              Apex Ledger loaded the account from Company Settings and keeps this period synchronized with the return above.
            </p>
          )}
        </div>

        {preview && (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <button type="button" onClick={() => openDetail('collected')} title="See the sales behind this figure" className="rounded border border-sky-200 bg-sky-50 p-3 text-left hover:ring-2 hover:ring-sky-300">
                <div className="text-xs uppercase tracking-wide text-sky-700">Taxable income / sales</div>
                <div className="mt-1 text-lg font-semibold text-sky-950"><Money cents={preview.taxableIncomeCents} /></div>
              </button>
              <button type="button" onClick={() => openDetail('collected')} title="See every transaction that collected this tax" className="rounded border border-emerald-200 bg-emerald-50 p-3 text-left hover:ring-2 hover:ring-emerald-300">
                <div className="text-xs uppercase tracking-wide text-emerald-700">HST received / collected</div>
                <div className="mt-1 text-lg font-semibold text-emerald-950"><Money cents={preview.collectedCents} /></div>
              </button>
              <button type="button" onClick={() => openDetail('paid')} title="See every purchase that claimed this tax" className="rounded border border-amber-200 bg-amber-50 p-3 text-left hover:ring-2 hover:ring-amber-300">
                <div className="text-xs uppercase tracking-wide text-amber-700">HST paid / ITC</div>
                <div className="mt-1 text-lg font-semibold text-amber-950"><Money cents={preview.itcCents} /></div>
              </button>
              <button type="button" onClick={() => openDetail(net >= 0 ? 'collected' : 'paid')} title="See the transactions behind the net figure" className={`rounded border p-3 text-left hover:ring-2 ${net >= 0 ? 'border-rose-200 bg-rose-50 hover:ring-rose-300' : 'border-green-200 bg-green-50 hover:ring-green-300'}`}>
                <div className={`text-xs uppercase tracking-wide ${net >= 0 ? 'text-rose-700' : 'text-green-700'}`}>
                  {net >= 0 ? 'Net payable to CRA' : 'Refund from CRA'}
                </div>
                <div className={`mt-1 text-lg font-semibold ${net >= 0 ? 'text-rose-950' : 'text-green-950'}`}><Money cents={Math.abs(net)} /></div>
              </button>
            </div>

            <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
              <button type="button" onClick={() => openDetail('collected')} className="flex w-full justify-between text-gray-600 hover:text-brand-700 hover:underline">
                <span>Income subject to GST/HST</span>
                <Money cents={preview.taxableIncomeCents} />
              </button>
              <button type="button" onClick={() => openDetail('collected')} className="flex w-full justify-between text-gray-600 hover:text-brand-700 hover:underline">
                <span>GST/HST received or charged to customers</span>
                <Money cents={preview.collectedCents} />
              </button>
              <button type="button" onClick={() => openDetail('paid')} className="flex w-full justify-between text-gray-600 hover:text-brand-700 hover:underline">
                <span>Purchases supporting ITCs</span>
                <Money cents={preview.taxablePurchasesCents} />
              </button>
              <button type="button" onClick={() => openDetail('paid')} className="flex w-full justify-between text-gray-600 hover:text-brand-700 hover:underline">
                <span>Less GST/HST paid — input tax credits</span>
                <Money cents={-preview.itcCents} />
              </button>
              <div className="mt-1 flex justify-between border-t border-gray-200 pt-1 font-bold text-gray-800">
                <span>{net >= 0 ? 'Net sales tax payable to CRA' : 'Net sales tax refund from CRA'}</span>
                <Money cents={Math.abs(net)} />
              </div>
            </div>

            <button type="button" onClick={() => openDetail('collected')} className="text-sm font-medium text-brand-700 hover:underline">
              View transactions behind this sales tax return →
            </button>
          </div>
        )}

        {preview && preview.pendingManualCount > 0 && (
          <p className="mt-2 text-xs text-amber-600">
            {preview.pendingManualCount} manual-HST line{preview.pendingManualCount === 1 ? '' : 's'} in this period still {preview.pendingManualCount === 1 ? 'has' : 'have'} no
            amount entered — those are excluded from the totals above, so filing now would under-report. Open each entry and type the HST from the receipt in its Tax Amt box first.
          </p>
        )}

        {alreadyFiled && (
          <p className="mt-2 text-xs text-red-600">
            This period overlaps a return already filed ({preview!.overlappingFilings.map((f) => `${f.periodStart} to ${f.periodEnd}`).join(', ')}). Void that
            filing below to re-file.
          </p>
        )}

        {timingError && (
          <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {timingError} Record the return as filed only after the full reporting period has ended and CRA has accepted the submission.
          </p>
        )}



        <label className="mt-3 block text-sm">
          <span className="text-gray-600">Memo (optional)</span>
          <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </label>

        {preview && (
          <div className="mt-3 rounded border border-gray-200 bg-white p-3 text-sm">
            <div className="mb-2 font-semibold text-gray-800">What to type on the CRA page</div>
            <p className="mb-2 text-xs text-gray-500">CRA's website cannot be filled in by any software. Each line below has a Copy button; the account number and period are also copied together when a CRA button is pressed.</p>
            <dl className="grid gap-1 sm:grid-cols-2">
              {[
                ['account', 'GST/HST account number', hstAccountNumber || 'Set the GST/HST number in Company Settings'],
                ['from', 'Reporting period from', periodStart],
                ['to', 'Reporting period to', periodEnd],
                ['101', 'Line 101 — sales and other revenue', (preview.taxableIncomeCents / 100).toFixed(2)],
                ['105', 'Line 105 — GST/HST collected', (preview.collectedCents / 100).toFixed(2)],
                ['108', 'Line 108 — input tax credits', (preview.itcCents / 100).toFixed(2)],
                ['109', 'Line 109 — net tax', (net / 100).toFixed(2)],
                ['pay', net >= 0 ? 'Amount to pay (My Payment)' : 'Refund claimed', (Math.abs(net) / 100).toFixed(2)],
              ].map(([key, label, value]) => (
                <div key={key} className="flex items-center justify-between gap-2 rounded bg-gray-50 px-2 py-1">
                  <dt className="text-gray-600">{label}</dt>
                  <dd className="flex items-center gap-2 font-medium tabular-nums text-gray-900">
                    {value}
                    <button type="button" onClick={() => void copyField(key, value)} className="rounded border border-gray-300 px-1.5 py-0.5 text-[11px] text-gray-600 hover:bg-white" aria-label={`Copy ${label}`}>
                      {copiedField === key ? 'Copied' : 'Copy'}
                    </button>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a
            href={CRA_GST_HST_NETFILE_URL}
            target="_blank"
            rel="noreferrer"
            onClick={() => void copyCraDetails()}
            className={buttonClass('primary')}
          >
            Open CRA GST/HST NETFILE
          </a>
          <a
            href={CRA_MY_PAYMENT_URL}
            target="_blank"
            rel="noreferrer"
            onClick={() => void copyCraDetails()}
            className={buttonClass('secondary')}
            title="CRA My Payment — pay the net tax from your bank by debit"
          >
            Open CRA My Payment
          </a>
          <button
            type="button"
            disabled={busy || preview === null || alreadyFiled || nothingToFile || timingError !== null}
            onClick={handleFile}
            className={buttonClass('secondary')}
          >
            Record Return as Filed in Apex Ledger
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Both buttons open CRA's own first page — a deeper CRA page refuses a direct visit ("Bookmark error"). Nothing can fill in a CRA page for you; use the figures above. Record the return as filed only after CRA confirms submission.
        </p>
        {nothingToFile && <span className="ml-3 text-xs text-gray-400">No GST/HST activity in this period.</span>}
      </div>

      <div className="rounded border border-gray-200 bg-white p-3">
        <h3 className="mb-2 text-sm font-bold text-gray-800">Filed returns</h3>
        {filings.length === 0 ? (
          <p className="text-sm text-gray-400">Nothing filed yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="py-1">Period</th>
                <th className="py-1">Filed</th><EnteredTh className="py-1" />
                <th className="py-1 text-right">Collected</th>
                <th className="py-1 text-right">ITCs</th>
                <th className="py-1 text-right">Net</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {filings.map((f) => (
                <tr key={f.id} className="border-t border-gray-100">
                  <td className="py-1.5 text-gray-700">
                    {f.periodStart} to {f.periodEnd}
                  </td>
                  <td className="py-1.5 text-gray-500">{f.filingDate}</td><EnteredTd at={f.createdAt} className="py-1.5" />
                  <td className="py-1.5 text-right">
                    <button type="button" onClick={() => openDetail('collected', f.periodStart, f.periodEnd)} className="hover:text-brand-700 hover:underline" title="Transactions that collected this tax">
                      <Money cents={f.collectedCents} />
                    </button>
                  </td>
                  <td className="py-1.5 text-right">
                    <button type="button" onClick={() => openDetail('paid', f.periodStart, f.periodEnd)} className="hover:text-brand-700 hover:underline" title="Purchases that claimed this tax">
                      <Money cents={f.itcCents} />
                    </button>
                  </td>
                  <td className="py-1.5 text-right font-medium">
                    <Money cents={f.netPayableCents} />
                  </td>
                  <td className="py-1.5 text-right">
                    <JournalEntryLink id={f.journalEntryId} label="View GL" className="mr-3" />
                    <button type="button" disabled={busy} onClick={() => handleVoid(f.id)} className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50">
                      Void
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
