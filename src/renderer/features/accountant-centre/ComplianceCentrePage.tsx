import { HubCard } from '../../components/HubCard';
import { useUiStore } from '../../app/store/uiStore';
import { FormsPage } from '../forms/FormsPage';

const CORE_CONTROLS = [
  {
    title: 'Before accepting or continuing work',
    items: ['Signed engagement letter and precise scope', 'Acceptance, continuance and conflict review', 'Privacy and technology consent'],
  },
  {
    title: 'When the service applies',
    items: ['CRA representative authorization', 'Compilation management acknowledgement', 'FINTRAC applicability screen before any KYC workflow'],
  },
  {
    title: 'Firm-level review',
    items: ['Provincial licence and firm registration', 'Professional liability insurance', 'CPD, practice inspection and quality-management dates'],
  },
];

export function ComplianceCentrePage() {
  const setView = useUiStore((s) => s.setView);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
        <div className="text-xs font-bold uppercase tracking-wider text-rose-700">High priority</div>
        <h2 className="mt-1 text-lg font-semibold text-rose-950">Compliance must be reviewed before work starts</h2>
        <p className="mt-1 text-sm text-rose-900">
          Use only the requirements that apply to the province, professional status, engagement and services. Resolve conflicts, missing consent, licensing issues and overdue filings before continuing.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <HubCard
          tone="rose"
          title="Client Deadlines & Alerts"
          description="Review overdue and upcoming client filings, missing documents and reminders."
          onClick={() => setView({ kind: 'clientHub' })}
        />
        <HubCard
          tone="amber"
          title="Compliance Calendar"
          description="See filing and year-end dates across clients in one calendar."
          onClick={() => setView({ kind: 'calendar' })}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {CORE_CONTROLS.map((group) => (
          <section key={group.title} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
            <h3 className="font-semibold text-gray-900">{group.title}</h3>
            <ul className="mt-2 space-y-2 text-sm text-gray-600">
              {group.items.map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden="true" className="mt-0.5 text-brand-600">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
        <strong>FINTRAC is conditional.</strong> Bookkeeping, audit, review, compilation, advice and professional fees do not by themselves trigger the accountant obligations. Complete the KYC sections only after the applicability screen identifies a covered activity.
      </div>

      <section className="border-t border-gray-200 pt-5">
        <div className="mb-3">
          <h2 className="font-semibold text-gray-900">Essential compliance forms</h2>
          <p className="text-sm text-gray-500">Select a client, prepare the forms that apply, and retain the signed evidence with the engagement file.</p>
        </div>
        <FormsPage mode="compliance" embedded />
      </section>
    </div>
  );
}
