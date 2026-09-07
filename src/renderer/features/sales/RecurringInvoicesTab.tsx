import { useEffect, useMemo, useState } from 'react';
import type { Account, Contact, Invoice } from '@shared/domain/types';
import { RECURRING_FREQUENCY_LABELS, templateTotalCents, type RecurringFrequency, type RecurringInvoiceLine, type RecurringInvoiceTemplate } from '@shared/domain/sales/recurringInvoices';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { Money } from '../../components/Money';
import { Modal } from '../../components/Modal';
import { Combobox } from '../../components/Combobox';
import { CurrencyInput } from '../../components/CurrencyInput';
import { PaymentTermsSelect } from '../../components/PaymentTermsSelect';
import { useUiStore } from '../../app/store/uiStore';
import { saleLineAccountPickerOptions } from '../../utils/accountLabel';

const FREQUENCIES = Object.keys(RECURRING_FREQUENCY_LABELS) as RecurringFrequency[];

type Draft = Omit<RecurringInvoiceTemplate, 'id' | 'lastGeneratedDate'>;
const emptyLine = (): RecurringInvoiceLine => ({ description: '', quantity: 1, unitPriceCents: 0, revenueAccountId: 0, productId: null, taxCode: 'HST' });
const emptyDraft = (): Draft => ({ name: '', customerId: 0, frequency: 'monthly', nextDate: localIsoDate(), endDate: null, paymentTerms: 'net30', memo: null, customerPoNumber: null, autoEmail: false, isActive: true, lines: [emptyLine()] });

/** Recurring invoices: templates that produce real invoices on schedule. "Generate due" creates
 * every invoice whose date has arrived and, for templates with auto-email on, opens each in
 * Outlook addressed to the customer. A template can also be started from an existing invoice. */
export function RecurringInvoicesTab() {
  const setView = useUiStore((s) => s.setView);
  const [templates, setTemplates] = useState<RecurringInvoiceTemplate[]>([]);
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [editing, setEditing] = useState<{ id: number | null; draft: Draft } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = localIsoDate();

  async function reload() {
    const [t, c, a, inv] = await Promise.all([window.api.recurringInvoices.list(), window.api.customers.list(), window.api.accounts.list({ activeOnly: true }), window.api.invoices.list()]);
    if (t.ok) setTemplates(t.data); if (c.ok) setCustomers(c.data); if (a.ok) setAccounts(a.data); if (inv.ok) setInvoices(inv.data);
  }
  useEffect(() => { void reload(); }, []);

  const customerName = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);
  const due = templates.filter((t) => t.isActive && t.nextDate <= today && (t.endDate === null || t.nextDate <= t.endDate));

  function fromInvoice(inv: Invoice) {
    setEditing({ id: null, draft: { ...emptyDraft(), name: `${customerName.get(inv.customerId) ?? 'Customer'} — ${inv.lines[0]?.description ?? inv.invoiceNumber}`, customerId: inv.customerId, paymentTerms: inv.paymentTerms ?? 'net30', memo: inv.memo, customerPoNumber: inv.customerPoNumber ?? null, lines: inv.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPriceCents: l.unitPriceCents, revenueAccountId: l.revenueAccountId, productId: l.productId ?? null, taxCode: l.taxCode ?? null })) } });
  }

  async function save() {
    if (!editing) return;
    const d = editing.draft;
    if (!d.name.trim() || !d.customerId || d.lines.some((l) => !l.description.trim() || !l.revenueAccountId)) return setError('Name, customer, and a description plus revenue account on every line are required.');
    setBusy(true); setError(null);
    const result = editing.id === null ? await window.api.recurringInvoices.create(d) : await window.api.recurringInvoices.update({ id: editing.id, patch: d });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setEditing(null); await reload();
  }

  async function generate(ids?: number[]) {
    setBusy(true); setError(null); setNotice(null);
    const result = await window.api.recurringInvoices.generateDue(ids ? { templateIds: ids } : {});
    setBusy(false);
    if (!result.ok) return setError(result.error);
    const made = result.data;
    setNotice(made.length === 0 ? 'Nothing was due.' : `Created ${made.map((m) => `${m.invoiceNumber} (${(m.totalCents / 100).toFixed(2)})${m.emailed ? ' · opened in Outlook' : m.emailError ? ' · email failed: ' + m.emailError : ''}`).join('; ')}.`);
    await reload();
  }

  async function remove(t: RecurringInvoiceTemplate) {
    if (!window.confirm(`Delete the recurring invoice "${t.name}"? Invoices already created stay as they are.`)) return;
    const result = await window.api.recurringInvoices.delete(t.id);
    if (!result.ok) return setError(result.error);
    await reload();
  }

  const d = editing?.draft;
  const setDraft = (patch: Partial<Draft>) => editing && setEditing({ ...editing, draft: { ...editing.draft, ...patch } });
  const setLine = (i: number, patch: Partial<RecurringInvoiceLine>) => d && setDraft({ lines: d.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setEditing({ id: null, draft: emptyDraft() })} className="rounded-full bg-brand-100 px-4 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-200">+ New recurring invoice</button>
        <select aria-label="Start from an existing invoice" className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm" value="" onChange={(e) => { const inv = invoices.find((x) => x.id === Number(e.target.value)); if (inv) fromInvoice(inv); }}>
          <option value="">Start from an existing invoice…</option>
          {invoices.slice(0, 200).map((inv) => <option key={inv.id} value={inv.id}>{inv.invoiceNumber} — {customerName.get(inv.customerId) ?? ''} — ${(inv.totalCents / 100).toFixed(2)}</option>)}
        </select>
        <button type="button" disabled={busy || due.length === 0} onClick={() => void generate()} className="ml-auto rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40" title="Create every invoice whose date has arrived">
          {busy ? 'Working…' : `Generate due (${due.length})`}
        </button>
      </div>
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>}

      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-gray-400"><th className="pb-2">Name</th><th className="pb-2">Customer</th><th className="pb-2">Every</th><th className="pb-2">Next invoice</th><th className="pb-2">Last created</th><th className="pb-2 text-right">Amount</th><th className="pb-2">Email</th><th className="pb-2">Status</th><th className="pb-2" /></tr></thead>
        <tbody>
          {templates.length === 0 && <tr><td colSpan={9} className="py-6 text-center text-gray-400">No recurring invoices yet. Start one from an existing invoice, or create one fresh.</td></tr>}
          {templates.map((t) => {
            const isDue = due.some((x) => x.id === t.id);
            return (
              <tr key={t.id} className="border-b border-gray-100">
                <td className="py-2 font-medium text-gray-800"><button type="button" className="hover:underline" onClick={() => setEditing({ id: t.id, draft: { ...t } })}>{t.name}</button></td>
                <td className="py-2 text-gray-600">{customerName.get(t.customerId) ?? '—'}</td>
                <td className="py-2 text-gray-600">{RECURRING_FREQUENCY_LABELS[t.frequency]}</td>
                <td className="py-2 tabular-nums">{t.nextDate}{isDue && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">due</span>}{t.endDate && <span className="ml-2 text-xs text-gray-400">until {t.endDate}</span>}</td>
                <td className="py-2 tabular-nums text-gray-500">{t.lastGeneratedDate ?? '—'}</td>
                <td className="py-2 text-right"><Money cents={templateTotalCents(t.lines)} /></td>
                <td className="py-2 text-gray-600">{t.autoEmail ? 'Outlook' : '—'}</td>
                <td className="py-2">{t.isActive ? <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-800">active</span> : <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-600">paused</span>}</td>
                <td className="py-2 text-right whitespace-nowrap">
                  {isDue && <button type="button" disabled={busy} onClick={() => void generate([t.id])} className="mr-2 text-xs font-medium text-emerald-700 hover:underline">Create now</button>}
                  <button type="button" onClick={() => void window.api.recurringInvoices.update({ id: t.id, patch: { isActive: !t.isActive } }).then(reload)} className="mr-2 text-xs text-gray-600 hover:underline">{t.isActive ? 'Pause' : 'Resume'}</button>
                  <button type="button" onClick={() => void remove(t)} className="text-xs text-red-600 hover:underline">Delete</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-gray-400">Each run creates one invoice per due template and moves its next date forward one period. Invoices created this way appear on the Invoices tab like any other and can be opened from there.</p>

      {editing && d && (
        <Modal fullScreen open onClose={() => setEditing(null)} title={editing.id === null ? 'New recurring invoice' : 'Edit recurring invoice'} footer={<>
          <button type="button" onClick={() => setEditing(null)} className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
          <button type="button" disabled={busy} onClick={() => void save()} className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50">Save</button>
        </>}>
          <div className="space-y-3 text-sm">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="block"><span className="text-gray-600">Name</span><input className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={d.name} onChange={(e) => setDraft({ name: e.target.value })} placeholder="e.g. Monthly bookkeeping — Maple" /></label>
              <label className="block"><span className="text-gray-600">Customer</span><Combobox options={customers.filter((c) => c.isActive).map((c) => ({ value: String(c.id), label: c.name }))} value={d.customerId ? String(d.customerId) : null} onChange={(v) => setDraft({ customerId: v ? Number(v) : 0 })} placeholder="Select a customer…" /></label>
              <label className="block"><span className="text-gray-600">Every</span><select className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5" value={d.frequency} onChange={(e) => setDraft({ frequency: e.target.value as RecurringFrequency })}>{FREQUENCIES.map((f) => <option key={f} value={f}>{RECURRING_FREQUENCY_LABELS[f]}</option>)}</select></label>
              <label className="block"><span className="text-gray-600">Next invoice date</span><input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={d.nextDate} onChange={(e) => setDraft({ nextDate: clampIsoDate(e.target.value) })} /></label>
              <label className="block"><span className="text-gray-600">Stop after (optional)</span><input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={d.endDate ?? ''} onChange={(e) => setDraft({ endDate: e.target.value ? clampIsoDate(e.target.value) : null })} /></label>
              <label className="block"><span className="text-gray-600">Terms</span><PaymentTermsSelect value={d.paymentTerms} documentDate={d.nextDate} onChange={(term) => setDraft({ paymentTerms: term })} className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm" /></label>
              <label className="block md:col-span-2"><span className="text-gray-600">Memo (appears on each invoice)</span><input className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={d.memo ?? ''} onChange={(e) => setDraft({ memo: e.target.value || null })} /></label>
              <label className="block"><span className="text-gray-600">Customer PO / Reference</span><input className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={d.customerPoNumber ?? ''} onChange={(e) => setDraft({ customerPoNumber: e.target.value || null })} /></label>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-400"><th className="pb-1">Description</th><th className="pb-1 w-20">Qty</th><th className="pb-1 w-32">Unit price</th><th className="pb-1 w-64">Revenue account</th><th className="pb-1 w-28">Tax</th><th className="w-8" /></tr></thead>
              <tbody>
                {d.lines.map((l, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="py-1 pr-2"><input className="w-full rounded border border-gray-300 px-2 py-1" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} /></td>
                    <td className="py-1 pr-2"><input type="number" min={0} step="any" className="w-full rounded border border-gray-300 px-2 py-1 text-right" value={l.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) || 0 })} /></td>
                    <td className="py-1 pr-2"><CurrencyInput valueCents={l.unitPriceCents} onChange={(cents) => setLine(i, { unitPriceCents: cents })} /></td>
                    <td className="py-1 pr-2"><Combobox options={saleLineAccountPickerOptions(accounts)} value={l.revenueAccountId ? String(l.revenueAccountId) : null} onChange={(v) => setLine(i, { revenueAccountId: v ? Number(v) : 0 })} placeholder="Select account…" /></td>
                    <td className="py-1 pr-2"><select className="w-full rounded border border-gray-300 bg-white px-2 py-1" value={l.taxCode ?? ''} onChange={(e) => setLine(i, { taxCode: e.target.value || null })}><option value="">No tax</option><option value="HST">HST 13%</option><option value="GST">GST 5%</option><option value="Exempt">Exempt</option></select></td>
                    <td className="py-1 text-right"><button type="button" onClick={() => setDraft({ lines: d.lines.filter((_, idx) => idx !== i) })} className="text-gray-400 hover:text-red-600" aria-label="Remove line">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setDraft({ lines: [...d.lines, emptyLine()] })} className="text-sm text-brand-600 hover:underline">+ Add line</button>
              <span className="ml-auto text-sm text-gray-600">Each invoice: <span className="font-semibold text-gray-900"><Money cents={templateTotalCents(d.lines)} /></span> before tax</span>
            </div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={d.autoEmail} onChange={(e) => setDraft({ autoEmail: e.target.checked })} /><span className="text-gray-700">When created, open the invoice in Outlook addressed to the customer</span></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={d.isActive} onChange={(e) => setDraft({ isActive: e.target.checked })} /><span className="text-gray-700">Active</span></label>
          </div>
        </Modal>
      )}
      <button type="button" onClick={() => setView({ kind: 'sales', tab: 'invoices' })} className="text-xs text-brand-600 hover:underline">Open the Invoices tab</button>
    </div>
  );
}
