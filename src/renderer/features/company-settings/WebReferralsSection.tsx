import { useCallback, useEffect, useState } from 'react';

/** Administration → Clients & referrals, on the web.
 *
 * A CPA firm owner gets the firm's referral link to send to businesses (copy it, or email it from
 * here), sees the businesses paying for their own subscription through the firm and the monthly
 * credit that earns, and can move a client whose books the firm keeps onto its own subscription.
 * A business linked to a firm sees which firm can open its books and can end that link. */
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
interface ReferralClient { clientOrgId: number; name: string; since: string; endedOn: string | null; status: 'trial' | 'active' | 'paused' | 'cancelled' | null; firstChargeDate: string | null }
interface ReferralInfo {
  referralCode: string;
  referralLink: string | null;
  creditPerClientCents: number;
  clientSeatCents: number;
  businessSeatCents: number;
  earningNowCents: number;
  clients: ReferralClient[];
  linkedFirm: { firmOrgId: number; name: string; since: string } | null;
  requests?: { id: number; business: string; contact: string; requestedOn: string; status: 'new' | 'done' }[];
}
interface CompanyFile { name: string }

async function call<T>(url: string, body?: unknown): Promise<Result<T>> {
  try {
    const res = await fetch(url, body === undefined ? { credentials: 'same-origin' } : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return (await res.json()) as Result<T>;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const money = (cents: number) => `$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const STATUS: Record<string, string> = { trial: 'Free month', active: 'Paying', paused: 'Paused', cancelled: 'Cancelled' };
const field = 'rounded border border-gray-300 px-2 py-1 text-sm';

export function WebReferralsSection({ orgId, files, onChanged }: { orgId: number; files: CompanyFile[]; onChanged?: () => void }) {
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [invite, setInvite] = useState({ to: '', contactName: '', businessName: '', note: '' });
  const [sending, setSending] = useState(false);
  const [move, setMove] = useState({ companyFile: '', businessName: '', billingEmail: '', personName: '', personEmail: '', password: '' });
  const [showMove, setShowMove] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    const r = await call<ReferralInfo>(`/api/org/referral?org=${orgId}`);
    if (r.ok) { setInfo(r.data); setError(null); } else setError(r.error);
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);

  if (!info) return error ? <div className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null;

  async function copyLink() {
    if (!info?.referralLink) return;
    try {
      await navigator.clipboard.writeText(info.referralLink);
      setNotice('Referral link copied. Paste it into an email, text or WhatsApp to the business.');
    } catch {
      setNotice(`Copy this link: ${info.referralLink}`);
    }
  }

  async function sendInvite() {
    setSending(true); setError(null); setNotice(null);
    const r = await call<{ to: string }>(`/api/org/referral/invite?org=${orgId}`, invite);
    setSending(false);
    if (!r.ok) { setError(r.error); return; }
    setNotice(`Invitation sent to ${r.data.to}. Replies come to you.`);
    setInvite({ to: '', contactName: '', businessName: '', note: '' });
  }

  async function moveClient() {
    setError(null); setNotice(null);
    const r = await call<{ org: { name: string }; user: { email: string } }>(`/api/org/clients?org=${orgId}`, move);
    if (!r.ok) { setError(r.error); return; }
    setNotice(`${r.data.org.name} now pays for its own subscription. ${r.data.user.email} signs in with the password you typed, and your firm keeps working in their books.`);
    setMove({ companyFile: '', businessName: '', billingEmail: '', personName: '', personEmail: '', password: '' });
    setShowMove(false);
    void load();
    onChanged?.();
  }

  async function endLink(clientOrgId: number, name: string, asBusiness: boolean) {
    const question = asBusiness
      ? `End the link with ${name}? They will no longer be able to open your books. You keep your books and your subscription.`
      : `End the link with ${name}? Your firm will no longer open their books and the monthly credit stops. They keep their books and subscription.`;
    if (!window.confirm(question)) return;
    const r = await call(`/api/org/referral/end`, { clientOrgId });
    if (!r.ok) setError(r.error); else { setNotice(asBusiness ? `${name} can no longer open your books.` : `The link with ${name} has ended.`); void load(); onChanged?.(); }
  }

  const current = info.clients.filter((c) => !c.endedOn);
  const past = info.clients.filter((c) => c.endedOn);

  return (
    <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3" data-testid="web-referrals">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Clients &amp; referrals</div>
      {error && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {notice && <div className="mt-2 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>}

      {info.linkedFirm ? (
        <div className="mt-2 rounded border border-brand-200 bg-white p-3 text-sm">
          <b>{info.linkedFirm.name}</b> is your accounting firm on Apex Ledger since {info.linkedFirm.since}. Their people can open your company files.
          <button type="button" onClick={() => void endLink(orgId, info.linkedFirm!.name, true)} className="ml-2 text-xs text-red-700 hover:underline">End the link</button>
        </div>
      ) : (
        <>
          <p className="mt-1 text-xs text-gray-600">
            Two ways to bring a client in. <b>Your firm pays:</b> add them under Add a person as a client seat, {money(info.clientSeatCents)} a month, limited to their own company.
            {' '}<b>The client pays:</b> they have their own subscription, and your firm earns {money(info.creditPerClientCents)} off its bill every month they pay, for as long as they stay linked to you.
          </p>

          <div className="mt-3 rounded border border-gray-200 bg-white p-3">
            <div className="text-sm font-medium text-gray-900">Your referral link</div>
            <p className="text-xs text-gray-600">Send it to a business. When they start their trial from it, they are linked to your firm.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input readOnly value={info.referralLink ?? ''} onFocus={(e) => e.currentTarget.select()} aria-label="Referral link" className={`${field} w-full max-w-md bg-gray-50 font-mono text-xs`} />
              <button type="button" onClick={() => void copyLink()} className="rounded-full bg-brand-700 px-3 py-1 text-xs font-medium text-white hover:bg-brand-800">Copy link</button>
            </div>
            <div className="mt-3 text-xs font-semibold text-gray-700">Email it to a business</div>
            <div className="mt-1 grid gap-2 sm:grid-cols-3">
              <input type="email" value={invite.to} onChange={(e) => setInvite({ ...invite, to: e.target.value })} placeholder="Business email" className={field} />
              <input value={invite.contactName} onChange={(e) => setInvite({ ...invite, contactName: e.target.value })} placeholder="Contact name (optional)" className={field} />
              <input value={invite.businessName} onChange={(e) => setInvite({ ...invite, businessName: e.target.value })} placeholder="Business name (optional)" className={field} />
            </div>
            <textarea value={invite.note} onChange={(e) => setInvite({ ...invite, note: e.target.value })} rows={2} placeholder="Your own words (optional). The link and how the connection works are added for you." className={`${field} mt-2 w-full`} />
            <button type="button" onClick={() => void sendInvite()} disabled={sending || !invite.to.trim()} className="mt-2 rounded-full bg-brand-700 px-3 py-1 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50">{sending ? 'Sending…' : 'Send invitation'}</button>
            <div className="mt-3 text-xs font-semibold text-gray-700">Requests from your link</div>
            <ul className="mt-1 divide-y divide-gray-100 text-sm" data-testid="referral-requests">
              {(info.requests ?? []).map((q) => (
                <li key={q.id} className="flex flex-wrap items-center gap-x-3 py-1">
                  <span className="min-w-[12rem] text-gray-900">{q.business}</span>
                  <span className="text-xs text-gray-500">{q.contact} · asked {q.requestedOn}</span>
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] ${q.status === 'done' ? 'bg-emerald-100 text-emerald-800' : 'bg-gold-100 text-gold-800'}`}>{q.status === 'done' ? 'Set up' : 'Being set up'}</span>
                </li>
              ))}
              {(info.requests ?? []).length === 0 && <li className="py-1 text-xs text-gray-400">No requests yet. They appear here as soon as a business asks for a trial through your link.</li>}
            </ul>
          </div>

          <div className="mt-3 rounded border border-gray-200 bg-white p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-sm font-medium text-gray-900">Clients paying for themselves</div>
              <div className="text-xs text-emerald-800">Earning {money(info.earningNowCents)} this month</div>
            </div>
            <ul className="mt-1 divide-y divide-gray-100 text-sm">
              {current.map((c) => (
                <li key={c.clientOrgId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1">
                  <span className="min-w-[12rem] text-gray-900">{c.name}</span>
                  <span className="text-xs text-gray-500">linked {c.since} · {c.status ? STATUS[c.status] : ''}{c.status === 'trial' && c.firstChargeDate ? `, credit from ${c.firstChargeDate}` : c.status === 'active' ? `, ${money(info.creditPerClientCents)}/mo credit` : ''}</span>
                  <button type="button" onClick={() => void endLink(c.clientOrgId, c.name, false)} className="ml-auto text-xs text-gray-600 hover:underline">End link</button>
                </li>
              ))}
              {current.length === 0 && <li className="py-1 text-xs text-gray-400">None yet. Send your referral link, or move a client below.</li>}
            </ul>
            {past.length > 0 && <div className="mt-1 text-xs text-gray-500">Earlier: {past.map((c) => `${c.name} (until ${c.endedOn})`).join(', ')}</div>}

            <button type="button" onClick={() => setShowMove(!showMove)} className="mt-2 text-xs font-medium text-brand-700 hover:underline">{showMove ? 'Close' : 'Move a client to their own subscription'}</button>
            {showMove && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="text-xs text-gray-700">Their company file
                  <select value={move.companyFile} onChange={(e) => setMove({ ...move, companyFile: e.target.value, businessName: move.businessName || e.target.value.replace(/\.company$/i, '') })} className={`${field} mt-0.5 block w-full`}>
                    <option value="">Choose…</option>
                    {files.map((f) => <option key={f.name} value={f.name}>{f.name.replace(/\.company$/i, '')}</option>)}
                  </select>
                </label>
                <label className="text-xs text-gray-700">Business name<input value={move.businessName} onChange={(e) => setMove({ ...move, businessName: e.target.value })} className={`${field} mt-0.5 block w-full`} /></label>
                <label className="text-xs text-gray-700">Owner's name<input value={move.personName} onChange={(e) => setMove({ ...move, personName: e.target.value })} className={`${field} mt-0.5 block w-full`} /></label>
                <label className="text-xs text-gray-700">Owner's email (their sign-in)<input type="email" value={move.personEmail} onChange={(e) => setMove({ ...move, personEmail: e.target.value })} className={`${field} mt-0.5 block w-full`} /></label>
                <label className="text-xs text-gray-700">First password (8+)<input type="password" autoComplete="new-password" value={move.password} onChange={(e) => setMove({ ...move, password: e.target.value })} className={`${field} mt-0.5 block w-full`} /></label>
                <label className="text-xs text-gray-700">Billing email (if different)<input type="email" value={move.billingEmail} onChange={(e) => setMove({ ...move, billingEmail: e.target.value })} className={`${field} mt-0.5 block w-full`} /></label>
                <p className="text-[11px] text-gray-500 sm:col-span-2">The company file moves into the business's own subscription ({money(info.businessSeatCents)} a month for their Business seat, first month free). Your firm keeps working in it through the link and earns {money(info.creditPerClientCents)} a month once they pay. The file must not be open while it moves.</p>
                <button type="button" onClick={() => void moveClient()} disabled={!move.companyFile || !move.personEmail || move.password.length < 8} className="w-fit rounded-full bg-brand-700 px-3 py-1 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50">Set up their subscription</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
