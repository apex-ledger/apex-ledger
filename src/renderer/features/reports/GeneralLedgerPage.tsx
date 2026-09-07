import { useEffect, useState } from 'react';
import { DateInput } from '../../components/DateInput';
import type { Account, CompanyInfo } from '@shared/domain/types';
import { Combobox } from '../../components/Combobox';
import { Money } from '../../components/Money';
import { AccountQuickTabs } from '../../components/AccountQuickTabs';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { accountPickerOptions } from '../../utils/accountLabel';
import { useUiStore } from '../../app/store/uiStore';
import { openOriginalEntry } from '../../utils/openOriginalEntry';
import { OpenEntryButton } from '../../components/OpenEntryButton';
import { userAuditStyle } from '../../utils/userAuditColor';
import { EnteredTd, EnteredText, EnteredTh } from '../../components/EnteredCell';
import { localIsoDate } from '@shared/domain/dates/localDate';

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
  const [dateFrom, setDateFrom] = useState(drillDown?.dateFrom ?? yearStartIso());
  const [dateTo, setDateTo] = useState(drillDown?.dateTo ?? todayIso());
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
    setAccountId(drillDown.accountId);
    if (drillDown.dateFrom) setDateFrom(drillDown.dateFrom);
    if (drillDown.dateTo) setDateTo(drillDown.dateTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drillDown?.accountId, drillDown?.dateFrom, drillDown?.dateTo]);

  const { data, loading, error } = useIpcQuery(
    () => (accountId ? window.api.reports.generalLedger({ accountId, dateFrom, dateTo }) : Promise.resolve({ ok: true as const, data: undefined })),
    [accountId, dateFrom, dateTo],
  );

  return (
    <div className="w-full">
      <AccountQuickTabs selectedAccountId={accountId} onSelect={setAccountId} />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="w-72">
          <Combobox
            options={accountPickerOptions(accounts)}
            value={accountId !== null ? String(accountId) : null}
            onChange={(v) => setAccountId(v ? Number(v) : null)}
            placeholder="Select an account…"
          />
        </div>
        <DateInput value={dateFrom} onChange={setDateFrom} className="w-32" />
        <span className="text-sm text-gray-400">to</span>
        <DateInput value={dateTo} onChange={setDateTo} className="w-32" />
        <span className="text-xs text-gray-500"><span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800">Current user</span> · other colors identify other users</span>
      </div>

      {!accountId && <p className="text-sm text-gray-400">Choose an account to view its ledger.</p>}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && accountId && <p className="text-sm text-gray-400">Loading…</p>}

      {data && (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="w-full min-w-[1620px] border-collapse text-sm">
            <caption className="caption-top border-b border-gray-100 bg-white px-3 py-2 text-center">
              <span className="block text-sm text-gray-600" data-export-row>{company?.displayName || company?.legalName || 'Company'}</span>
              <span className="block text-lg font-semibold text-gray-900">General Ledger</span>
              <span className="block text-sm font-medium text-gray-700" data-export-row>{reportPeriodLabel(dateFrom, dateTo)}</span>
              <span className="mt-1 block text-sm text-gray-500" data-export-row>{generalLedgerAccountLabel(data.account)}</span>
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
                  <Money cents={data.openingBalanceCents} />
                </td>
                <td colSpan={4} />
              </tr>
              {data.lines.map((line, i) => (
                <tr
                  key={i}
                  onClick={() => void openOriginalEntry(line.entryId, setView)}
                  className={`cursor-pointer border-b border-gray-100 last:border-0 hover:bg-brand-50 ${userAuditStyle(line.createdBy, identity?.name).row}`}
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
                  <td data-export-skip className="px-3 py-1.5"><span className={`rounded px-2 py-0.5 text-xs ring-1 ${userAuditStyle(line.createdBy, identity?.name).badge}`}>{line.createdBy ?? 'Legacy/local'}</span></td>
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
              <tr className="bg-gray-50 font-semibold">
                <td className="px-3 py-2" colSpan={11}>
                  Closing Balance
                </td>
                <td className="px-3 py-2 text-right">
                  <Money cents={data.closingBalanceCents} />
                </td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
