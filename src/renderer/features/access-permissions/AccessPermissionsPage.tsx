import { useEffect, useState } from 'react';
import type { AccessPermission, AccessRole, CompanyUser } from '@shared/domain/access';
import { ACCESS_ROLE_LABELS, ALL_ACCESS_PERMISSIONS } from '@shared/domain/access';
import { billedSeats, monthlySeatCostCents, seatPlanFromLicense } from '@shared/domain/licensing/seatPlans';
import { Modal } from '../../components/Modal';
import { Money } from '../../components/Money';
import { useAccessRole } from '../../utils/accessRole';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { END_REASON_LABELS, filterStaffSessions, formatDuration, sessionDurationMinutes, summariseStaffSessions, type StaffSession } from '@shared/domain/access/staffSessions';

const ROLE_DESCRIPTIONS: Record<AccessRole, string> = {
  administrator: 'Everything, including company settings, users, payroll, banking and accounting.',
  accountant: 'Accounting, tax, reports, banking, sales and purchases; no user or company administration.',
  bookkeeper: 'Daily sales, purchases, banking and inventory entries.',
  payroll: 'Employees, payroll runs, remittances and payroll records only.',
  accountsReceivable: 'Customers, estimates, invoices, sales receipts and collections only.',
  accountsPayable: 'Vendors, bills, purchase orders and payments only.',
  readOnly: 'Can view records and reports but cannot save, post, edit or delete.',
  custom: 'Choose individual permission areas for this user.',
};

const PERMISSION_LABELS: Record<AccessPermission, string> = {
  company: 'Company settings', users: 'Users and access', sales: 'Sales and A/R', purchases: 'Purchases and A/P',
  banking: 'Banking', accounting: 'Journal and chart of accounts', payroll: 'Payroll', tax: 'Sales tax and GIFI', inventory: 'Inventory',
};

/** What the company is currently paying for, drawn from the licence and the plan catalogue rather
 * than a figure typed into this screen — a price written into a component is wrong the first time
 * pricing changes. A licence issued before seat billing has no plan and no limit, so the panel says
 * so instead of inventing a number. */
function SeatSummary({ users }: { users: CompanyUser[] }) {
  const { data: license } = useIpcQuery(() => window.api.license.status(), []);
  const plan = seatPlanFromLicense(license?.plan);
  const licensed = license?.seats ?? null;
  const used = billedSeats(users);

  if (!plan || licensed === null) return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
      <strong>{used}</strong> {used === 1 ? 'person uses' : 'people use'} this company. This licence has no seat plan attached, so no seat limit is applied.
    </div>
  );

  const full = used >= licensed;
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${full ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-sky-200 bg-sky-50 text-sky-900'}`}>
      <div>
        <strong>{used} of {licensed} seats in use</strong> on the {plan.label} plan — <Money cents={monthlySeatCostCents(licensed, plan)} /> per month
        {licensed > plan.includedSeats && <> ({plan.includedSeats} included, {licensed - plan.includedSeats} extra at <Money cents={plan.additionalSeatMonthlyCents} /> each)</>}.
      </div>
      <div className="mt-0.5 text-xs">
        {full ? (
          'Every seat is taken. Suspend a user, or add seats to the subscription, before inviting anyone else.'
        ) : (
          <>Each active or invited user takes one seat. One more costs <Money cents={plan.additionalSeatMonthlyCents} /> per month.</>
        )}
      </div>
    </div>
  );
}

const HISTORY_RANGES: { key: string; label: string; days: number | null }[] = [
  { key: '7', label: 'Last 7 days', days: 7 }, { key: '30', label: 'Last 30 days', days: 30 }, { key: '90', label: 'Last 90 days', days: 90 }, { key: 'all', label: 'All time', days: null },
];

function localTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' });
}

/** When each person signed in and out. Rendered only for an administrator; the main process
 * refuses the request for anyone else, so hiding the panel is a courtesy, not the control. */
function SignInHistory() {
  const [sessions, setSessions] = useState<StaffSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState('30');
  const [actorKey, setActorKey] = useState('');

  useEffect(() => {
    window.api.access.signInHistory().then((result) => {
      if (result.ok) setSessions(result.data);
      else setError(result.error);
    });
  }, []);

  const days = HISTORY_RANGES.find((item) => item.key === range)?.days ?? null;
  const from = days === null ? null : new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const visible = filterStaffSessions(sessions, { from, actorKey: actorKey || null });
  const totals = summariseStaffSessions(visible);
  const people = summariseStaffSessions(sessions);

  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-lg font-semibold text-brand-900">Sign-in history</h2>
        <p className="text-sm text-gray-500">When each person signed in and out of this company. Recorded automatically; visible to administrators only.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Period" value={range} onChange={(e) => setRange(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm">
          {HISTORY_RANGES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select>
        <select aria-label="Person" value={actorKey} onChange={(e) => setActorKey(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm">
          <option value="">Everyone</option>
          {people.map((person) => <option key={person.actorKey} value={person.actorKey}>{person.actorName}</option>)}
        </select>
      </div>
      {error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {totals.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {totals.map((person) => (
            <div key={person.actorKey} className={`rounded-lg px-3 py-2 text-sm ${person.openNow ? 'bg-emerald-50 text-emerald-900' : 'bg-gray-50 text-gray-800'}`}>
              <div className="font-semibold">{person.actorName}{person.openNow && <span className="ml-2 text-xs font-medium text-emerald-700">signed in now</span>}</div>
              <div className="text-xs">{person.sessions} sign-in{person.sessions === 1 ? '' : 's'} · {formatDuration(person.minutes)}</div>
            </div>
          ))}
        </div>
      )}
      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-6 text-center text-sm text-gray-500">No sign-ins recorded for this period.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr><th className="px-3 py-2">Person</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Signed in</th><th className="px-3 py-2">Signed out</th><th className="px-3 py-2 text-right">Duration</th><th className="px-3 py-2">Ended by</th></tr>
            </thead>
            <tbody>
              {visible.map((session) => (
                <tr key={session.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-medium">{session.actorName}{session.actorEmail && <div className="text-xs font-normal text-gray-500">{session.actorEmail}</div>}</td>
                  <td className="px-3 py-2 text-gray-600">{session.role}</td>
                  <td className="px-3 py-2">{localTime(session.signedInAt)}</td>
                  <td className="px-3 py-2">{session.signedOutAt ? localTime(session.signedOutAt) : <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">signed in</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatDuration(sessionDurationMinutes(session))}</td>
                  <td className="px-3 py-2 text-gray-600">{session.endReason ? END_REASON_LABELS[session.endReason] : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AddUserModal({ open, onClose, onInvited }: { open: boolean; onClose: () => void; onInvited: (url: string) => void }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AccessRole>('bookkeeper');
  const [permissions, setPermissions] = useState<AccessPermission[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFirstName(''); setLastName(''); setEmail(''); setRole('bookkeeper'); setPermissions([]); setError(null);
  }, [open]);

  const canSend = firstName.trim() && lastName.trim() && email.includes('@') && (role !== 'custom' || permissions.length > 0);

  async function sendInvite() {
    if (!canSend) return;
    setBusy(true); setError(null);
    const result = await window.api.access.usersInvite({ firstName, lastName, email, role, permissions: role === 'custom' ? permissions : undefined });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onInvited(result.data.inviteUrl);
  }

  function togglePermission(permission: AccessPermission) {
    setPermissions((current) => current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission]);
  }

  return (
    <Modal open={open} onClose={onClose} title="Add User" wide footer={
      <>
        <button type="button" onClick={onClose} className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
        <button type="button" disabled={busy || !canSend} onClick={sendInvite} className="rounded-full bg-brand-800 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">{busy ? 'Creating…' : 'Create Invite'}</button>
      </>
    }>
      <div className="space-y-3">
        <div>
          <h3 className="font-semibold text-gray-900">Personal information</h3>
          <p className="text-sm text-gray-500">The invitation belongs to this company only.</p>
        </div>
        {error && <div role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm"><span className="text-gray-600">First name</span><input autoFocus value={firstName} onChange={(e) => setFirstName(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
          <label className="text-sm"><span className="text-gray-600">Last name</span><input value={lastName} onChange={(e) => setLastName(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
          <label className="text-sm"><span className="text-gray-600">Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
        </div>
        <div className="border-t border-gray-200 pt-4">
          <h3 className="font-semibold text-gray-900">Assign role</h3>
          <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as AccessRole)} className="mt-2 w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm">
            {(Object.keys(ACCESS_ROLE_LABELS) as AccessRole[]).map((item) => <option key={item} value={item}>{ACCESS_ROLE_LABELS[item]}</option>)}
          </select>
          <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{ROLE_DESCRIPTIONS[role]}</p>
          {role === 'custom' && <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-3">{ALL_ACCESS_PERMISSIONS.map((permission) => <label key={permission} className="flex items-center gap-2 rounded border border-gray-200 px-3 py-2 text-sm"><input type="checkbox" checked={permissions.includes(permission)} onChange={() => togglePermission(permission)} />{PERMISSION_LABELS[permission]}</label>)}</div>}
        </div>
        <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">Desktop mode creates a secure invitation link for copying. Automatic email delivery and remote acceptance will become available when the cloud service is connected.</p>
      </div>
    </Modal>
  );
}

export function AccessPermissionsPage() {
  const activeRole = useAccessRole();
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: license } = useIpcQuery(() => window.api.license.status(), []);
  const licensedSeatCount = license?.seats ?? null;
  const seatsFull = licensedSeatCount !== null && billedSeats(users) >= licensedSeatCount;

  async function reload() {
    setLoading(true);
    const result = await window.api.access.usersList();
    setLoading(false);
    if (!result.ok) return setError(result.error);
    setUsers(result.data); setError(null);
  }
  useEffect(() => {
    if (activeRole === 'administrator') void reload();
    else setLoading(false);
  }, [activeRole]);

  async function copyInvite(url: string) {
    await navigator.clipboard.writeText(url);
    setMessage('Invitation link copied. Send it only to the intended user.');
  }

  async function invited(url: string) {
    setShowAdd(false); await reload(); await copyInvite(url);
  }

  async function updateRole(user: CompanyUser, role: AccessRole) {
    const result = await window.api.access.usersUpdateRole({ id: user.id, role });
    if (!result.ok) return setError(result.error);
    await reload(); setMessage(`${user.firstName}'s role was updated.`);
  }

  async function toggleStatus(user: CompanyUser) {
    const status = user.status === 'suspended' ? 'active' : 'suspended';
    const result = await window.api.access.usersSetStatus({ id: user.id, status });
    if (!result.ok) return setError(result.error);
    await reload(); setMessage(status === 'suspended' ? `${user.firstName}'s access was suspended immediately.` : `${user.firstName}'s access was restored.`);
  }

  async function resend(user: CompanyUser) {
    const result = await window.api.access.usersResendInvite(user.id);
    if (!result.ok) return setError(result.error);
    await reload(); await copyInvite(result.data.inviteUrl);
  }

  async function cancelInvite(user: CompanyUser) {
    if (!window.confirm(`Cancel the invitation for ${user.firstName} ${user.lastName}?`)) return;
    const result = await window.api.access.usersCancelInvite(user.id);
    if (!result.ok) return setError(result.error);
    await reload(); setMessage('Invitation cancelled.');
  }

  async function setupThreeUserDemo() {
    const result = await window.api.access.setupThreeUserDemo({});
    if (!result.ok) return setError(result.error);
    await reload();
    setMessage('Three active test users are ready. Open Mirror Window, then choose a different “Working as” user in each window.');
  }

  if (activeRole !== 'administrator') return (
    <div className="w-full space-y-3">
      <h1 className="text-lg font-semibold text-brand-900">My Access</h1>
      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <div className="font-semibold text-gray-900">{ACCESS_ROLE_LABELS[activeRole]}</div>
        <p className="mt-2 text-sm text-gray-600">{ROLE_DESCRIPTIONS[activeRole]}</p>
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Only an administrator can view email addresses, invite users, change roles, or suspend access.</p>
      </div>
    </div>
  );

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h1 className="text-lg font-semibold text-brand-900">Users &amp; Access</h1><p className="text-sm text-gray-500">Invite named users and control what they may change in this company.</p></div>
        <div className="flex flex-wrap items-center gap-2"><button type="button" disabled={seatsFull} onClick={() => setShowAdd(true)} title={seatsFull ? 'Every licensed seat is in use.' : undefined} className="rounded-full bg-brand-800 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40 disabled:hover:bg-brand-800">+ Add User</button><button type="button" onClick={() => void setupThreeUserDemo()} className="rounded-full border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-100">Create 3-user test team</button></div>
      </div>
      <SeatSummary users={users} />
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">Current workstation permission: <strong>{ACCESS_ROLE_LABELS[activeRole]}</strong>. Permission checks run in the accounting engine for every save, post, edit and delete.</div>
      {message && <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">{message}</div>}
      {error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading ? <p className="text-sm text-gray-500">Loading users…</p> : users.length === 0 ? <div className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-5 text-center"><p className="font-medium text-gray-800">No invited users yet</p><p className="mt-1 text-sm text-gray-500">The current administrator remains available on this workstation. Add the first named user when ready.</p></div> :
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white"><table className="w-full min-w-[900px] text-sm"><thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-3 py-2">User</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Actions</th></tr></thead><tbody>{users.map((user) => <tr key={user.id} className="border-t border-gray-100"><td className="px-3 py-2 font-medium">{user.firstName} {user.lastName}</td><td className="px-3 py-2 text-gray-600">{user.email}</td><td className="px-3 py-2">{user.role === 'custom' ? <div><span className="font-medium">Custom role</span><div className="mt-1 text-xs text-gray-500">{user.permissions.map((permission) => PERMISSION_LABELS[permission]).join(', ')}</div></div> : <select value={user.role} onChange={(e) => void updateRole(user, e.target.value as AccessRole)} className="rounded border border-gray-300 px-2 py-1">{(Object.keys(ACCESS_ROLE_LABELS) as AccessRole[]).filter((role) => role !== 'custom').map((role) => <option key={role} value={role}>{ACCESS_ROLE_LABELS[role]}</option>)}</select>}</td><td className="px-3 py-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${user.status === 'active' ? 'bg-emerald-100 text-emerald-800' : user.status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}>{user.status}</span></td><td className="px-3 py-2"><div className="flex flex-wrap gap-2">{user.status === 'pending' ? <><button onClick={() => void resend(user)} className="text-brand-700 hover:underline">Copy new invite</button><button onClick={() => void cancelInvite(user)} className="text-rose-700 hover:underline">Cancel invite</button></> : <button onClick={() => void toggleStatus(user)} className={user.status === 'suspended' ? 'text-emerald-700 hover:underline' : 'text-rose-700 hover:underline'}>{user.status === 'suspended' ? 'Restore access' : 'Suspend access'}</button>}</div></td></tr>)}</tbody></table></div>}
      <AddUserModal open={showAdd} onClose={() => setShowAdd(false)} onInvited={(url) => void invited(url)} />
      <SignInHistory />
    </div>
  );
}
