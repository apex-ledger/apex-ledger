import { useRef, useEffect, useMemo, useState } from 'react';
import type { Account, Contact } from '@shared/domain/types';
import type { RecurringTemplate } from '../../../preload/index';
import { AccountCombobox } from '../../components/AccountCombobox';
import { Money } from '../../components/Money';
import { useUiStore } from '../../app/store/uiStore';
import { taxCodeOptions } from '@shared/domain/ledger/taxCodes';
import { useCompanyTaxDefault } from '../../hooks/useCompanyTaxDefault';
import { ReportActions } from '../../components/ReportActions';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';

/** The saved templates behind Quick Entry's "recurring" list, editable in place.
 *
 * Templates could previously only be created (from a filled-in Quick Entry form) and deleted — a
 * template with the wrong category or a stale amount had to be thrown away and retyped. Rent going
 * up is the ordinary case, so the amount and category are the two things that most need editing,
 * and both are cells here.
 *
 * This is a list of templates, not scheduled postings: nothing is posted automatically. "Use" takes
 * you to Quick Entry with the template loaded, where you confirm the date and save. That is a
 * deliberate difference from QuickBooks' scheduled recurring transactions, and the note at the
 * bottom of the tab says so rather than letting the tab imply automation that does not exist.
 */


export function RecurringTransactionsTab() {
  // Anything on this screen can be taken to a spreadsheet, same as a report.
  const exportRef = useRef<HTMLDivElement>(null);
  // Tax codes ordered with the company's own province first — see useCompanyTaxDefault.
  const { province: taxProvince } = useCompanyTaxDefault();
  const TAX_CODE_OPTIONS = taxCodeOptions('all', taxProvince, { includeBlank: true });
  const setView = useUiStore((s) => s.setView);
  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [vendors, setVendors] = useState<Contact[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [filter, setFilter] = useState('');

  async function reload() {
    const [tplRes, acctRes, vendorRes] = await Promise.all([
      window.api.recurringTemplates.list(undefined),
      window.api.accounts.list({ activeOnly: true }),
      window.api.vendors.list({}),
    ]);
    setLoading(false);
    if (!tplRes.ok) return setError(tplRes.error);
    if (!acctRes.ok) return setError(acctRes.error);
    setTemplates(tplRes.data);
    setAccounts(acctRes.data);
    if (vendorRes.ok) setVendors(vendorRes.data.filter((v) => v.isActive));
  }

  useEffect(() => {
    void reload();
  }, []);

  const moneyOptions = useMemo(
    () =>
      accounts
        .filter((a) => a.accountType === 'Asset' || a.accountType === 'Liability')
        .map((a) => ({ value: String(a.id), label: a.name, sublabel: a.accountSubtype ?? a.accountType })),
    [accounts],
  );

  /** Category options depend on the row's own type — an expense template must not be able to point
   * at a revenue account, which is exactly the mis-edit an untyped list would invite. */
  function categoryOptionsFor(type: 'expense' | 'income') {
    return accounts
      .filter((a) => a.accountType === (type === 'expense' ? 'Expense' : 'Revenue'))
      .map((a) => ({ value: String(a.id), label: a.name, sublabel: a.accountSubtype ?? a.accountType }));
  }

  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  async function patchTemplate(template: RecurringTemplate, patch: Partial<RecurringTemplate>) {
    const unchanged = Object.entries(patch).every(([k, v]) => template[k as keyof RecurringTemplate] === v);
    if (unchanged) return;
    setBusyId(template.id);
    setTemplates((prev) => prev.map((t) => (t.id === template.id ? { ...t, ...patch } : t)));
    const result = await window.api.recurringTemplates.update({ id: template.id, patch });
    setBusyId(null);
    if (!result.ok) {
      setError(result.error);
      setTemplates((prev) => prev.map((t) => (t.id === template.id ? template : t)));
      return;
    }
    setError(null);
    setTemplates((prev) => prev.map((t) => (t.id === template.id ? result.data : t)));
  }

  /** Switching type would leave the category pointing at an account of the wrong type, so the
   * category is cleared in the same write — the row then shows an empty category, which reads as
   * "pick one" rather than silently keeping a nonsensical pairing. */
  async function changeType(template: RecurringTemplate, type: 'expense' | 'income') {
    if (type === template.type) return;
    const stillValid = accountsById.get(template.categoryAccountId)?.accountType === (type === 'expense' ? 'Expense' : 'Revenue');
    await patchTemplate(template, stillValid ? { type } : { type, categoryAccountId: 0 });
  }

  async function deleteTemplate(template: RecurringTemplate) {
    if (!window.confirm(`Delete the recurring transaction template “${template.name}”? This cannot be undone.`)) return;
    setBusyId(template.id);
    const result = await window.api.recurringTemplates.delete(template.id);
    setBusyId(null);
    if (!result.ok) return setError(result.error);
    setTemplates((prev) => prev.filter((t) => t.id !== template.id));
  }

  /** Vendor bill is not a third template type in the database — it is an expense template with a
   * vendor attached, so the category, amount and tax stay exactly as they are when switching. */
  async function changePostAs(template: RecurringTemplate, value: 'expense' | 'income' | 'bill') {
    if (value === 'bill') {
      if (vendors.length === 0) return setError('Add a vendor first (Expenses & Bills → Vendors), then set this template to post as a bill.');
      const stillValid = accountsById.get(template.categoryAccountId)?.accountType === 'Expense';
      await patchTemplate(template, { type: 'expense', billVendorId: vendors[0].id, billDueDays: template.billDueDays ?? 30, ...(stillValid ? {} : { categoryAccountId: 0 }) });
      return;
    }
    if (template.billVendorId) await patchTemplate(template, { billVendorId: null });
    await changeType(template, value);
  }

  async function createBill(template: RecurringTemplate) {
    setBusyId(template.id);
    setError(null);
    const result = await window.api.recurringTemplates.postBill({ id: template.id });
    setBusyId(null);
    if (!result.ok) return setError(result.error);
    setNotice(`Bill ${result.data.billNumber ?? ''} created for ${vendors.find((v) => v.id === template.billVendorId)?.name ?? 'the vendor'} — it is in Expenses & Bills → Vendor bills, unpaid, due ${result.data.dueDate}.`);
    await reload();
  }

  const shown = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return templates;
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(term) ||
        (t.description?.toLowerCase().includes(term) ?? false) ||
        (accountsById.get(t.categoryAccountId)?.name.toLowerCase().includes(term) ?? false),
    );
  }, [templates, filter, accountsById]);

  const cell =
    'w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm hover:border-gray-300 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500';

  return (
    <div ref={exportRef}>
      <ReportActions targetRef={exportRef} reportName="Recurring Transactions" />
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="w-full text-sm text-gray-500">
          Transactions you enter over and over — rent, insurance, a subscription — saved once and reused. Edit any cell directly;
          changes save as you leave the field.
        </p>
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter templates…"
          className="w-52 shrink-0 rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
      </div>

      {notice && (
        <div className="flex items-start justify-between gap-3 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="shrink-0 text-emerald-600 hover:underline">Dismiss</button>
        </div>
      )}
      {error && (
        <div className="flex items-start justify-between gap-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="shrink-0 text-red-500 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="rounded border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
              <th className="px-3 py-2">Template</th>
              <th className="w-28 px-3 py-2">Post as</th>
              <th className="px-3 py-2">Paid from / into · vendor</th>
              <th className="px-3 py-2">Category</th>
              <th className="w-32 px-3 py-2 text-right">Amount</th>
              <th className="w-36 px-3 py-2">Tax</th>
              <th className="w-32 px-3 py-2">Repeat</th>
              <th className="w-36 px-3 py-2">Next due</th>
              <th className="w-28 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-sm text-gray-400">
                  Loading…
                </td>
              </tr>
            )}

            {!loading && shown.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-5 text-center text-sm text-gray-400">
                  {templates.length === 0 ? (
                    <>
                      No templates yet. Fill in a transaction on{' '}
                      <button
                        type="button"
                        className="font-medium text-brand-600 hover:underline"
                        onClick={() => setView({ kind: 'quickEntry', type: 'expense' })}
                      >
                        Quick Entry
                      </button>{' '}
                      and choose "Save as Template" to create one.
                    </>
                  ) : (
                    'No templates match that filter.'
                  )}
                </td>
              </tr>
            )}

            {shown.map((t) => (
              <tr key={t.id} className={`border-b border-gray-100 last:border-0 ${busyId === t.id ? 'opacity-60' : ''}`}>
                <td className="px-3 py-1.5">
                  <input
                    type="text"
                    className={`${cell} font-medium`}
                    defaultValue={t.name}
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      if (!next) {
                        e.target.value = t.name;
                        return;
                      }
                      void patchTemplate(t, { name: next });
                    }}
                  />
                  <input
                    type="text"
                    className={`${cell} text-xs text-gray-500`}
                    placeholder="Description…"
                    defaultValue={t.description ?? ''}
                    onBlur={(e) => void patchTemplate(t, { description: e.target.value.trim() || null })}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <select
                    className={cell}
                    value={t.billVendorId ? 'bill' : t.type}
                    onChange={(e) => void changePostAs(t, e.target.value as 'expense' | 'income' | 'bill')}
                    title="Paid expense: money leaves the account now. Vendor bill: booked to Accounts Payable, paid later from Vendor bills."
                  >
                    <option value="expense">Paid expense</option>
                    <option value="income">Income</option>
                    <option value="bill">Vendor bill</option>
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  {t.billVendorId ? (
                    <div className="flex items-center gap-1.5">
                      <select className={cell} value={String(t.billVendorId)} onChange={(e) => void patchTemplate(t, { billVendorId: Number(e.target.value) })} aria-label="Vendor">
                        {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                      <label className="flex shrink-0 items-center gap-1 text-xs text-gray-500">
                        due in
                        <input type="number" min="0" max="365" className={`${cell} w-14 text-right`} defaultValue={t.billDueDays ?? 30} onBlur={(e) => void patchTemplate(t, { billDueDays: Math.max(0, Number(e.target.value) || 0) })} aria-label="Days until due" />
                        days
                      </label>
                    </div>
                  ) : (
                    <AccountCombobox
                      options={moneyOptions}
                      value={t.moneyAccountId ? String(t.moneyAccountId) : null}
                      onChange={(v) => {
                        if (v) void patchTemplate(t, { moneyAccountId: Number(v) });
                      }}
                      placeholder="Select account…"
                      accounts={accounts}
                      addNewLabel="+ New account"
                      onAccountCreated={(created) => {
                        setAccounts((prev) => [...prev, created]);
                        void patchTemplate(t, { moneyAccountId: created.id });
                      }}
                    />
                  )}
                </td>
                <td className="px-3 py-1.5">
                  <AccountCombobox
                    options={categoryOptionsFor(t.type)}
                    value={t.categoryAccountId ? String(t.categoryAccountId) : null}
                    onChange={(v) => {
                      if (v) void patchTemplate(t, { categoryAccountId: Number(v) });
                    }}
                    placeholder="Select category…"
                    accounts={accounts}
                    initialType={t.type === 'expense' ? 'Expense' : 'Revenue'}
                    addNewLabel="+ New category"
                    onAccountCreated={(created) => {
                      setAccounts((prev) => [...prev, created]);
                      void patchTemplate(t, { categoryAccountId: created.id });
                    }}
                  />
                </td>
                <td className="px-3 py-1.5 text-right">
                  {/* Deliberately not CurrencyInput: that fires onChange per keystroke, which here
                      would mean a database write for every digit typed. Parsing on blur matches
                      how every other cell in this table commits. */}
                  <input
                    type="text"
                    inputMode="decimal"
                    className={`${cell} text-right tabular-nums`}
                    defaultValue={(t.amountCents / 100).toFixed(2)}
                    onBlur={(e) => {
                      const parsed = Number(e.target.value.replace(/[^0-9.-]/g, ''));
                      if (!Number.isFinite(parsed)) {
                        e.target.value = (t.amountCents / 100).toFixed(2);
                        return;
                      }
                      const cents = Math.round(parsed * 100);
                      e.target.value = (cents / 100).toFixed(2);
                      void patchTemplate(t, { amountCents: cents });
                    }}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <select
                    className={cell}
                    value={t.taxCode ?? ''}
                    onChange={(e) => void patchTemplate(t, { taxCode: e.target.value || null })}
                  >
                    {TAX_CODE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <select className={cell} value={t.scheduleFrequency ?? ''} onChange={(e) => void patchTemplate(t, { scheduleFrequency: (e.target.value || null) as RecurringTemplate['scheduleFrequency'] })}>
                    <option value="">No reminder</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annually">Annually</option>
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <input type="date" min={DATE_MIN} max={DATE_MAX} className={cell} value={t.nextDueDate ?? ''} disabled={!t.scheduleFrequency} onChange={(e) => void patchTemplate(t, { nextDueDate: clampIsoDate(e.target.value) || null })}/>
                </td>
                <td className="px-3 py-1.5 text-right">
                  {t.billVendorId ? (
                    <button
                      type="button"
                      disabled={busyId === t.id}
                      className="mr-3 text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
                      title="Create this month's bill: booked to Accounts Payable now, paid later from Vendor bills"
                      onClick={() => void createBill(t)}
                    >
                      Create bill
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="mr-3 text-xs font-medium text-brand-600 hover:underline"
                      title="Open Quick Entry with this template loaded"
                      onClick={() => setView({ kind: 'quickEntry', type: t.type, templateId: t.id })}
                    >
                      Use
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busyId === t.id}
                    onClick={() => void deleteTemplate(t)}
                    className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {templates.length > 0 && (
        <p className="text-xs text-gray-400">
          {templates.length} template{templates.length === 1 ? '' : 's'}, totalling{' '}
          <Money cents={templates.reduce((sum, t) => sum + t.amountCents, 0)} /> if every one were posted once. Nothing here posts on
          its own — "Use" opens Quick Entry with the template loaded so you confirm the date and save it yourself.
        </p>
      )}
    </div>
    </div>
  );
}
