import { useEffect, useState } from 'react';
import { WebOrganisationSection, webContext } from './WebOrganisationSection';
import { WebFeedbackSection } from './WebFeedbackSection';

/** Administration, on the web only: one clean page for the platform administrator (every firm,
 * seats, company files, trial requests) and for a firm's owner (their own people and files).
 * The same controls also sit at the bottom of Settings; this page is the front door. */
interface Org { id: number; name: string; seats: number; isPlatform: boolean; activeSeats: number }
interface Trial { status: 'new' | 'done' }

export function WebAdminPage() {
  const ctx = webContext();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [newTrials, setNewTrials] = useState<number | null>(null);

  useEffect(() => {
    if (!ctx) return;
    void fetch('/api/admin/orgs', { credentials: 'same-origin' }).then((r) => r.json()).then((b: { ok: boolean; data?: Org[] }) => { if (b.ok && b.data) setOrgs(b.data); }).catch(() => undefined);
    if (ctx.org.isPlatform) void fetch('/api/admin/trial-requests', { credentials: 'same-origin' }).then((r) => r.json()).then((b: { ok: boolean; data?: Trial[] }) => { if (b.ok && b.data) setNewTrials(b.data.filter((t) => t.status === 'new').length); }).catch(() => undefined);
  }, [ctx]);

  if (!ctx) return <div className="p-6 text-sm text-gray-600">Administration is part of the web version.</div>;
  const firms = orgs.filter((o) => !o.isPlatform);
  const seats = firms.reduce((n, o) => n + o.seats, 0);
  const used = firms.reduce((n, o) => n + o.activeSeats, 0);

  return (
    <div className="mx-auto max-w-6xl p-4" data-testid="web-admin-page">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-brand-900">Administration</h1>
          <p className="mt-1 text-sm text-gray-600">
            {ctx.org.isPlatform ? 'Every firm on Apex Ledger: organisations, seats, company files and trial requests from the website.' : `${ctx.org.name}: your people, seats and company files.`}
          </p>
        </div>
        <div className="text-xs text-gray-500">Signed in as {ctx.user.name} · {ctx.user.email}</div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-brand-50 p-4"><div className="text-xs font-semibold uppercase tracking-wide text-brand-700">{ctx.org.isPlatform ? 'Firms' : 'Organisation'}</div><div className="mt-1 text-2xl font-semibold text-brand-900">{ctx.org.isPlatform ? firms.length : ctx.org.name}</div></div>
        <div className="rounded-lg bg-emerald-50 p-4"><div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Seats in use</div><div className="mt-1 text-2xl font-semibold text-emerald-900">{used} <span className="text-base font-normal text-emerald-700">of {seats}</span></div></div>
        {ctx.org.isPlatform ? (
          <div className={`rounded-lg p-4 ${newTrials ? 'bg-gold-100' : 'bg-gray-50'}`}><div className="text-xs font-semibold uppercase tracking-wide text-gray-700">New trial requests</div><div className="mt-1 text-2xl font-semibold text-gray-900">{newTrials ?? '…'}</div></div>
        ) : (
          <div className="rounded-lg bg-gray-50 p-4"><div className="text-xs font-semibold uppercase tracking-wide text-gray-700">Company files</div><div className="mt-1 text-sm text-gray-700">No limit. Upload or download below.</div></div>
        )}
      </div>

      <WebFeedbackSection />
      <WebOrganisationSection />
    </div>
  );
}
