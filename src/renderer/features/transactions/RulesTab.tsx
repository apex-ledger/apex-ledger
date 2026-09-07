import { useRef, useEffect, useMemo, useState } from 'react';
import type { Account, CategoryRule, TaxCode } from '@shared/domain/types';
import { AccountCombobox } from '../../components/AccountCombobox';
import { taxCodeOptions } from '@shared/domain/ledger/taxCodes';
import { useCompanyTaxDefault } from '../../hooks/useCompanyTaxDefault';
import { ReportActions } from '../../components/ReportActions';

/** Categorization rules as an editable table rather than a modal with a form above it.
 *
 * The modal version (still reachable from Bank Import) loads one rule at a time into a form; with
 * a few dozen rules that is the wrong shape — you want to scan them, spot the one sending Costco
 * to the wrong category, and fix it where it sits. Every cell here commits on blur, so there is no
 * save button to forget and no edit mode to be in.
 */


const BLANK = { pattern: '', accountId: '', taxCode: '', priority: '0' };

export function RulesTab() {
  // Anything on this screen can be taken to a spreadsheet, same as a report.
  const exportRef = useRef<HTMLDivElement>(null);
  // Tax codes ordered with the company's own province first — see useCompanyTaxDefault.
  const { province: taxProvince } = useCompanyTaxDefault();
  const TAX_CODE_OPTIONS = taxCodeOptions('all', taxProvince, { includeBlank: true });
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(BLANK);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    void (async () => {
      const [ruleRes, acctRes] = await Promise.all([
        window.api.categoryRules.list(),
        window.api.accounts.list({ activeOnly: true }),
      ]);
      setLoading(false);
      if (!ruleRes.ok) return setError(ruleRes.error);
      if (!acctRes.ok) return setError(acctRes.error);
      setRules(ruleRes.data);
      setAccounts(acctRes.data);
    })();
  }, []);

  // A rule can also point at a bank/credit-card account, so a recurring transfer or card payment
  // can be auto-coded rather than corrected by hand on every import.
  const categoryOptions = useMemo(() => {
    const transfer = accounts.filter(
      (a) => a.accountSubtype === 'Cash and Bank' || a.accountSubtype === 'Credit Card' || a.isTransferEligible,
    );
    const transferIds = new Set(transfer.map((a) => a.id));
    return [...accounts.filter((a) => a.accountType === 'Expense' || a.accountType === 'Revenue'), ...transfer].map((a) => ({
      value: String(a.id),
      label: a.name,
      sublabel: transferIds.has(a.id) ? 'Transfer / card payment' : a.accountType,
    }));
  }, [accounts]);

  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  /** Writes one field of one rule. Called from every cell's blur/change, so the table has no
   * separate save step — and a rejected write puts the previous value back rather than leaving the
   * cell showing something the database never accepted. */
  async function patchRule(
    rule: CategoryRule,
    patch: Partial<Pick<CategoryRule, 'pattern' | 'accountId' | 'taxCode' | 'priority'>>,
  ) {
    const unchanged = Object.entries(patch).every(([k, v]) => rule[k as keyof CategoryRule] === v);
    if (unchanged) return;
    setBusyId(rule.id);
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, ...patch } : r)));
    const result = await window.api.categoryRules.update({ id: rule.id, patch });
    setBusyId(null);
    if (!result.ok) {
      setError(result.error);
      setRules((prev) => prev.map((r) => (r.id === rule.id ? rule : r)));
      return;
    }
    setError(null);
    setRules((prev) => prev.map((r) => (r.id === rule.id ? result.data : r)));
  }

  async function addRule() {
    if (!draft.pattern.trim()) return setError('Enter the text to match against the description.');
    if (!draft.accountId) return setError('Choose which category the rule posts to.');
    setAdding(true);
    const result = await window.api.categoryRules.create({
      pattern: draft.pattern.trim(),
      accountId: Number(draft.accountId),
      taxCode: (draft.taxCode || null) as TaxCode | null,
      priority: Number(draft.priority) || 0,
    });
    setAdding(false);
    if (!result.ok) return setError(result.error);
    setError(null);
    setRules((prev) => [...prev, result.data]);
    setDraft(BLANK);
  }

  async function deleteRule(rule: CategoryRule) {
    if (!window.confirm(`Delete the category rule “${rule.pattern}”? This cannot be undone.`)) return;
    setBusyId(rule.id);
    const result = await window.api.categoryRules.delete(rule.id);
    setBusyId(null);
    if (!result.ok) return setError(result.error);
    setRules((prev) => prev.filter((r) => r.id !== rule.id));
  }

  const shown = useMemo(() => {
    const term = filter.trim().toLowerCase();
    const sorted = [...rules].sort((a, b) => b.priority - a.priority || a.pattern.localeCompare(b.pattern));
    if (!term) return sorted;
    return sorted.filter(
      (r) => r.pattern.toLowerCase().includes(term) || (accountsById.get(r.accountId)?.name.toLowerCase().includes(term) ?? false),
    );
  }, [rules, filter, accountsById]);

  const cell =
    'w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm hover:border-gray-300 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500';

  return (
    <div ref={exportRef}>
      <ReportActions targetRef={exportRef} reportName="Categorization Rules" />
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="w-full text-sm text-gray-500">
          When an imported description contains the text on the left, the transaction is coded to that category automatically.
          Correcting a category during Bank Import also writes a rule here. Edit any cell directly — changes save as you leave the field.
        </p>
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter rules…"
          className="w-52 shrink-0 rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
      </div>

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
              <th className="px-3 py-2">Description contains</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Tax</th>
              <th className="w-24 px-3 py-2" title="When two rules match the same line, the higher priority wins.">
                Priority
              </th>
              <th className="w-20 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {/* An always-present blank row, so adding a rule never needs a button press first. */}
            <tr className="border-b border-gray-200 bg-brand-50/40">
              <td className="px-3 py-1.5">
                <input
                  type="text"
                  className={cell}
                  placeholder="e.g. COSTCO"
                  value={draft.pattern}
                  onChange={(e) => setDraft((d) => ({ ...d, pattern: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void addRule();
                  }}
                />
              </td>
              <td className="px-3 py-1.5">
                <AccountCombobox
                  options={categoryOptions}
                  value={draft.accountId || null}
                  onChange={(v) => setDraft((d) => ({ ...d, accountId: v ?? '' }))}
                  placeholder="Select category…"
                  accounts={accounts}
                  addNewLabel="+ New category"
                  onAccountCreated={(created) => {
                    setAccounts((prev) => [...prev, created]);
                    setDraft((d) => ({ ...d, accountId: String(created.id) }));
                  }}
                />
              </td>
              <td className="px-3 py-1.5">
                <select className={cell} value={draft.taxCode} onChange={(e) => setDraft((d) => ({ ...d, taxCode: e.target.value }))}>
                  {TAX_CODE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-3 py-1.5">
                <input
                  type="number"
                  className={`${cell} tabular-nums`}
                  value={draft.priority}
                  onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))}
                />
              </td>
              <td className="px-3 py-1.5 text-right">
                <button
                  type="button"
                  disabled={adding}
                  onClick={() => void addRule()}
                  className="rounded bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {adding ? 'Adding…' : 'Add'}
                </button>
              </td>
            </tr>

            {loading && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-400">
                  Loading…
                </td>
              </tr>
            )}

            {!loading && shown.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-400">
                  {rules.length === 0
                    ? 'No rules yet — add one above, or correct a category during Bank Import to learn one automatically.'
                    : 'No rules match that filter.'}
                </td>
              </tr>
            )}

            {shown.map((rule) => (
              <tr key={rule.id} className={`border-b border-gray-100 last:border-0 ${busyId === rule.id ? 'opacity-60' : ''}`}>
                <td className="px-3 py-1.5">
                  <input
                    type="text"
                    className={`${cell} font-mono text-xs`}
                    defaultValue={rule.pattern}
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      // An empty pattern would match every line, so refuse it and restore instead.
                      if (!next) {
                        e.target.value = rule.pattern;
                        return;
                      }
                      void patchRule(rule, { pattern: next });
                    }}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <AccountCombobox
                    options={categoryOptions}
                    value={String(rule.accountId)}
                    onChange={(v) => {
                      if (v) void patchRule(rule, { accountId: Number(v) });
                    }}
                    placeholder="Select category…"
                    accounts={accounts}
                    addNewLabel="+ New category"
                    onAccountCreated={(created) => {
                      setAccounts((prev) => [...prev, created]);
                      void patchRule(rule, { accountId: created.id });
                    }}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <select
                    className={cell}
                    value={rule.taxCode ?? ''}
                    onChange={(e) => void patchRule(rule, { taxCode: (e.target.value || null) as TaxCode | null })}
                  >
                    {TAX_CODE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="number"
                    className={`${cell} tabular-nums`}
                    defaultValue={rule.priority}
                    onBlur={(e) => void patchRule(rule, { priority: Number(e.target.value) || 0 })}
                  />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <button
                    type="button"
                    disabled={busyId === rule.id}
                    onClick={() => void deleteRule(rule)}
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

      <p className="text-xs text-gray-400">
        {rules.length} rule{rules.length === 1 ? '' : 's'}. Higher priority wins when two rules match the same description.
      </p>
    </div>
    </div>
  );
}
