import { useEffect, useMemo, useState } from 'react';
import type { Account } from '@shared/domain/types';

/** The Chart of Accounts as a printable list — QuickBooks calls this "Account List". The Chart of
 * Accounts page itself is an editing surface (inline actions, opening balances, filters); an
 * accountant asking for the account list wants the flat inventory to check against, with the GIFI
 * code visible, so this is read-only and grouped by type rather than a second editor. */
export function AccountListPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await window.api.accounts.list({ activeOnly: !includeInactive });
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) return setError(res.error);
      setError(null);
      setAccounts(res.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [includeInactive]);

  const groups = useMemo(() => {
    const order = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
    const by = new Map<string, Account[]>();
    for (const a of accounts) {
      const k = a.accountType ?? 'Other';
      if (!by.has(k)) by.set(k, []);
      by.get(k)!.push(a);
    }
    for (const list of by.values()) list.sort((x, y) => x.code.localeCompare(y.code));
    return [...by.entries()].sort((a, b) => {
      const ai = order.indexOf(a[0]);
      const bi = order.indexOf(b[0]);
      return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi);
    });
  }, [accounts]);

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Every account in the chart, grouped by type, with its GIFI code — {accounts.length} account
          {accounts.length === 1 ? '' : 's'}.
        </p>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
          Include inactive
        </label>
      </div>

      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <p className="text-sm text-gray-500">Loading accounts…</p>}

      {!loading && !error && groups.map(([type, list]) => (
        <div key={type}>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{type} — {list.length}</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-400">
                <th className="px-3 py-1.5 text-left font-medium">Name</th>
                <th className="px-3 py-1.5 text-left font-medium">Subtype</th>
                <th className="px-3 py-1.5 text-left font-medium">GIFI</th>
                <th className="px-3 py-1.5 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id} className="border-b border-gray-100">
                  <td className="px-3 py-1.5">{a.name}</td>
                  <td className="px-3 py-1.5 text-gray-500">{a.accountSubtype ?? '—'}</td>
                  <td className="px-3 py-1.5 tabular-nums text-gray-500">{a.gifiCode ?? '—'}</td>
                  <td className="px-3 py-1.5 text-gray-500">{a.isActive ? 'Active' : 'Inactive'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
