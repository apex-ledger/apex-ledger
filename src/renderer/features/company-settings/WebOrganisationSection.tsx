import { useCallback, useEffect, useRef, useState } from 'react';

/** Settings → Organisation & seats, on the web only.
 *
 * An organisation owner sees their people and seats and can add someone, deactivate or reactivate
 * them, and reset a password. The platform administrator sees every organisation, creates new
 * ones, and changes seat counts. Everyone can change their own password. The desktop app has no
 * organisations, so this section does not appear there. */
interface Org { id: number; name: string; slug: string; seats: number; isPlatform: boolean; activeSeats: number; discountPct: number; discountUntil: string | null }
interface Founding { pct: number; months: number; maxFirms: number; signUpBy: string; used: number }
type SeatType = 'business' | 'payroll' | 'bookkeeper' | 'full';
const SEAT_TYPES: SeatType[] = ['business', 'payroll', 'bookkeeper', 'full'];
const SEAT_LABEL: Record<SeatType, string> = { business: 'Business', payroll: 'Payroll Unlimited', bookkeeper: 'Bookkeeper', full: 'Full accountant' };
const SEAT_HINT: Record<SeatType, string> = { business: 'A business keeping its own books: invoices, bills, bank import, HST and reports', payroll: 'Payroll Unlimited: payroll only, no limit on employees: pay runs, stubs, PD7A, ROE, T4s', bookkeeper: 'A bookkeeper: daily books, bank import, invoices, bills, HST and payroll; no accountant tools', full: 'An accountant: everything, including year end, GIFI, T2 working papers, CRM and payroll' };
interface Person { id: number; orgId: number; email: string; name: string; role: 'owner' | 'member'; seatType: SeatType; isActive: boolean; agreedAt: string | null; agreedName: string | null; lastSignIn: string | null }
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
interface CompanyFile { name: string; bytes: number; modified: string; open: boolean }
interface TrialRequest { id: number; firm: string; name: string; email: string; phone: string; edition: string; seats: number; message: string; status: 'new' | 'done'; createdAt: string }

async function call<T>(url: string, body?: unknown): Promise<Result<T>> {
  try {
    const res = await fetch(url, body === undefined ? { credentials: 'same-origin' } : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return (await res.json()) as Result<T>;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function webContext(): { user: { name: string; email: string; role: string }; org: { name: string; seats: number; isPlatform: boolean } } | null {
  return (window as unknown as { __apexWeb?: { user: { name: string; email: string; role: string }; org: { name: string; seats: number; isPlatform: boolean } } }).__apexWeb ?? null;
}

export function WebOrganisationSection() {
  const ctx = webContext();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newPerson, setNewPerson] = useState({ orgId: 0, name: '', email: '', password: '', role: 'member' as 'member' | 'owner', seatType: 'full' as SeatType });
  const [rates, setRates] = useState<Record<SeatType, number>>({ business: 3900, payroll: 4500, bookkeeper: 5900, full: 7900 });
  const [rateDraft, setRateDraft] = useState<Record<SeatType, string>>({ business: '', payroll: '', bookkeeper: '', full: '' });
  const money = (cents: number) => `$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const monthlyFor = (orgId: number) => people.filter((p) => p.orgId === orgId && p.isActive).reduce((n, p) => n + (rates[p.seatType] ?? 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const discountActive = (o: Org) => o.discountPct > 0 && !!o.discountUntil && o.discountUntil >= today;
  const billingLine = (o: Org) => { const full = monthlyFor(o.id); if (!o.activeSeats) return ''; if (!discountActive(o)) return ` · ${money(full)} a month`; return ` · ${money(Math.round(full * (100 - o.discountPct) / 100))} a month (founding ${o.discountPct}% off until ${o.discountUntil}, then ${money(full)})`; };
  const [newOrg, setNewOrg] = useState({ name: '', seats: 2, founding: true });
  const [founding, setFounding] = useState<Founding | null>(null);
  const [myPassword, setMyPassword] = useState('');
  const [trials, setTrials] = useState<TrialRequest[]>([]);
  const [showDoneTrials, setShowDoneTrials] = useState(false);
  const [files, setFiles] = useState<CompanyFile[]>([]);
  const [filesOrg, setFilesOrg] = useState(0);
  const [replace, setReplace] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const canManage = !!ctx && (ctx.org.isPlatform || ctx.user.role === 'owner');

  const reloadFiles = useCallback(async (orgId: number) => {
    if (!canManage || !orgId) return;
    const r = await call<CompanyFile[]>(`/api/org/companies?org=${orgId}`);
    if (r.ok) setFiles(r.data); else setError(r.error);
  }, [canManage]);
  useEffect(() => { void reloadFiles(filesOrg); }, [filesOrg, reloadFiles]);

  const reload = useCallback(async () => {
    if (!canManage) return;
    const [o, p] = await Promise.all([call<Org[]>('/api/admin/orgs'), call<Person[]>('/api/admin/users')]);
    if (o.ok) setOrgs(o.data); else setError(o.error);
    if (p.ok) setPeople(p.data); else setError(p.error);
    if (ctx?.org.isPlatform) { const t = await call<TrialRequest[]>('/api/admin/trial-requests'); if (t.ok) setTrials(t.data); }
    const r = await call<Record<SeatType, number>>('/api/admin/seat-rates'); if (r.ok) setRates(r.data);
    const f = await call<Founding>('/api/admin/founding'); if (f.ok) setFounding(f.data);
  }, [canManage, ctx?.org.isPlatform]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { if (orgs.length && !newPerson.orgId) setNewPerson((n) => ({ ...n, orgId: orgs.find((o) => !o.isPlatform)?.id ?? orgs[0].id })); }, [orgs, newPerson.orgId]);
  useEffect(() => { if (orgs.length && !filesOrg) setFilesOrg(ctx?.org.isPlatform ? (orgs.find((o) => !o.isPlatform)?.id ?? orgs[0].id) : (orgs.find((o) => o.name === ctx?.org.name)?.id ?? orgs[0].id)); }, [orgs, filesOrg, ctx]);

  if (!ctx) return null;

  async function addPerson() {
    setError(null); setNotice(null);
    const r = await call<Person>('/api/admin/users', newPerson);
    if (!r.ok) { setError(r.error); return; }
    setNotice(`${r.data.name} added. Give them the password you typed; they can change it after signing in.`);
    setNewPerson((n) => ({ ...n, name: '', email: '', password: '' }));
    void reload();
  }
  async function setFoundingOn(o: Org, on: boolean) {
    setError(null);
    const r = await call<Org>(`/api/admin/orgs/${o.id}/founding`, { on });
    if (!r.ok) setError(r.error); else { setNotice(on ? `${o.name} has the founding offer until ${r.data.discountUntil}.` : `${o.name} is on normal rates.`); void reload(); }
  }
  async function setSeatType(p: Person, seatType: SeatType) {
    setError(null);
    const r = await call<Person>(`/api/admin/users/${p.id}/seat-type`, { seatType });
    if (!r.ok) setError(r.error); else void reload();
  }
  async function saveRate(type: SeatType) {
    const dollars = Number(rateDraft[type]);
    if (!Number.isFinite(dollars)) return;
    const r = await call<Record<SeatType, number>>('/api/admin/seat-rates', { seatType: type, dollars });
    if (!r.ok) setError(r.error); else { setRates(r.data); setRateDraft((d) => ({ ...d, [type]: '' })); setNotice(`${SEAT_LABEL[type]} seat is now ${money(r.data[type])} a month.`); }
  }
  async function setActive(p: Person, active: boolean) {
    setError(null);
    const r = await call<Person>(`/api/admin/users/${p.id}/active`, { active });
    if (!r.ok) setError(r.error); else void reload();
  }
  async function resetPassword(p: Person) {
    const password = window.prompt(`New password for ${p.name} (at least 8 characters):`);
    if (!password) return;
    const r = await call<boolean>(`/api/admin/users/${p.id}/password`, { password });
    if (!r.ok) setError(r.error); else setNotice(`Password changed for ${p.name}.`);
  }
  async function addOrg() {
    setError(null);
    const r = await call<Org>('/api/admin/orgs', newOrg);
    if (!r.ok) { setError(r.error); return; }
    setNotice(`${r.data.name} created with ${r.data.seats} seats${r.data.discountUntil ? `, founding offer until ${r.data.discountUntil}` : ''}.`);
    setNewOrg({ name: '', seats: 2, founding: true });
    void reload();
  }
  async function setSeats(o: Org, seats: number) {
    const r = await call<Org>(`/api/admin/orgs/${o.id}/seats`, { seats });
    if (!r.ok) setError(r.error); else void reload();
  }
  async function uploadCompany(file: File) {
    setError(null); setNotice(null); setUploading(true);
    try {
      const res = await fetch(`/api/org/companies?org=${filesOrg}${replace ? '&replace=1' : ''}`, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) }, body: file });
      const r = (await res.json()) as Result<{ name: string; org: string }>;
      if (!r.ok) setError(r.error); else { setNotice(`${r.data.name} is now in ${r.data.org}. It appears under Open Company.`); void reloadFiles(filesOrg); }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }
  const sizeOf = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

  async function setTrialStatus(t: TrialRequest, status: 'new' | 'done') {
    const r = await call<TrialRequest>(`/api/admin/trial-requests/${t.id}/status`, { status });
    if (!r.ok) setError(r.error); else void reload();
  }
  function fillFromTrial(t: TrialRequest) {
    setNewOrg({ name: t.firm, seats: t.seats, founding: true });
    setNewPerson((n) => ({ ...n, name: t.name, email: t.email }));
    setNotice(`${t.firm} is filled in below: create the organisation, then add ${t.name} to it with a first password and email it to ${t.email}.`);
  }

  async function changeMyPassword() {
    setError(null);
    const r = await call<boolean>('/api/me/password', { password: myPassword });
    if (!r.ok) setError(r.error); else { setNotice('Your password is changed.'); setMyPassword(''); }
  }

  const orgName = (id: number) => orgs.find((o) => o.id === id)?.name ?? '';
  const visibleOrgs = ctx.org.isPlatform ? orgs : orgs.filter((o) => !o.isPlatform);

  return (
    <section className="col-span-full mt-2 rounded border border-gray-200 bg-white p-3" data-testid="web-organisation">
      <h2 className="text-sm font-semibold text-gray-800">Organisation &amp; seats</h2>
      <p className="mt-1 text-xs text-gray-600">
        Signed in as <b>{ctx.user.name}</b> ({ctx.user.email}) in <b>{ctx.org.name}</b>. A seat is one person with their own sign-in; every entry they make carries their name.
      </p>
      {error && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {notice && <div className="mt-2 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>}

      <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Your password</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          <input type="password" autoComplete="new-password" value={myPassword} onChange={(e) => setMyPassword(e.target.value)} placeholder="New password, 8+ characters" className="w-64 rounded border border-gray-300 px-2 py-1" />
          <button type="button" onClick={() => void changeMyPassword()} disabled={myPassword.length < 8} className="rounded-full bg-brand-700 px-3 py-1 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50">Change</button>
        </div>
      </div>

      {canManage && (
        <>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {visibleOrgs.map((o) => (
              <div key={o.id} className="rounded border border-gray-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-gray-900">{o.name}</div>
                  <div className="text-xs text-gray-500">{o.activeSeats} of {o.seats} seats used{!o.isPlatform ? billingLine(o) : ''}</div>
                </div>
                {ctx.org.isPlatform && !o.isPlatform && (
                  <div className="mt-1 text-xs">
                    {discountActive(o)
                      ? <span className="rounded-full bg-gold-100 px-2 py-0.5 text-gold-800">Founding firm · {o.discountPct}% off until {o.discountUntil} <button type="button" onClick={() => void setFoundingOn(o, false)} className="ml-1 text-gray-500 hover:underline">remove</button></span>
                      : <button type="button" onClick={() => void setFoundingOn(o, true)} className="text-brand-700 hover:underline">Give founding offer ({founding?.pct ?? 50}% off for {founding?.months ?? 6} months)</button>}
                  </div>
                )}
                {ctx.org.isPlatform && (
                  <div className="mt-1 flex items-center gap-2 text-xs text-gray-600">
                    Seats
                    <input type="number" min={1} defaultValue={o.seats} onBlur={(e) => { const v = Number(e.target.value); if (v !== o.seats) void setSeats(o, v); }} className="w-16 rounded border border-gray-300 px-1 py-0.5" />
                  </div>
                )}
                <ul className="mt-2 divide-y divide-gray-100 text-sm">
                  {people.filter((p) => p.orgId === o.id).map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1">
                      <span className={`min-w-[8rem] ${p.isActive ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{p.name}</span>
                      <span className="text-xs text-gray-500">{p.email} · {p.role}{p.lastSignIn ? ` · last sign-in ${p.lastSignIn.slice(0, 16)}` : ''}{!o.isPlatform ? (p.agreedAt ? ` · agreed ${p.agreedAt.slice(0, 10)} signed ${p.agreedName ?? p.name}` : ' · agreement not yet accepted') : ''}</span>
                      {!o.isPlatform && (
                        <select value={p.seatType} onChange={(e) => void setSeatType(p, e.target.value as SeatType)} title={SEAT_HINT[p.seatType]} className="rounded border border-gray-300 bg-brand-50 px-1 py-0.5 text-[11px] text-brand-800">
                          {SEAT_TYPES.map((t) => <option key={t} value={t}>{SEAT_LABEL[t]} · {money(rates[t])}/mo</option>)}
                        </select>
                      )}
                      <span className="ml-auto flex gap-2 text-xs">
                        <button type="button" onClick={() => void resetPassword(p)} className="text-brand-700 hover:underline">Reset password</button>
                        {p.email !== ctx.user.email && <button type="button" onClick={() => void setActive(p, !p.isActive)} className="text-gray-600 hover:underline">{p.isActive ? 'Deactivate' : 'Reactivate'}</button>}
                      </span>
                    </li>
                  ))}
                  {people.filter((p) => p.orgId === o.id).length === 0 && <li className="py-1 text-xs text-gray-400">No one yet.</li>}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Add a person</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              {ctx.org.isPlatform && (
                <select value={newPerson.orgId} onChange={(e) => setNewPerson({ ...newPerson, orgId: Number(e.target.value) })} className="rounded border border-gray-300 px-2 py-1">
                  {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              )}
              <input value={newPerson.name} onChange={(e) => setNewPerson({ ...newPerson, name: e.target.value })} placeholder="Name" className="w-40 rounded border border-gray-300 px-2 py-1" />
              <input type="email" value={newPerson.email} onChange={(e) => setNewPerson({ ...newPerson, email: e.target.value })} placeholder="Email" className="w-56 rounded border border-gray-300 px-2 py-1" />
              <input type="password" autoComplete="new-password" value={newPerson.password} onChange={(e) => setNewPerson({ ...newPerson, password: e.target.value })} placeholder="First password, 8+" className="w-44 rounded border border-gray-300 px-2 py-1" />
              <select value={newPerson.role} onChange={(e) => setNewPerson({ ...newPerson, role: e.target.value as 'member' | 'owner' })} className="rounded border border-gray-300 px-2 py-1">
                <option value="member">Member</option>
                <option value="owner">Owner</option>
              </select>
              <select value={newPerson.seatType} onChange={(e) => setNewPerson({ ...newPerson, seatType: e.target.value as SeatType })} title={SEAT_HINT[newPerson.seatType]} className="rounded border border-gray-300 px-2 py-1">
                {SEAT_TYPES.map((t) => <option key={t} value={t}>{SEAT_LABEL[t]} seat · {money(rates[t])}/mo</option>)}
              </select>
              <button type="button" onClick={() => void addPerson()} disabled={!newPerson.email || newPerson.password.length < 8} className="rounded-full bg-brand-700 px-3 py-1 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50">Add {orgName(newPerson.orgId) ? `to ${orgName(newPerson.orgId)}` : ''}</button>
            </div>
            <p className="mt-1 text-[11px] text-gray-500">Adding someone uses a seat. When every seat is taken the button says so; an owner can deactivate someone to free a seat, or the platform administrator can add seats. The seat type sets the monthly rate, lowest to highest: Business for a company keeping its own books, Payroll Unlimited for payroll alone with no limit on employees, Bookkeeper for the daily books and payroll, Full accountant for everything. The exact screens each person may use are set inside each company under Access &amp; Permissions.</p>
          </div>

          {ctx.org.isPlatform && (
            <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3" data-testid="web-seat-rates">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Seat rates (per seat, per month, CAD before HST)</div>
              <div className="mt-1 flex flex-wrap items-center gap-4 text-sm">
                {SEAT_TYPES.map((t) => (
                  <label key={t} className="flex items-center gap-2 text-xs text-gray-700" title={SEAT_HINT[t]}>
                    <span className="min-w-[5.5rem] font-medium">{SEAT_LABEL[t]}</span>
                    <span className="text-gray-500">{money(rates[t])}</span>
                    <input type="number" min={0} step={1} placeholder="new" value={rateDraft[t]} onChange={(e) => setRateDraft((d) => ({ ...d, [t]: e.target.value }))} className="w-20 rounded border border-gray-300 px-1 py-0.5" />
                    <button type="button" onClick={() => void saveRate(t)} disabled={rateDraft[t] === ''} className="rounded-full bg-brand-700 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-brand-800 disabled:opacity-50">Set</button>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-gray-500">Each firm's card shows its monthly total from these rates and its active seats. Changing a rate changes every firm's total from now on.</p>
            </div>
          )}

          <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3" data-testid="web-agreements">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Agreements</div>
            <p className="mt-1 text-[11px] text-gray-500">Every person accepts the Subscription Agreement and Terms at first sign-in by typing their name. The signed copy opens ready to print or save as PDF.</p>
            <ul className="mt-2 divide-y divide-gray-100 text-sm">
              {people.filter((p) => !orgs.find((o) => o.id === p.orgId)?.isPlatform).map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1">
                  <span className="min-w-[10rem] text-gray-900">{p.name}</span>
                  <span className="text-xs text-gray-500">{orgName(p.orgId)} · {SEAT_LABEL[p.seatType]}</span>
                  {p.agreedAt
                    ? <span className="text-xs text-emerald-800">Signed {p.agreedName ?? p.name} · {p.agreedAt.slice(0, 16)}</span>
                    : <span className="text-xs text-amber-700">Not yet accepted</span>}
                  {p.agreedAt && <a className="ml-auto text-xs text-brand-700 hover:underline" target="_blank" rel="noreferrer" href={`https://apexledger.ca/agreement.html?firm=${encodeURIComponent(orgName(p.orgId))}&name=${encodeURIComponent(p.name)}&email=${encodeURIComponent(p.email)}&seat=${encodeURIComponent(SEAT_LABEL[p.seatType])}&signed=${encodeURIComponent(p.agreedName ?? p.name)}&date=${encodeURIComponent(p.agreedAt.slice(0, 10))}`}>Open signed copy</a>}
                </li>
              ))}
              {people.filter((p) => !orgs.find((o) => o.id === p.orgId)?.isPlatform).length === 0 && <li className="py-1 text-xs text-gray-400">No firm people yet.</li>}
            </ul>
          </div>

          <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3" data-testid="web-company-files">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Company files</div>
              {ctx.org.isPlatform && (
                <select value={filesOrg} onChange={(e) => setFilesOrg(Number(e.target.value))} className="rounded border border-gray-300 px-2 py-0.5 text-xs">
                  {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              )}
              <span className="text-xs text-gray-500">{files.length} file{files.length === 1 ? '' : 's'} · no limit</span>
            </div>
            <ul className="mt-2 divide-y divide-gray-100 text-sm">
              {files.map((f) => (
                <li key={f.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1">
                  <span className="min-w-[14rem] text-gray-900">{f.name.replace(/\.company$/, '')}</span>
                  <span className="text-xs text-gray-500">{sizeOf(f.bytes)} · changed {f.modified.slice(0, 10)}{f.open ? ' · open now' : ''}</span>
                  <a href={`/api/org/companies/download?org=${filesOrg}&name=${encodeURIComponent(f.name)}`} className="ml-auto text-xs text-brand-700 hover:underline">Download a copy</a>
                </li>
              ))}
              {files.length === 0 && <li className="py-1 text-xs text-gray-400">No company files yet. Create one from the welcome screen, or upload a .company file made on the desktop.</li>}
            </ul>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              <input ref={fileInput} type="file" accept=".company" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadCompany(f); }} />
              <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading || !filesOrg} className="rounded-full bg-brand-700 px-3 py-1 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50">{uploading ? 'Uploading…' : 'Upload a company file'}</button>
              <label className="flex items-center gap-1 text-xs text-gray-600"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Replace a file with the same name</label>
            </div>
            <p className="mt-1 text-[11px] text-gray-500">Upload the .company file from the desktop app or another firm and it opens here like any other. A file someone has open is never replaced. Download gives a consistent copy even while it is in use.</p>
          </div>

          {ctx.org.isPlatform && (
            <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3" data-testid="web-trial-requests">
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Trial requests from apexledger.ca</div>
                <span className="text-xs text-gray-500">{trials.filter((t) => t.status === 'new').length} new</span>
                <label className="ml-auto flex items-center gap-1 text-xs text-gray-600"><input type="checkbox" checked={showDoneTrials} onChange={(e) => setShowDoneTrials(e.target.checked)} /> Show done</label>
              </div>
              <ul className="mt-2 divide-y divide-gray-100 text-sm">
                {trials.filter((t) => showDoneTrials || t.status === 'new').map((t) => (
                  <li key={t.id} className={`py-2 ${t.status === 'done' ? 'text-gray-400' : ''}`}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className={`font-medium ${t.status === 'done' ? '' : 'text-gray-900'}`}>{t.firm}</span>
                      <span className="text-xs text-gray-500">{t.name} · <a href={`mailto:${t.email}`} className="text-brand-700 hover:underline">{t.email}</a>{t.phone ? ` · ${t.phone}` : ''}</span>
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] text-brand-800">{t.edition} · {t.seats} seat{t.seats === 1 ? '' : 's'}</span>
                      <span className="text-xs text-gray-400">{t.createdAt.slice(0, 16)}</span>
                      <span className="ml-auto flex gap-2 text-xs">
                        {t.status === 'new' && <button type="button" onClick={() => fillFromTrial(t)} className="text-brand-700 hover:underline">Create organisation</button>}
                        <button type="button" onClick={() => void setTrialStatus(t, t.status === 'new' ? 'done' : 'new')} className="text-gray-600 hover:underline">{t.status === 'new' ? 'Mark done' : 'Reopen'}</button>
                      </span>
                    </div>
                    {t.message && <div className="mt-1 whitespace-pre-wrap text-xs text-gray-600">{t.message}</div>}
                  </li>
                ))}
                {trials.filter((t) => showDoneTrials || t.status === 'new').length === 0 && <li className="py-1 text-xs text-gray-400">No new requests. The "Start a one-month trial" form on the website lands here.</li>}
              </ul>
            </div>
          )}

          {ctx.org.isPlatform && (
            <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">New organisation</div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                <input value={newOrg.name} onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value })} placeholder="Firm or business name" className="w-64 rounded border border-gray-300 px-2 py-1" />
                <label className="flex items-center gap-1 text-xs text-gray-600">Seats <input type="number" min={1} value={newOrg.seats} onChange={(e) => setNewOrg({ ...newOrg, seats: Number(e.target.value) })} className="w-16 rounded border border-gray-300 px-1 py-0.5" /></label>
                <label className="flex items-center gap-1 text-xs text-gray-600" title="Half price for six months, for the first firms"><input type="checkbox" checked={newOrg.founding} onChange={(e) => setNewOrg({ ...newOrg, founding: e.target.checked })} /> Founding firm{founding ? ` (${founding.used} of ${founding.maxFirms} used, sign up by ${founding.signUpBy})` : ''}</label>
                <button type="button" onClick={() => void addOrg()} disabled={!newOrg.name.trim()} className="rounded-full bg-brand-700 px-3 py-1 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50">Create</button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
