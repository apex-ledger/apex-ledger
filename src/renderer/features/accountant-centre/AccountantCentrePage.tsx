import { useState } from 'react';
import { useUiStore } from '../../app/store/uiStore';
import { HubCard } from '../../components/HubCard';
import { SegmentedControl } from '../../components/SegmentedControl';
import { WorkpapersPage } from '../workpapers/WorkpapersPage';
import { AuditEngagementPage } from '../workpapers/AuditEngagementPage';
import { CpaReviewPage } from '../cpa-review/CpaReviewPage';
import { ComplianceCentrePage } from './ComplianceCentrePage';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { craHstAccountNumber } from '@shared/domain/company/craAccountNumber';

type CentreTab = 'compliance' | 'auditFile' | 'workpapers' | 'cpaReview';

const TABS: { id: CentreTab; label: string; blurb: string }[] = [
  { id: 'compliance', label: 'Compliance', blurb: 'Important client, firm, filing and professional compliance controls' },
  { id: 'auditFile', label: 'Audit File', blurb: 'Indexed engagement documents, materiality, review notes, sign-offs and final lockdown' },
  { id: 'workpapers', label: 'Workpapers', blurb: 'Working trial balance, prior year, changes, sign-off and attachments' },
  { id: 'cpaReview', label: 'CPA Review', blurb: 'Reviewer notes, review package and standard letters' },
];

/** Accounting is the control centre for the books. Core ledger destinations stay visible here even
 * though the left rail is intentionally short. This prevents the 0.1.232 regression where the
 * screens existed but an accountant could no longer discover them from Accounting. */
export function AccountantCentrePage() {
  const setView = useUiStore((s) => s.setView);
  const requestedTab = useUiStore((s) => (s.view.kind === 'accountantCentre' ? s.view.tab : undefined));
  const [tab, setTab] = useState<CentreTab>(requestedTab ?? 'compliance');
  const active = TABS.find((t) => t.id === tab)!;
  const { data: company } = useIpcQuery(() => window.api.company.get(), []);
  const missingHstAccount = company !== undefined && !craHstAccountNumber(company.hstNumber, company.businessNumber);

  return (
    <div className="space-y-3">
      {missingHstAccount && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <div>
            <strong>GST/HST account number missing.</strong> Add the complete CRA RT program account before preparing or filing a sales tax return.
          </div>
          <button type="button" onClick={() => setView({ kind: 'companySettings' })} className="font-semibold text-amber-900 underline">
            Open Company Settings
          </button>
        </div>
      )}
      <section>
        <div className="mb-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-lg font-semibold text-gray-900">Accountant Centre</h1>
            <p className="text-sm text-gray-500">Compliance, journals and year-end review tools in one place. Chart of Accounts remains directly available from the sidebar.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <HubCard tone="amber" title="Reclassify Transactions" description="Move posted amounts from one account to another in bulk — each line gets its own adjusting entry on the original date." onClick={() => setView({ kind: 'reclassify' })} />
          <HubCard tone="emerald" title="Journal Entries" description="Review posted journals or enter an adjusting/general journal entry." onClick={() => setView({ kind: 'journalList' })} />
        </div>
      </section>

      <section className="border-t border-gray-200 pt-5">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">Professional workspace</h2>
            <p className="text-sm text-gray-500">Compliance is placed first; workpapers and CPA review remain available here.</p>
          </div>
          <div className="ml-auto">
            <SegmentedControl value={tab} onChange={setTab} options={TABS.map((t) => ({ value: t.id, label: t.label, title: t.blurb }))} />
          </div>
        </div>
        <p className="mb-3 text-xs text-gray-400">{active.blurb}</p>
        <div key={tab} className="animate-viewIn">
          {tab === 'compliance' && <ComplianceCentrePage />}
          {tab === 'auditFile' && <AuditEngagementPage />}
          {tab === 'workpapers' && <WorkpapersPage />}
          {tab === 'cpaReview' && <CpaReviewPage />}
        </div>
      </section>
    </div>
  );
}
