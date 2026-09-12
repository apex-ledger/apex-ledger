import { useEffect, useState } from 'react';
import { WebOrganisationSection, webContext } from './WebOrganisationSection';
import { WebFeedbackSection } from './WebFeedbackSection';
import { useUiStore } from '../../app/store/uiStore';

/** Administration, on the web only: one clean page for the platform administrator (every firm,
 * seats, company files, trial requests) and for a firm's owner (their own people and files).
 * The same controls also sit at the bottom of Settings; this page is the front door. */
interface Org { id: number; name: string; seats: number; isPlatform: boolean; activeSeats: number }
interface Trial { status: 'new' | 'done' }

export function WebAdminPage() {
  const ctx = webContext();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [newTrials, setNewTrials] = useState<number | null>(null);
  const [paused, setPaused] = useState<boolean | null>(null);
  async function setPause(next: boolean) {
    if (next && !window.confirm('Pause sign-in for every firm? Their people are signed out now and cannot sign in until you resume. You stay signed in.')) return;
    const r = (await (await fetch('/api/admin/signin-pause', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paused: next }) })).json()) as { ok: boolean; data?: { paused: boolean } };
    if (r.ok && r.data) setPaused(r.data.paused);
  }

  useEffect(() => {
    if (!ctx) return;
    void fetch('/api/admin/orgs', { credentials: 'same-origin' }).then((r) => r.json()).then((b: { ok: boolean; data?: Org[] }) => { if (b.ok && b.data) setOrgs(b.data); }).catch(() => undefined);
    if (ctx.org.isPlatform) void fetch('/api/admin/signin-pause', { credentials: 'same-origin' }).then((r) => r.json()).then((b: { ok: boolean; data?: { paused: boolean } }) => { if (b.ok && b.data) setPaused(b.data.paused); }).catch(() => undefined);
    if (ctx.org.isPlatform) void fetch('/api/admin/trial-requests', { credentials: 'same-origin' }).then((r) => r.json()).then((b: { ok: boolean; data?: Trial[] }) => { if (b.ok && b.data) setNewTrials(b.data.filter((t) => t.status === 'new').length); }).catch(() => undefined);
  }, [ctx]);

  if (!ctx) return <div className="p-6 text-sm text-gray-600">Administration is part of the web version.</div>;
  const firms = orgs.filter((o) => !o.isPlatform);
  const seats = firms.reduce((n, o) => n + o.seats, 0);
  const used = firms.reduce((n, o) => n + o.activeSeats, 0);

  return (
    <div className="w-full p-4" data-testid="web-admin-page">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-brand-900">Administration</h1>
          <p className="mt-1 text-sm text-gray-600">
            {ctx.org.isPlatform ? 'Every firm on Apex Ledger: organisations, seats, company files and trial requests from the website.' : `${ctx.org.name}: your people, seats and company files.`}
          </p>
        </div>
        <div className="text-xs text-gray-500">Signed in as {ctx.user.name} · {ctx.user.email}</div>
      </div>
      {ctx.org.isPlatform && paused !== null && (
        <div className={`mb-4 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm ${paused ? 'border-rose-300 bg-rose-50 text-rose-900' : 'border-gray-200 bg-white text-gray-700'}`} data-testid="signin-pause">
          <span className="font-semibold">{paused ? 'Sign-in is paused for every firm.' : 'Sign-in is open for every firm.'}</span>
          <span className="text-xs">{paused ? 'Their people see "Sign-in is paused for a short time" and cannot get in. You can.' : 'Pause it if you need to stop everyone while something is checked.'}</span>
          <button type="button" onClick={() => void setPause(!paused)} className={`ml-auto rounded-full px-3 py-1 text-xs font-medium text-white ${paused ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-rose-700 hover:bg-rose-800'}`}>{paused ? 'Resume sign-in' : 'Pause sign-in for firms'}</button>
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-brand-50 p-4"><div className="text-xs font-semibold uppercase tracking-wide text-brand-700">{ctx.org.isPlatform ? 'Firms' : 'Organisation'}</div><div className="mt-1 text-2xl font-semibold text-brand-900">{ctx.org.isPlatform ? firms.length : ctx.org.name}</div></div>
        <div className="rounded-lg bg-emerald-50 p-4"><div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Seats in use</div><div className="mt-1 text-2xl font-semibold text-emerald-900">{used} <span className="text-base font-normal text-emerald-700">of {seats}</span></div></div>
        {ctx.org.isPlatform ? (
          <div className={`rounded-lg p-4 ${newTrials ? 'bg-gold-100' : 'bg-gray-50'}`}><div className="text-xs font-semibold uppercase tracking-wide text-gray-700">New trial requests</div><div className="mt-1 text-2xl font-semibold text-gray-900">{newTrials ?? '…'}</div></div>
        ) : (
          <div className="rounded-lg bg-gray-50 p-4"><div className="text-xs font-semibold uppercase tracking-wide text-gray-700">Company files</div><div className="mt-1 text-sm text-gray-700">No limit. Upload or download below.</div></div>
        )}
      </div>

      {ctx.org.isPlatform && <SubscriptionsLink />}
      <WebFeedbackSection />
      <WebOrganisationSection />
    </div>
  );
}

function SubscriptionsLink() {
  const setView = useUiStore((s) => s.setView);
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm">
      <div><span className="font-semibold text-brand-900">Subscriptions</span><span className="ml-2 text-gray-700">Billing, payments received, owing and each subscriber's details, on a page of their own.</span></div>
      <button type="button" onClick={() => setView({ kind: 'webSubscriptions' })} className="rounded-full bg-brand-700 px-3 py-1 text-xs font-medium text-white hover:bg-brand-800">Open Subscriptions</button>
    </div>
  );
}
