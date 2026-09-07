import { useEffect, useState } from 'react';
import type { Account } from '@shared/domain/types';

/** A small stylized badge that nods at the card network's familiar colors (navy for Visa, the
 * red/orange overlapping circles for Mastercard) without reproducing either brand's actual
 * logotype/artwork — just enough to make the tab recognizable at a glance. */
function CardBrandBadge({ accountName }: { accountName: string }) {
  const name = accountName.toLowerCase();
  if (name.includes('visa')) {
    return (
      <span className="mr-1.5 inline-flex h-4 items-center rounded-sm bg-[#1a1f71] px-1 align-middle text-[9px] font-black italic tracking-tight text-white">
        VISA
      </span>
    );
  }
  if (name.includes('master')) {
    return (
      <span className="mr-1.5 inline-flex items-center align-middle" aria-hidden>
        <span className="h-3 w-3 rounded-full bg-[#eb001b]" />
        <span className="-ml-1.5 h-3 w-3 rounded-full bg-[#f79e1b] mix-blend-multiply" />
      </span>
    );
  }
  return <span className="mr-1">💳</span>;
}

/** Quick-access tabs for real bank/credit-card accounts (Chequing, Visa, Mastercard, etc.) —
 * shown above the General Ledger and Journal Entries list so an accountant can jump straight to
 * one account's activity without going through the full account combobox every time. */
export function AccountQuickTabs({
  selectedAccountId,
  onSelect,
  showAllTab = false,
}: {
  selectedAccountId: number | null;
  onSelect: (accountId: number | null) => void;
  showAllTab?: boolean;
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    window.api.accounts.list({ activeOnly: true }).then((r) => {
      if (!r.ok) return;
      setAccounts(r.data.filter((a) => a.accountSubtype === 'Cash and Bank' || a.accountSubtype === 'Credit Card'));
    });
  }, []);

  if (accounts.length === 0) return null;

  /* A light tint per account so the row reads as distinct places rather than one grey block — the
   * same treatment the Banking and Transactions tab rows use. Written out in full, not composed
   * from a template, so Tailwind's JIT scanner can find the classes. Assigned by position so a
   * given account keeps its colour between visits instead of shifting as the list changes. */
  const TINTS = [
    { rest: 'bg-sky-50 text-sky-800 hover:bg-sky-100', active: 'bg-sky-100 text-sky-900 ring-1 ring-sky-300' },
    { rest: 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100', active: 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300' },
    { rest: 'bg-violet-50 text-violet-800 hover:bg-violet-100', active: 'bg-violet-100 text-violet-900 ring-1 ring-violet-300' },
    { rest: 'bg-amber-50 text-amber-800 hover:bg-amber-100', active: 'bg-amber-100 text-amber-900 ring-1 ring-amber-300' },
    { rest: 'bg-rose-50 text-rose-800 hover:bg-rose-100', active: 'bg-rose-100 text-rose-900 ring-1 ring-rose-300' },
    { rest: 'bg-teal-50 text-teal-800 hover:bg-teal-100', active: 'bg-teal-100 text-teal-900 ring-1 ring-teal-300' },
    { rest: 'bg-cyan-50 text-cyan-800 hover:bg-cyan-100', active: 'bg-cyan-100 text-cyan-900 ring-1 ring-cyan-300' },
  ];

  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
      {showAllTab && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            selectedAccountId === null
              ? 'bg-brand-200 text-brand-900 ring-1 ring-brand-400'
              : 'bg-brand-50 text-brand-800 hover:bg-brand-100'
          }`}
        >
          All
        </button>
      )}
      {accounts.map((a, index) => (
        <button
          key={a.id}
          type="button"
          onClick={() => onSelect(a.id)}
          className={`flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            selectedAccountId === a.id ? TINTS[index % TINTS.length].active : TINTS[index % TINTS.length].rest
          }`}
        >
          {a.accountSubtype === 'Credit Card' ? <CardBrandBadge accountName={a.name} /> : <span className="mr-1">🏦</span>}
          {a.name}
          {a.accountNumber && <span className="ml-1 opacity-60">#{a.accountNumber}</span>}
        </button>
      ))}
    </div>
  );
}
