import { useEffect, useState } from 'react';
import type { Account, CategoryRule, TaxCode } from '@shared/domain/types';
import { Modal } from '../../components/Modal';
import { Combobox } from '../../components/Combobox';
import { AccountFormModal } from '../chart-of-accounts/AccountFormModal';
import { taxCodeOptions } from '@shared/domain/ledger/taxCodes';
import { useCompanyTaxDefault } from '../../hooks/useCompanyTaxDefault';


interface CategoryRulesModalProps {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  rules: CategoryRule[];
  onRulesChanged: (rules: CategoryRule[]) => void;
  /** Adds a freshly-created account to the caller's own account list — see the "+ New Account"
   * link below, which lets a rule point at a category that doesn't exist yet without leaving this
   * modal (same reasoning as the same link on a Bank Import row: leaving to Chart of Accounts
   * would otherwise risk losing whatever else was mid-edit here). */
  onAccountCreated: (account: Account) => void;
  /** Pre-fills the "Add a Rule" pattern field on open — the fast path from an uncategorized Bank
   * Import row's "+ New Rule" link, so the reviewer doesn't have to retype the description they're
   * already looking at. */
  initialPattern?: string;
}

const emptyForm = { id: null as number | null, pattern: '', accountId: '' as string, taxCode: '' as string, priority: '0' };

export function CategoryRulesModal({ open, onClose, accounts, rules, onRulesChanged, onAccountCreated, initialPattern }: CategoryRulesModalProps) {
  // Tax codes ordered with the company's own province first — see useCompanyTaxDefault.
  const { province: taxProvince } = useCompanyTaxDefault();
  const TAX_CODE_OPTIONS = taxCodeOptions('all', taxProvince, { includeBlank: true });
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);

  useEffect(() => {
    if (open && initialPattern) setForm((f) => ({ ...f, pattern: initialPattern }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPattern]);

  // A rule needs to be able to point at a transfer target too (e.g. "Online transfer" -> Savings),
  // not just an Expense/Revenue category — otherwise a recurring transfer between the user's own
  // accounts could never be auto-categorized, only one-off-corrected on every single import.
  const transferAccounts = accounts.filter((a) => a.accountSubtype === 'Cash and Bank' || a.accountSubtype === 'Credit Card' || a.isTransferEligible);
  const categoryAccountOptions = [...accounts.filter((a) => a.accountType === 'Expense' || a.accountType === 'Revenue'), ...transferAccounts].map((a) => ({
    value: String(a.id),
    label: a.name,
    sublabel: transferAccounts.includes(a) ? 'Money transfer between accounts / credit-card payment' : a.accountType,
  }));

  const accountsById = new Map(accounts.map((a) => [a.id, a]));

  function startEdit(rule: CategoryRule) {
    setForm({ id: rule.id, pattern: rule.pattern, accountId: String(rule.accountId), taxCode: rule.taxCode ?? '', priority: String(rule.priority) });
    setError(null);
  }

  async function handleSave() {
    setError(null);
    if (!form.pattern.trim()) {
      setError('Enter text to match against the transaction description.');
      return;
    }
    if (!form.accountId) {
      setError('Choose which category this should post to.');
      return;
    }
    setSaving(true);
    const payload = {
      pattern: form.pattern.trim(),
      accountId: Number(form.accountId),
      taxCode: (form.taxCode || null) as TaxCode | null,
      priority: Number(form.priority) || 0,
    };
    const result = form.id
      ? await window.api.categoryRules.update({ id: form.id, patch: payload })
      : await window.api.categoryRules.create(payload);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const next = form.id ? rules.map((r) => (r.id === result.data.id ? result.data : r)) : [...rules, result.data];
    onRulesChanged(next);
    setForm(emptyForm);
  }

  async function handleDelete(id: number) {
    const rule = rules.find((item) => item.id === id);
    if (!window.confirm(`Delete the category rule${rule ? ` “${rule.pattern}”` : ''}? This cannot be undone.`)) return;
    setDeletingId(id);
    const result = await window.api.categoryRules.delete(id);
    setDeletingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onRulesChanged(rules.filter((r) => r.id !== id));
    if (form.id === id) setForm(emptyForm);
  }

  const sortedRules = [...rules].sort((a, b) => b.priority - a.priority || a.pattern.localeCompare(b.pattern));

  return (
    <Modal
      open={open}
      onClose={() => {
        setForm(emptyForm);
        setError(null);
        onClose();
      }}
      title="Categorization Rules"
      wide
    >
      <p className="mb-3 text-sm text-gray-500">
        Automatically categorize future bank/credit-card transactions whose description contains the text below — same idea as QuickBooks
        Bank Rules. Rules also get created automatically whenever you correct a suggested category during import; this is where you can
        review, add, or fix them any time.
      </p>

      {sortedRules.length > 0 && (
        <div className="mb-3">
          <label className="block text-sm">
            <span className="text-gray-600">Edit an existing rule</span>
            <div className="mt-1 w-80">
              <Combobox
                options={sortedRules.map((r) => ({
                  value: String(r.id),
                  label: r.pattern,
                  sublabel: accountsById.get(r.accountId)?.name,
                }))}
                value={form.id !== null ? String(form.id) : null}
                onChange={(v) => {
                  if (!v) {
                    setForm(emptyForm);
                    return;
                  }
                  const rule = rules.find((r) => r.id === Number(v));
                  if (rule) startEdit(rule);
                }}
                placeholder="Select a rule to load into the form below…"
              />
            </div>
          </label>
        </div>
      )}

      <div className="mb-3 rounded border border-gray-200 bg-gray-50 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{form.id ? 'Edit Rule' : 'Add a Rule'}</div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="text-gray-600">Description contains</span>
            <input
              type="text"
              className="mt-1 w-56 rounded border border-gray-300 px-2 py-1.5 text-sm"
              placeholder="e.g. STARBUCKS"
              value={form.pattern}
              onChange={(e) => setForm((f) => ({ ...f, pattern: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Categorize as</span>
            <div className="mt-1 w-56">
              <Combobox options={categoryAccountOptions} value={form.accountId || null} onChange={(v) => setForm((f) => ({ ...f, accountId: v ?? '' }))} placeholder="Select category…" />
            </div>
            <button
              type="button"
              onClick={() => setShowAddAccountModal(true)}
              className="mt-1 text-xs font-medium text-brand-600 hover:underline"
              title="Add a new Chart of Accounts category without leaving this rule"
            >
              + New Account
            </button>
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Tax code</span>
            <select
              className="mt-1 w-44 rounded border border-gray-300 px-2 py-1.5 text-sm"
              value={form.taxCode}
              onChange={(e) => setForm((f) => ({ ...f, taxCode: e.target.value }))}
            >
              {TAX_CODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-gray-600" title="When two rules both match, the higher priority wins.">
              Priority
            </span>
            <input
              type="number"
              className="mt-1 w-20 rounded border border-gray-300 px-2 py-1.5 text-sm"
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="rounded bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : form.id ? 'Save Changes' : 'Add Rule'}
            </button>
            {form.id && (
              <button type="button" onClick={() => setForm(emptyForm)} className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">
                Cancel
              </button>
            )}
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {sortedRules.length === 0 ? (
        <p className="text-sm text-gray-400">No rules yet. Add one above, or correct a category during Bank Import to learn one automatically.</p>
      ) : (
        <div className="max-h-72 overflow-y-auto rounded border border-gray-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50">
              <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                <th className="px-3 py-2">Description contains</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Tax</th>
                <th className="px-3 py-2">Priority</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {sortedRules.map((rule) => (
                <tr key={rule.id} className="border-b border-gray-100 text-gray-700 last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{rule.pattern}</td>
                  <td className="px-3 py-2">{accountsById.get(rule.accountId)?.name ?? '—'}</td>
                  <td className="px-3 py-2">{TAX_CODE_OPTIONS.find((o) => o.value === (rule.taxCode ?? ''))?.label ?? '—'}</td>
                  <td className="px-3 py-2 tabular-nums">{rule.priority}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => startEdit(rule)} className="mr-3 text-xs font-medium text-brand-600 hover:underline">
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={deletingId === rule.id}
                      onClick={() => handleDelete(rule.id)}
                      className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                    >
                      {deletingId === rule.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AccountFormModal
        open={showAddAccountModal}
        onClose={() => setShowAddAccountModal(false)}
        onSaved={(account) => {
          onAccountCreated(account);
          setForm((f) => ({ ...f, accountId: String(account.id) }));
          setShowAddAccountModal(false);
        }}
      />
    </Modal>
  );
}
