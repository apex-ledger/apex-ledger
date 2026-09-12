import { useCallback, useEffect, useState } from 'react';

/** Administration → Subscriptions, for the platform administrator only.
 *
 * Every firm on Apex Ledger with what it is billed, what it has paid and what it owes, worked out
 * from the seats in use and the seat rates (see server/billing.ts). Payments received by e-transfer,
 * cheque or card are recorded here by hand, so the dashboard shows the true position without a
 * payment processor. Each firm opens into its people, its payments and its billing details. */
type SeatType = 'business' | 'payroll' | 'bookkeeper' | 'full';
const SEAT_LABEL: Record<string, string> = { business: 'Business', payroll: 'Payroll Unlimited', bookkeeper: 'Bookkeeper', full: 'Full accountant' };
const METHODS = [['etransfer', 'e-Transfer'], ['cheque', 'Cheque'], ['card', 'Card'], ['bank', 'Bank transfer'], ['cash', 'Cash'], ['other', 'Other']] as const;

interface Org { id: number; name: string; slug: string; seats: number; createdAt: string; discountPct: number; discountUntil: string | null; billingEmail: string; billingStart: string | null; billingCycle: 'monthly' | 'yearly'; billingStatus: 'active' | 'paused' | 'cancelled'; billingEnd: string | null; billingNotes: string }
interface Person { id: number; email: string; name: string; role: 'owner' | 'member'; seatType: SeatType; isActive: boolean; agreedAt: string | null; agreedName: string | null; lastSignIn: string | null }
interface Payment { id: number; orgId: number; paidOn: string; amountCents: number; method: string; reference: string; periodFrom: string | null; periodTo: string | null; note: string }
interface Charge { periodFrom: string; periodTo: string; listCents: number; discountCents: number; amountCents: number; discountPct: number }
interface Billing { status: 'trial' | 'active' | 'paused' | 'cancelled'; billingStart: string; firstChargeDate: string; monthlyListCents: number; monthlyNowCents: number; seatCounts: Record<string, number>; charges: Charge[]; billedCents: number; paidCents: number; owingCents: number; nextCharge: { date: string; amountCents: number } | null; discountEndsOn: string | null }
interface Row { org: Org; billing: Billing; people: Person[]; payments: Payment[]; companies: number; agreedCount: number; activeCount: number; lastActivity: string | null }
interface Totals { firms: number; trial: number; active: number; paused: number; cancelled: number; monthlyRecurringCents: number; owingCents: number; paidCents: number; billedCents: number }
interface Dashboard { today: string; rates: Record<string, number>; totals: Totals; rows: Row[] }
type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function call<T>(url: string, body?: unknown): Promise<Result<T>> {
  try {
    const res = await fetch(url, body === undefined ? { credentials: 'same-origin' } : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return (await res.json()) as Result<T>;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const money = (cents: number) => (cents < 0 ? '-' : '') + '$' + (Math.abs(cents) / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (s: string | null) => (s ? s.slice(0, 10) : '—');
const STATUS_STYLE: Record<Billing['status'], string> = { trial: 'bg-sky-100 text-sky-800', active: 'bg-emerald-100 text-emerald-800', paused: 'bg-amber-100 text-amber-800', cancelled: 'bg-gray-200 text-gray-700' };
const STATUS_LABEL: Record<Billing['status'], string> = { trial: 'Trial', active: 'Active', paused: 'Paused', cancelled: 'Cancelled' };

export function WebSubscriptionsSection() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | Billing['status'] | 'owing'>('all');

  const load = useCallback(async () => {
    const r = await call<Dashboard>('/api/admin/subscriptions');
    if (r.ok) { setData(r.data); setError(null); } else setError(r.error);
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (error) return <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">Subscriptions: {error}</div>;
  if (!data) return <div className="mb-4 text-sm text-gray-500">Loading subscriptions…</div>;

  const t = data.totals;
  const rows = data.rows.filter((r) => filter === 'all' ? true : filter === 'owing' ? r.billing.owingCents > 0 : r.billing.status === filter);
  const tile = (label: string, value: string, tone: string, sub?: string) => (
    <div className={`rounded-lg p-4 ${tone}`}><div className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div>{sub && <div className="mt-0.5 text-xs opacity-80">{sub}</div>}</div>
  );

  return (
    <section className="mb-6 min-w-0 max-w-full rounded-lg border border-gray-200 bg-white p-4" data-testid="subscriptions-section">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-brand-900">Subscriptions</h2>
          <p className="text-xs text-gray-600">Billed from the seats in use at the current rates: first month free, {data.rates.business / 100}/{data.rates.payroll / 100}/{data.rates.bookkeeper / 100}/{data.rates.full / 100} per seat, yearly 20% off, founding firms half price. Record payments as they arrive. As of {data.today}.</p>
        </div>
        <button type="button" onClick={() => void load()} className="rounded-full border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50">Refresh</button>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {tile('Firms', String(t.firms), 'bg-brand-50 text-brand-900', `${t.trial} on trial · ${t.active} active · ${t.paused} paused · ${t.cancelled} cancelled`)}
        {tile('Monthly recurring', money(t.monthlyRecurringCents), 'bg-emerald-50 text-emerald-900', `${money(t.monthlyRecurringCents * 12)} a year at today's seats`)}
        {tile('Billed to date', money(t.billedCents), 'bg-gray-50 text-gray-900', 'all charge periods started')}
        {tile('Received', money(t.paidCents), 'bg-emerald-50 text-emerald-900', 'payments recorded')}
        {tile('Owing', money(t.owingCents), t.owingCents > 0 ? 'bg-gold-100 text-amber-900' : 'bg-gray-50 text-gray-900', t.owingCents > 0 ? 'billed less received' : 'nothing outstanding')}
      </div>

      <div className="mb-2 flex flex-wrap gap-1 text-xs">
        {(['all', 'trial', 'active', 'paused', 'cancelled', 'owing'] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 ${filter === f ? 'bg-brand-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{f === 'all' ? 'All firms' : f === 'owing' ? 'Owing' : STATUS_LABEL[f]}</button>
        ))}
      </div>

      <div className="max-w-full" style={{ overflowX: 'auto' }}>
        <table className="w-full table-fixed text-xs">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-600">
            <tr><th className="w-[19%] px-1.5 py-2">Firm</th><th className="w-[11%] px-1.5 py-2">Status</th><th className="w-[17%] px-1.5 py-2">Seats in use</th><th className="w-[9%] px-1.5 py-2 text-right">Per month</th><th className="w-[10%] px-1.5 py-2">Next charge</th><th className="w-[8%] px-1.5 py-2 text-right">Billed</th><th className="w-[8%] px-1.5 py-2 text-right">Received</th><th className="w-[8%] px-1.5 py-2 text-right">Owing</th><th className="w-[5%] px-1.5 py-2 text-center">Cos.</th><th className="w-[8%] px-1.5 py-2">Last active</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={10} className="px-2 py-4 text-center text-gray-500">No firms match.</td></tr>}
            {rows.map((r) => (
              <FirmRows key={r.org.id} row={r} open={openId === r.org.id} onToggle={() => setOpenId(openId === r.org.id ? null : r.org.id)} onChanged={() => void load()} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FirmRows({ row, open, onToggle, onChanged }: { row: Row; open: boolean; onToggle: () => void; onChanged: () => void }) {
  const { org, billing: b } = row;
  const seats = Object.entries(b.seatCounts).map(([k, n]) => `${n} ${SEAT_LABEL[k] ?? k}`).join(', ') || 'none';
  return (
    <>
      <tr className={`cursor-pointer border-t border-gray-100 hover:bg-brand-50/40 ${open ? 'bg-brand-50/60' : ''}`} onClick={onToggle} data-testid={`sub-row-${org.id}`}>
        <td className="break-words px-1.5 py-2 font-medium text-gray-900">{org.name}<div className="text-xs font-normal text-gray-500">{org.billingEmail || 'no billing email'}{org.discountPct > 0 && b.discountEndsOn && b.discountEndsOn >= b.billingStart ? ` · founding ${org.discountPct}% off to ${b.discountEndsOn}` : ''}</div></td>
        <td className="px-1.5 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[b.status]}`}>{STATUS_LABEL[b.status]}</span>{b.status === 'trial' && <div className="text-xs text-gray-500">billing from {b.firstChargeDate}</div>}</td>
        <td className="break-words px-1.5 py-2 text-gray-700">{seats}<div className="text-gray-500">{row.activeCount} of {org.seats} seats · {row.agreedCount} signed the agreement</div></td>
        <td className="px-1.5 py-2 text-right tabular-nums">{money(b.monthlyNowCents)}{b.monthlyNowCents !== b.monthlyListCents && <div className="text-xs text-gray-500 line-through">{money(b.monthlyListCents)}</div>}{org.billingCycle === 'yearly' && <div className="text-xs text-gray-500">billed yearly</div>}</td>
        <td className="px-1.5 py-2 text-xs">{b.nextCharge ? <>{b.nextCharge.date}<div className="text-gray-500">{money(b.nextCharge.amountCents)}</div></> : '—'}</td>
        <td className="px-1.5 py-2 text-right tabular-nums">{money(b.billedCents)}</td>
        <td className="px-1.5 py-2 text-right tabular-nums">{money(b.paidCents)}</td>
        <td className={`px-1.5 py-2 text-right font-semibold tabular-nums ${b.owingCents > 0 ? 'text-amber-800' : b.owingCents < 0 ? 'text-emerald-800' : 'text-gray-700'}`}>{money(b.owingCents)}{b.owingCents < 0 && <div className="text-xs font-normal">credit</div>}</td>
        <td className="px-1.5 py-2 text-center">{row.companies}</td>
        <td className="px-1.5 py-2 text-xs text-gray-600">{day(row.lastActivity)}</td>
      </tr>
      {open && (
        <tr className="border-t border-gray-100 bg-gray-50/60">
          <td colSpan={10} className="px-3 py-3">
            <FirmDetail row={row} onChanged={onChanged} />
          </td>
        </tr>
      )}
    </>
  );
}

function FirmDetail({ row, onChanged }: { row: Row; onChanged: () => void }) {
  const { org, billing: b } = row;
  const [form, setForm] = useState({ billingEmail: org.billingEmail, billingStart: org.billingStart ?? b.billingStart, billingCycle: org.billingCycle, billingStatus: org.billingStatus, billingEnd: org.billingEnd ?? '', billingNotes: org.billingNotes });
  const [pay, setPay] = useState({ paidOn: new Date().toISOString().slice(0, 10), amount: '', method: 'etransfer', reference: '', periodFrom: '', periodTo: '', note: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const field = 'mt-0.5 w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm';

  async function saveBilling() {
    const r = await call<Org>(`/api/admin/orgs/${org.id}/billing`, form);
    setMsg(r.ok ? 'Billing details saved.' : r.error);
    if (r.ok) onChanged();
  }
  async function addPayment() {
    const amountCents = Math.round(Number(pay.amount) * 100);
    const r = await call<Payment>(`/api/admin/orgs/${org.id}/payments`, { ...pay, amountCents });
    setMsg(r.ok ? `Payment of ${money(r.data.amountCents)} recorded.` : r.error);
    if (r.ok) { setPay({ ...pay, amount: '', reference: '', note: '' }); onChanged(); }
  }
  async function removePayment(p: Payment) {
    if (!window.confirm(`Remove the ${money(p.amountCents)} payment of ${p.paidOn}?`)) return;
    const r = await call<{ deleted: boolean }>(`/api/admin/payments/${p.id}/delete`, {});
    setMsg(r.ok ? 'Payment removed.' : r.error);
    if (r.ok) onChanged();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-600">People and seats</h3>
        <table className="w-full text-xs">
          <tbody>
            {row.people.map((p) => (
              <tr key={p.id} className={`border-t border-gray-200 ${p.isActive ? '' : 'text-gray-400'}`}>
                <td className="py-1 pr-2">{p.name}<div className="text-gray-500">{p.email}</div></td>
                <td className="py-1 pr-2">{SEAT_LABEL[p.seatType]}{p.role === 'owner' ? ' · owner' : ''}{p.isActive ? '' : ' · inactive'}</td>
                <td className="py-1 text-right text-gray-500">{p.agreedAt ? `signed ${day(p.agreedAt)}` : 'not signed'}<div>{p.lastSignIn ? `seen ${day(p.lastSignIn)}` : 'never signed in'}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Charges to date</h3>
        {b.charges.length === 0 ? <div className="text-xs text-gray-500">None yet: the free month runs to {b.firstChargeDate}.</div> : (
          <table className="w-full text-xs"><tbody>
            {b.charges.map((c) => <tr key={c.periodFrom} className="border-t border-gray-200"><td className="py-1">{c.periodFrom} to {c.periodTo}</td><td className="py-1 text-right text-gray-500">{c.discountCents > 0 ? `${money(c.listCents)} less ${c.discountPct}%` : ''}</td><td className="py-1 text-right tabular-nums">{money(c.amountCents)}</td></tr>)}
            <tr className="border-t border-gray-300 font-semibold"><td className="py-1">Billed</td><td /><td className="py-1 text-right tabular-nums">{money(b.billedCents)}</td></tr>
          </tbody></table>
        )}
      </div>

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-600">Payments received</h3>
        {row.payments.length === 0 ? <div className="text-xs text-gray-500">None recorded.</div> : (
          <table className="w-full text-xs"><tbody>
            {row.payments.map((p) => (
              <tr key={p.id} className="border-t border-gray-200">
                <td className="py-1">{p.paidOn}<div className="text-gray-500">{METHODS.find((m) => m[0] === p.method)?.[1] ?? p.method}{p.reference ? ` · ${p.reference}` : ''}{p.periodFrom ? ` · for ${p.periodFrom}${p.periodTo ? ` to ${p.periodTo}` : ''}` : ''}{p.note ? ` · ${p.note}` : ''}</div></td>
                <td className="py-1 text-right tabular-nums">{money(p.amountCents)}</td>
                <td className="py-1 pl-2 text-right"><button type="button" onClick={() => void removePayment(p)} className="text-gray-400 hover:text-rose-700" aria-label="Remove payment">×</button></td>
              </tr>
            ))}
            <tr className="border-t border-gray-300 font-semibold"><td className="py-1">Received</td><td className="py-1 text-right tabular-nums">{money(b.paidCents)}</td><td /></tr>
          </tbody></table>
        )}
        <div className="mt-2 rounded border border-gray-200 bg-white p-2">
          <div className="mb-1 text-xs font-semibold text-gray-700">Record a payment</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label>Received on<input type="date" value={pay.paidOn} onChange={(e) => setPay({ ...pay, paidOn: e.target.value })} className={field} /></label>
            <label>Amount (CAD)<input type="number" step="0.01" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} className={`${field} text-right`} placeholder="0.00" /></label>
            <label>Method<select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} className={field}>{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label>Reference<input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} className={field} placeholder="e-Transfer ref, cheque #" /></label>
            <label>For period from<input type="date" value={pay.periodFrom} onChange={(e) => setPay({ ...pay, periodFrom: e.target.value })} className={field} /></label>
            <label>to<input type="date" value={pay.periodTo} onChange={(e) => setPay({ ...pay, periodTo: e.target.value })} className={field} /></label>
            <label className="col-span-2">Note<input value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} className={field} /></label>
          </div>
          <button type="button" onClick={() => void addPayment()} disabled={!pay.amount} className="mt-2 rounded-full bg-brand-700 px-3 py-1 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50">Record payment</button>
        </div>
      </div>

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-600">Billing details</h3>
        <div className="grid gap-2 text-xs">
          <label>Billing email<input value={form.billingEmail} onChange={(e) => setForm({ ...form, billingEmail: e.target.value })} className={field} placeholder="who receives the invoice" /></label>
          <label>Billing start (trial month begins)<input type="date" value={form.billingStart} onChange={(e) => setForm({ ...form, billingStart: e.target.value })} className={field} /><span className="text-gray-500">First charge one month later: currently {b.firstChargeDate}.</span></label>
          <label>Billing cycle<select value={form.billingCycle} onChange={(e) => setForm({ ...form, billingCycle: e.target.value as 'monthly' | 'yearly' })} className={field}><option value="monthly">Monthly, in advance</option><option value="yearly">Yearly, 20% off, in advance</option></select></label>
          <label>Status<select value={form.billingStatus} onChange={(e) => setForm({ ...form, billingStatus: e.target.value as Org['billingStatus'] })} className={field}><option value="active">Active</option><option value="paused">Paused (stop charging)</option><option value="cancelled">Cancelled</option></select></label>
          {form.billingStatus !== 'active' && <label>Charges stop from<input type="date" value={form.billingEnd} onChange={(e) => setForm({ ...form, billingEnd: e.target.value })} className={field} /></label>}
          <label>Notes<textarea rows={3} value={form.billingNotes} onChange={(e) => setForm({ ...form, billingNotes: e.target.value })} className={field} placeholder="terms agreed, contact, anything to remember" /></label>
          <div className="text-gray-500">Created {day(org.createdAt)} · {row.companies} compan{row.companies === 1 ? 'y' : 'ies'} · seat allowance {org.seats}</div>
        </div>
        <button type="button" onClick={() => void saveBilling()} className="mt-2 rounded-full bg-brand-700 px-3 py-1 text-xs font-medium text-white hover:bg-brand-800">Save billing details</button>
        {msg && <div className="mt-2 text-xs text-brand-800">{msg}</div>}
      </div>
    </div>
  );
}

/** The dashboard as a page of its own, using the full width of the window. */
export function WebSubscriptionsPage() {
  return (
    <div className="w-full p-4" data-testid="web-subscriptions-page">
      <div className="mb-3">
        <h1 className="text-2xl font-semibold text-brand-900">Subscriptions</h1>
        <p className="mt-1 text-sm text-gray-600">Every subscriber: what they are billed, what they have paid, what they owe, and who is on each seat.</p>
      </div>
      <WebSubscriptionsSection />
    </div>
  );
}
