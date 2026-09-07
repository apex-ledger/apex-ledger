import { useEffect, useMemo, useState } from 'react';
import { BackButton } from '../../components/BackButton';
import { runAccountingAudit, type AuditFinding, type AuditSeverity } from '@shared/domain/audit/runAccountingAudit';
import { checkChartOfAccounts } from '@shared/domain/ledger/chartOfAccountsHealth';
import { useUiStore } from '../../app/store/uiStore';
import { localIsoDate } from '@shared/domain/dates/localDate';

function todayIso(): string {
  return localIsoDate();
}

const SEVERITY_ORDER: Record<AuditSeverity, number> = { error: 0, warning: 1, info: 2 };

const SEVERITY_STYLES: Record<AuditSeverity, { badge: string; label: string; card: string }> = {
  error: { badge: 'bg-red-100 text-red-700', label: 'Error', card: 'border-red-200 bg-red-50' },
  warning: { badge: 'bg-amber-100 text-amber-800', label: 'Warning', card: 'border-amber-200 bg-amber-50' },
  info: { badge: 'bg-sky-100 text-sky-700', label: 'Review', card: 'border-sky-200 bg-sky-50' },
};

/** `hideRules` lets the Auditor Centre drop checks its Exceptions tab already runs, so the same
 * finding is never listed twice under two names. */
export function AuditPage({ hideRules = [] }: { hideRules?: string[] } = {}) {
  const setView = useUiStore((s) => s.setView);
  const [findings, setFindings] = useState<AuditFinding[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);

  async function runAudit() {
    setError(null);
    const [accountsResult, entriesResult] = await Promise.all([window.api.accounts.list({}), window.api.journal.list({})]);
    if (!accountsResult.ok) return setError(accountsResult.error);
    if (!entriesResult.ok) return setError(entriesResult.error);
    // The chart itself is audited alongside the postings. A misfiled account produces no bad entry
    // and no error — it just quietly moves money to the wrong line of the statements, so it would
    // never surface from an audit that only reads transactions.
    const coa = checkChartOfAccounts(accountsResult.data).issues.map<AuditFinding>((i) => ({
      id: `coa-${i.accountId}-${i.severity}-${i.accountCode}`,
      severity: i.severity,
      rule: 'Chart of accounts',
      title: i.message,
      detail: i.suggestion,
      accountId: i.accountId,
    }));

    setFindings([
      ...runAccountingAudit({ accounts: accountsResult.data, entries: entriesResult.data, todayIso: todayIso() }),
      ...coa,
    ]);
    setLastRunAt(new Date().toLocaleTimeString());
  }

  useEffect(() => {
    runAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = useMemo(() => (findings ?? []).filter((f) => !hideRules.includes(f.rule)).slice().sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]), [findings, hideRules]);
  const counts = useMemo(() => {
    const c: Record<AuditSeverity, number> = { error: 0, warning: 0, info: 0 };
    for (const f of findings ?? []) c[f.severity]++;
    return c;
  }, [findings]);

  return (
    <div className="w-full space-y-3">
      <BackButton fallback={{ kind: 'companySettings' }} fallbackLabel="Settings" />
      <div>
        <div>
          <h1 className="text-lg font-semibold text-brand-900">Accounting Audit</h1>
          <p className="mt-1 text-sm text-gray-500">
            Checks your posted books against fundamental double-entry bookkeeping principles — unbalanced entries, accounts running the wrong
            direction, undocumented equity postings, and stale unposted work. Not a substitute for a professional audit.
          </p>
        </div>
        <button type="button" onClick={runAudit} className="mt-2 rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200">
          Re-run Check
        </button>
      </div>
      <button type="button" onClick={() => setView({ kind: 'report', report: 'yearEndSignoff' })} className="block w-full rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-left hover:bg-emerald-100">
        <div className="font-medium text-emerald-900">Year-End Sign-off →</div>
        <div className="text-sm text-emerald-800">One clipboard of checks with a traffic light on each, the decision that follows, and the reviewer’s sign-off recorded on the file.</div>
      </button>

      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {findings !== null && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded border border-red-200 bg-red-50 p-3 text-center">
            <div className="text-lg font-bold text-red-700">{counts.error}</div>
            <div className="text-xs font-medium text-red-700">Errors</div>
          </div>
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-center">
            <div className="text-lg font-bold text-amber-800">{counts.warning}</div>
            <div className="text-xs font-medium text-amber-800">Warnings</div>
          </div>
          <div className="rounded border border-sky-200 bg-sky-50 p-3 text-center">
            <div className="text-lg font-bold text-sky-700">{counts.info}</div>
            <div className="text-xs font-medium text-sky-700">To Review</div>
          </div>
        </div>
      )}

      {findings === null ? (
        <p className="text-sm text-gray-400">Running…</p>
      ) : findings.length === 0 ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          No issues found. Your books are clean against every rule this check runs.
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((f) => {
            const style = SEVERITY_STYLES[f.severity];
            return (
              <div key={f.id} className={`rounded border p-3 ${style.card}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className={`mr-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${style.badge}`}>{style.label}</span>
                    <span className="font-medium text-gray-800">{f.title}</span>
                    <p className="mt-1 text-sm text-gray-600">{f.detail}</p>
                  </div>
                  {f.entryId !== undefined && (
                    <button
                      type="button"
                      onClick={() => setView({ kind: 'journalForm', id: f.entryId! })}
                      className="flex-shrink-0 rounded-full bg-white px-3 py-1 text-xs font-medium text-brand-700 shadow-sm hover:bg-brand-50"
                    >
                      View Entry
                    </button>
                  )}
                  {f.entryId === undefined && f.accountId !== undefined && (
                    <button
                      type="button"
                      onClick={() => setView({ kind: 'chartOfAccounts' })}
                      className="flex-shrink-0 rounded-full bg-white px-3 py-1 text-xs font-medium text-brand-700 shadow-sm hover:bg-brand-50"
                    >
                      View Account
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {lastRunAt && <p className="text-xs text-gray-400">Last checked at {lastRunAt}.</p>}
    </div>
  );
}
