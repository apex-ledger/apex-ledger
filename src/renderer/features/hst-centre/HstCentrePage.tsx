import { useEffect, useState } from 'react';
import { useUiStore } from '../../app/store/uiStore';
import { HubCard } from '../../components/HubCard';
import { localIsoDate } from '@shared/domain/dates/localDate';

function todayIso(): string {
  return localIsoDate();
}

export function HstCentrePage() {
  const setView = useUiStore((s) => s.setView);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    window.api.reports.hstSummary({ periodStart: '2000-01-01', periodEnd: todayIso() }).then((r) => {
      if (r.ok) setPendingCount(r.data.manualReviewLines.filter((l) => l.manualHstCents === null).length);
    });
  }, []);

  return (
    <div className="w-full">
      <p className="mb-3 text-sm text-gray-500">Everything related to GST/HST tracking, remittance estimates, and mixed-supply purchases.</p>
      {pendingCount > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>{pendingCount} entr{pendingCount === 1 ? 'y' : 'ies'} saved with the Custom rate tax code and no HST amount. They are left out of HST totals until the HST from the receipt is typed in each entry's Tax Amt box.</span>
          <button type="button" onClick={() => setView({ kind: 'journalList' })} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-300 hover:bg-amber-100">Open journal entries</button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <HubCard
          tone="sky"
          title="GST/HST Payable"
          description="Monthly, quarterly, and annual collected vs. ITC, plus a by-account breakdown."
          onClick={() => setView({ kind: 'report', report: 'hstSummary' })}
        />
        <HubCard
          tone="emerald"
          title="GST/HST Reconciliation"
          description="Double-check HST figures against your Sales/Purchases/Expenses totals for the period."
          onClick={() => setView({ kind: 'report', report: 'hstReconciliation' })}
        />
        <HubCard
          tone="violet"
          title="File GST/HST Return"
          description="Review taxable income, GST/HST collected, GST/HST paid (ITCs) and the net return, then close the reporting period."
          onClick={() => setView({ kind: 'report', report: 'hstFiling' })}
        />
        <HubCard
          tone="cyan"
          title="GST/HST Quick Method"
          description="Estimate CRA Quick Method remittance — a flat rate on tax-included sales instead of tracking input tax credits."
          onClick={() => setView({ kind: 'report', report: 'hstQuickMethod' })}
        />
        <HubCard
          tone="teal"
          title="Sales Tax Detail"
          description="Transaction-level GST/HST detail supporting the return and reconciliation."
          onClick={() => setView({ kind: 'report', report: 'salesTaxDetail' })}
        />
        <HubCard
          tone="sky"
          title="Sales Tax by Province"
          description="All of Canada on one sheet: GST/HST for the CRA and PST, RST or QST for each province, with the provincial returns down to the transaction."
          onClick={() => setView({ kind: 'report', report: 'salesTaxByProvince' })}
        />
      </div>
    </div>
  );
}
