import { useCallback, useEffect, useState } from 'react';

/** Settings → Organisation & seats, on the web only.
 *
 * An organisation owner sees their people and seats and can add someone, deactivate or reactivate
 * them, and reset a password. The platform administrator sees every organisation, creates new
 * ones, and changes seat counts. Everyone can change their own password. The desktop app has no
 * organisations, so this section does not appear there. */
interface Org { id: number; name: string; slug: string; seats: number; isPlatform: boolean; activeSeats: number }
interface Person { id: number; orgId: number; email: string; name: string; role: 'owner' | 'member'; isActive: boolean; lastSignIn: string | null }
type Result<T> = { ok: true; data: T } | { ok: false; error: string };

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
  const [newPerson, setNewPerson] = useState({ orgId: 0, name: '', email: '', password: '', role: 'member' as 'member' | 'owner' });
  const [newOrg, setNewOrg] = useState({ name: '', seats: 2 });
  const [myPassword, setMyPassword] = useState('');
  const canManage = !!ctx && (ctx.org.isPlatform || ctx.user.role === 'owner');

  const reload = useCallback(async () => {
    if (!canManage) return;
    const [o, p] = await Promise.all([call<Org[]>('/api/admin/orgs'), call<Person[]>('/api/admin/users')]);
    if (o.ok) setOrgs(o.data); else setError(o.error);
    if (p.ok) setPeople(p.data); else setError(p.error);
  }, [canManage]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { if (orgs.length && !newPerson.orgId) setNewPerson((n) => ({ ...n, orgId: orgs.find((o) => !o.isPlatform)?.id ?? orgs[0].id })); }, [orgs, newPerson.orgId]);

  if (!ctx) return null;

  async function addPerson() {
    setError(null); setNotice(null);
    const r = await call<Person>('/api/admin/users', newPerson);
    if (!r.ok) { setError(r.error); return; }
    setNotice(`${r.data.name} added. Give them the password you typed; they can change it after signing in.`);
    setNewPerson((n) => ({ ...n, name: '', email: '', password: '' }));
    void reload();
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
    setNotice(`${r.data.name} created with ${r.data.seats} seats.`);
    setNewOrg({ name: '', seats: 2 });
    void reload();
  }
  async function setSeats(o: Org, seats: number) {
    const r = await call<Org>(`/api/admin/orgs/${o.id}/seats`, { seats });
    if (!r.ok) setError(r.error); else void reload();
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
                  <div className="text-xs text-gray-500">{o.activeSeats} of {o.seats} seats used</div>
                </div>
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
                      <span className="text-xs text-gray-500">{p.email} · {p.role}{p.lastSignIn ? ` · last sign-in ${p.lastSignIn.slice(0, 16)}` : ''}</span>
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
              <button type="button" onClick={() => void addPerson()} disabled={!newPerson.email || newPerson.password.length < 8} className="rounded-full bg-brand-700 px-3 py-1 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50">Add {orgName(newPerson.orgId) ? `to ${orgName(newPerson.orgId)}` : ''}</button>
            </div>
            <p className="mt-1 text-[11px] text-gray-500">Adding someone uses a seat. When every seat is taken the button says so; an owner can deactivate someone to free a seat, or the platform administrator can add seats.</p>
          </div>

          {ctx.org.isPlatform && (
            <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">New organisation</div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                <input value={newOrg.name} onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value })} placeholder="Firm or business name" className="w-64 rounded border border-gray-300 px-2 py-1" />
                <label className="flex items-center gap-1 text-xs text-gray-600">Seats <input type="number" min={1} value={newOrg.seats} onChange={(e) => setNewOrg({ ...newOrg, seats: Number(e.target.value) })} className="w-16 rounded border border-gray-300 px-1 py-0.5" /></label>
                <button type="button" onClick={() => void addOrg()} disabled={!newOrg.name.trim()} className="rounded-full bg-brand-700 px-3 py-1 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50">Create</button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
