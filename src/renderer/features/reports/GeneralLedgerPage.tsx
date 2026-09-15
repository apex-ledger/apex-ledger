import { useEffect, useMemo, useState } from 'react';
import { DateInput } from '../../components/DateInput';
import type { Account, CompanyInfo } from '@shared/domain/types';
import { Combobox } from '../../components/Combobox';
import { Money } from '../../components/Money';
import { AccountQuickTabs } from '../../components/AccountQuickTabs';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { accountPickerOptions } from '../../utils/accountLabel';
import { useUiStore, type View } from '../../app/store/uiStore';
import { openOriginalEntry } from '../../utils/openOriginalEntry';
import { OpenEntryButton } from '../../components/OpenEntryButton';
import { userAuditStyle } from '../../utils/userAuditColor';
import { EnteredTd, EnteredText, EnteredTh } from '../../components/EnteredCell';
import { localIsoDate } from '@shared/domain/dates/localDate';
import {
  LEDGER_ENTRY_GROUP_LABELS,
  ledgerEntryGroup,
  type GeneralLedgerResult,
  type LedgerEntryGroup,
} from '@shared/domain/ledger/generalLedger';

function todayIso(): string {
  return localIsoDate();
}
function yearStartIso(): string {
  return `${todayIso().slice(0, 4)}-01-01`;
}

function reportPeriodLabel(dateFrom: string, dateTo: string): string {
  const start = new Date(`${dateFrom}T00:00:00Z`);
  const end = new Date(`${dateTo}T00:00:00Z`);
  const month = new Intl.DateTimeFormat('en-CA', { month: 'long', timeZone: 'UTC' });
  const startMonth = month.format(start);
  const endMonth = month.format(end);
  const startYear = start.getUTCFullYear();
  const endYear = end.getUTCFullYear();
  if (startYear === endYear && startMonth === endMonth) return `${startMonth}, ${startYear}`;
  if (startYear === endYear) return `${startMonth} - ${endMonth}, ${startYear}`;
  return `${startMonth}, ${startYear} - ${endMonth}, ${endYear}`;
}

function exchangeRateLabel(rate: number | null): string {
  if (rate === null) return '—';
  return rate.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

export function generalLedgerAccountLabel(account: Account): string {
  return account.accountNumber ? `${account.name} · Account # ${account.accountNumber}` : account.name;
}

export function GeneralLedgerPage() {
  const setView = useUiStore((s) => s.setView);
  const view = useUiStore((s) => s.view);
  const drillDown = view.kind === 'report' && view.report === 'generalLedger' ? view.drillDown : undefined;
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [accountId, setAccountId] = useState<number | null>(drillDown?.accountId ?? null);
  const [everyAccount, setEveryAccount] = useState(false);
  const [dateFrom, setDateFrom] = useState(drillDown?.dateFrom ?? yearStartIso());
  const [dateTo, setDateTo] = useState(drillDown?.dateTo ?? todayIso());
  const [group, setGroup] = useState<LedgerEntryGroup | null>(null);
  const { data: identity } = useIpcQuery(() => window.api.access.getIdentity(), []);

  useEffect(() => {
    window.api.accounts.list({ activeOnly: true }).then((r) => r.ok && setAccounts(r.data));
    window.api.company.get().then((r) => r.ok && setCompany(r.data));
  }, []);

  // Arriving here by clicking a balance elsewhere (see the drillDown doc comment on the View type)
  // overrides whatever was already selected — each click is a fresh "show me this" request, not an
  // edit to whatever the reviewer was previously browsing.
  useEffect(() => {
    if (!drillDown) return;
    setEveryAccount(false);
    setAccountId(drillDown.accountId);
    if (drillDown.dateFrom) setDateFrom(drillDown.dateFrom);
    if (drillDown.dateTo) setDateTo(drillDown.dateTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drillDown?.accountId, drillDown?.dateFrom, drillDown?.dateTo]);

  const { data, loading, error } = useIpcQuery<GeneralLedgerResult[] | undefined>(
    () => {
      if (everyAccount) return window.api.reports.generalLedgerAllAccounts({ dateFrom, dateTo });
      if (accountId === null) return Promise.resolve({ ok: true as const, data: undefined });
      return window.api.reports.generalLedger({ accountId, dateFrom, dateTo }).then((r) => (r.ok ? { ok: true as const, data: [r.data] } : r));
    },
    [everyAccount, accountId, dateFrom, dateTo],
  );

  const allLines = useMemo(() => (data ?? []).flatMap((result) => result.lines), [data]);

  // Only the groups these accounts actually have get a button — a filter that can only ever return
  // nothing is a dead control, and on most accounts three of the six never apply.
  const groupCounts = useMemo(() => {
    const counts = new Map<LedgerEntryGroup, number>();
    for (const line of allLines) {
      const key = ledgerEntryGroup(line.transactionType);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [allLines]);

  return (
    <div className="w-full">
      <AccountQuickTabs selectedAccountId={everyAccount ? null : accountId} onSelect={(id) => { setEveryAccount(false); setAccountId(id); }} />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="w-72">
          <Combobox
            options={accountPickerOptions(accounts)}
            value={!everyAccount && accountId !== null ? String(accountId) : null}
            onChange={(v) => { setEveryAccount(false); setAccountId(v ? Number(v) : null); }}
            placeholder="Select an account…"
          />
        </div>
        {/* The bound General Ledger: every account that moved, in order, instead of picking them
          * off the list one at a time — which is how a year-end review actually reads a ledger. */}
        <button
          type="button"
          onClick={() => setEveryAccount((v) => !v)}
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${everyAccount ? 'bg-brand-800 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          All accounts
        </button>
        <DateInput value={dateFrom} onChange={setDateFrom} className="w-32" />
        <span className="text-sm text-gray-400">to</span>
        <DateInput value={dateTo} onChange={setDateTo} className="w-32" />
        <span className="text-xs text-gray-500"><span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800">Current user</span> · other colors identify other users</span>
      </div>

      {allLines.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5" data-export-skip>
          <span className="mr-1 text-xs font-medium text-gray-500">Show</span>
          <button
            type="button"
            onClick={() => setGroup(null)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${group === null ? 'bg-brand-800 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            Everything ({allLines.length})
          </button>
          {(Object.keys(LEDGER_ENTRY_GROUP_LABELS) as LedgerEntryGroup[])
            .filter((key) => (groupCounts.get(key) ?? 0) > 0)
            .map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setGroup(key)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${group === key ? 'bg-brand-800 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {LEDGER_ENTRY_GROUP_LABELS[key]} ({groupCounts.get(key)})
              </button>
            ))}
        </div>
      )}

      {!everyAccount && !accountId && <p className="text-sm text-gray-400">Choose an account to view its ledger, or pick All accounts.</p>}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && (everyAccount || accountId) && <p className="text-sm text-gray-400">Loading…</p>}
      {data && data.length === 0 && <p className="text-sm text-gray-400">No account has a balance or a posted entry in this period.</p>}

      <div className="space-y-4">
        {(data ?? []).map((result) => (
          <AccountLedgerTable
            key={result.account.id}
            result={result}
            group={group}
            company={company}
            dateFrom={dateFrom}
            dateTo={dateTo}
            currentUserName={identity?.name}
            setView={setView}
          />
        ))}
      </div>
    </div>
  );
}

function AccountLedgerTable({
  result,
  group,
  company,
  dateFrom,
  dateTo,
  currentUserName,
  setView,
}: {
  result: GeneralLedgerResult;
  group: LedgerEntryGroup | null;
  company: CompanyInfo | null;
  dateFrom: string;
  dateTo: string;
  currentUserName: string | undefined;
  setView: (view: View) => void;
}) {
  const shownLines = group === null ? result.lines : result.lines.filter((line) => ledgerEntryGroup(line.transactionType) === group);
  const totals = shownLines.reduce(
    (sum, line) => ({ debitCents: sum.debitCents + line.debitCents, creditCents: sum.creditCents + line.creditCents }),
    { debitCents: 0, creditCents: 0 },
  );
  // A filtered account with nothing left would otherwise print as a heading over an empty table.
  if (group !== null && shownLines.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded border border-gray-200 bg-white">
      <table className="w-full min-w-[1620px] border-collapse text-sm">
        <caption className="caption-top border-b border-gray-100 bg-white px-3 py-2 text-center">
          <span className="block text-sm text-gray-600" data-export-row>{company?.displayName || company?.legalName || 'Company'}</span>
          <span className="block text-lg font-semibold text-gray-900">General Ledger</span>
          <span className="block text-sm font-medium text-gray-700" data-export-row>{reportPeriodLabel(dateFrom, dateTo)}</span>
          <span className="mt-1 block text-sm text-gray-500" data-export-row>{generalLedgerAccountLabel(result.account)}</span>
          {group !== null && (
            <span className="mt-1 block text-sm font-medium text-brand-800" data-export-row>
              {LEDGER_ENTRY_GROUP_LABELS[group]} only — {shownLines.length} of {result.lines.length} lines. Opening, Balance and Closing stay the account's own, across every entry.
            </span>
          )}
        </caption>
        <thead className="bg-gray-50">
          <tr>
            <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600">Date</th>
            <EnteredTh className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600" />
            <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600">Transaction Type</th>
            <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600">#</th>
            <th className="border-b border-gray-200 px-3 py-2 text-center font-medium text-gray-600">Adj</th>
            <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600">Name</th>
            <th data-export-skip className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600" title="Screen only — not included in Excel export or Copy">User</th>
            <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600">Memo/Description</th>
            <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600">Split</th>
            <th className="border-b border-gray-200 px-3 py-2 text-right font-medium text-gray-600">Debit</th>
            <th className="border-b border-gray-200 px-3 py-2 text-right font-medium text-gray-600">Credit</th>
            <th className="border-b border-gray-200 px-3 py-2 text-right font-medium text-gray-600">Balance</th>
            <th className="border-b border-gray-200 px-3 py-2 text-right font-medium text-gray-600">Tax Amount</th>
            <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600">Currency</th>
            <th className="border-b border-gray-200 px-3 py-2 text-right font-medium text-gray-600">Exchange Rate</th>
            <th className="border-b border-gray-200 px-3 py-2 text-right font-medium text-gray-600">Foreign Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-gray-100 bg-gray-50">
            <td className="px-3 py-1.5" colSpan={11}>
              Opening Balance
            </td>
            <td className="px-3 py-1.5 text-right">
              <Money cents={result.openingBalanceCents} />
            </td>
            <td colSpan={4} />
          </tr>
          {shownLines.map((line, i) => (
            <tr
              key={i}
              onClick={() => void openOriginalEntry(line.entryId, setView)}
              className={`cursor-pointer border-b border-gray-100 last:border-0 hover:bg-brand-50 ${userAuditStyle(line.createdBy, currentUserName).row}`}
              title="Open original entry"
            >
              <td className="px-3 py-1.5">
                <div className="flex items-center gap-2"><span>{line.entryDate}</span><OpenEntryButton entryId={line.entryId} compact /></div>
              </td>
              <EnteredTd at={line.createdAt} className="px-3 py-1.5" />
              <td className="px-3 py-1.5">{line.transactionType}</td>
              <td className="px-3 py-1.5">{line.reference ?? '—'}</td>
              <td className="px-3 py-1.5 text-center">{line.isAdjustment ? 'Yes' : '—'}</td>
              <td className="px-3 py-1.5">{line.name ?? '—'}</td>
              <td data-export-skip className="px-3 py-1.5"><span className={`rounded px-2 py-0.5 text-xs ring-1 ${userAuditStyle(line.createdBy, currentUserName).badge}`}>{line.createdBy ?? 'Legacy/local'}</span></td>
              <td className="px-3 py-1.5">{line.description ?? line.memo ?? '—'}</td>
              <td className="px-3 py-1.5">{line.split}</td>
              <td className="px-3 py-1.5 text-right">{line.debitCents > 0 && <Money cents={line.debitCents} />}</td>
              <td className="px-3 py-1.5 text-right">{line.creditCents > 0 && <Money cents={line.creditCents} />}</td>
              <td className="px-3 py-1.5 text-right">
                <Money cents={line.runningBalanceCents} />
              </td>
              <td className="px-3 py-1.5 text-right">{line.taxAmountCents > 0 ? <Money cents={line.taxAmountCents} /> : '—'}</td>
              <td className="px-3 py-1.5">{line.currency}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{exchangeRateLabel(line.exchangeRate)}</td>
              <td className="px-3 py-1.5 text-right">{line.foreignAmountCents !== null ? <Money cents={line.foreignAmountCents} /> : '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {group !== null && (
            <tr className="border-t border-gray-200 bg-brand-50 font-semibold text-brand-900">
              <td className="px-3 py-2" colSpan={9}>
                {LEDGER_ENTRY_GROUP_LABELS[group]} total
              </td>
              <td className="px-3 py-2 text-right"><Money cents={totals.debitCents} /></td>
              <td className="px-3 py-2 text-right"><Money cents={totals.creditCents} /></td>
              <td colSpan={5} />
            </tr>
          )}
          <tr className="bg-gray-50 font-semibold">
            <td className="px-3 py-2" colSpan={11}>
              Closing Balance
            </td>
            <td className="px-3 py-2 text-right">
              <Money cents={result.closingBalanceCents} />
            </td>
            <td colSpan={4} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
