import { useUiStore } from '../../app/store/uiStore';
import { HubCard } from '../../components/HubCard';

/** Exposes the tax/GIFI screens that already exist. We do not label unimplemented T2 schedules as
 * finished features; this centre links only to working destinations. */
export function TaxGifiCentrePage() {
  const setView = useUiStore((s) => s.setView);
  return (
    <div className="space-y-3">
      <div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg font-semibold text-gray-900">Tax &amp; GIFI</h1>
          <p className="text-sm text-gray-500">CRA-oriented mappings, tax schedules and accountant-ready reports available in this build.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <HubCard tone="rose" title="GIFI Export" description="Map account balances to CRA GIFI codes for corporate filing work." onClick={() => setView({ kind: 'report', report: 'gifiExport' })} />
        <HubCard tone="emerald" title="CCA Schedule" description="Capital cost allowance roll-forward by class for tax working papers." onClick={() => setView({ kind: 'report', report: 'ccaSchedule' })} />
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Corporate T2 Schedule 100/125 electronic-form generation and Schedule 141 are not complete screens in this source yet. The accounting/GIFI data needed for them is exposed above; they remain release work rather than being presented as finished.
      </div>
    </div>
  );
}
