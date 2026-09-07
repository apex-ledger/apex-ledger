import { useState } from 'react';
import type { AccountType } from '@shared/domain/types';
import { parseIif, type ParseIifResult } from '@shared/domain/importing/parseIif';
import {
  applyAccountTypeMapping,
  getCsvHeaders as getAccountsCsvHeaders,
  guessAccountTypeMapping,
  parseAccountsCsvPreview,
  type ParseAccountsCsvResult,
} from '@shared/domain/importing/parseAccountsCsv';
import { getCsvHeaders as getJournalCsvHeaders, parseJournalCsv, type ParseJournalCsvResult } from '@shared/domain/importing/parseJournalCsv';
import { detectQuickBooksReport, parseQuickBooksReport } from '@shared/domain/importing/parseQuickBooksReport';
import { Money } from '../../components/Money';

const CODE_RANGE_START: Record<AccountType, number> = {
  Asset: 1000,
  Liability: 2000,
  Equity: 3000,
  Revenue: 4000,
  Expense: 5000,
};

function makeCodeAllocator(existingCodes: Set<string>) {
  const codes = new Set(existingCodes);
  const nextByType: Record<AccountType, number> = { ...CODE_RANGE_START };
  return (accountType: AccountType): string => {
    let n = nextByType[accountType];
    while (codes.has(String(n))) n++;
    codes.add(String(n));
    nextByType[accountType] = n + 1;
    return String(n);
  };
}

type ImportSource = 'iif' | 'csvAccountsQbo' | 'csvJournalQbo' | 'csvAccountsXero' | 'csvJournalXero';

const IMPORT_SOURCES: { id: ImportSource; label: string }[] = [
  { id: 'iif', label: 'QuickBooks Desktop (.IIF)' },
  { id: 'csvAccountsQbo', label: 'QuickBooks Online — Chart of Accounts (.CSV / Excel)' },
  { id: 'csvJournalQbo', label: 'QuickBooks Online — Transactions (.CSV / Excel)' },
  { id: 'csvAccountsXero', label: 'Xero — Chart of Accounts (.CSV / Excel)' },
  { id: 'csvJournalXero', label: 'Xero — Transactions (.CSV / Excel)' },
];

function importFingerprint(sourceLabel: string, txn: { date: string; docNumber?: string | null; memo?: string | null; lines: { accountName: string; debitCents: number; creditCents: number }[] }): string {
  const lines = txn.lines.map((line) => `${line.accountName.trim().toLowerCase()}:${line.debitCents}:${line.creditCents}`).sort().join('|');
  return `${sourceLabel}:${txn.date}:${txn.docNumber?.trim() ?? ''}:${txn.memo?.trim() ?? ''}:${lines}`;
}

export function QuickBooksImportPage() {
  const [source, setSource] = useState<ImportSource>('iif');

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap gap-2">
        {IMPORT_SOURCES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSource(s.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${source === s.id ? 'bg-brand-300 text-brand-900' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {source === 'iif' && <IifImportPanel />}
      {source === 'csvAccountsQbo' && (
        <CsvAccountsImportPanel sourceLabel="QuickBooks Online" fileHint="Account List report export (Excel or CSV)" />
      )}
      {source === 'csvJournalQbo' && <CsvJournalImportPanel sourceLabel="QuickBooks Online" fileHint="Journal or General Ledger report export (Excel or CSV)" />}
      {source === 'csvAccountsXero' && (
        <CsvAccountsImportPanel sourceLabel="Xero" fileHint="Chart of Accounts export (Accounting → Chart of accounts → Export, Excel or CSV)" />
      )}
      {source === 'csvJournalXero' && (
        <CsvJournalImportPanel sourceLabel="Xero" fileHint="Account Transactions report export (Reporting → Account Transactions → Export, Excel or CSV)" />
      )}
    </div>
  );
}

interface ImportSummary {
  accountsCreated: number;
  transactionsImported: number;
  transactionsSkipped: number;
  errors: string[];
}

function IifImportPanel() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParseIifResult | null>(null);
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePickFile() {
    setError(null);
    setSummary(null);
    const fileResult = await window.api.qbImport.readIifFile();
    if (!fileResult.ok) return setError(fileResult.error);
    if (!fileResult.data.loaded) return;

    const existingResult = await window.api.accounts.list({});
    if (!existingResult.ok) return setError(existingResult.error);

    setFileName(fileResult.data.fileName);
    setExistingNames(new Set(existingResult.data.map((a) => a.name.toLowerCase())));
    setParsed(parseIif(fileResult.data.content));
  }

  async function handleImport() {
    if (!parsed) return;
    setBusy(true);
    setError(null);
    setSummary(null);

    const existingResult = await window.api.accounts.list({});
    if (!existingResult.ok) {
      setBusy(false);
      return setError(existingResult.error);
    }
    const accountIdByName = new Map(existingResult.data.map((a) => [a.name.toLowerCase(), a.id]));
    const nextFreeCode = makeCodeAllocator(new Set(existingResult.data.map((a) => a.code)));
    const journalResult = await window.api.journal.list({});
    if (!journalResult.ok) {
      setBusy(false);
      return setError(journalResult.error);
    }
    const importedFingerprints = new Set(journalResult.data.filter((entry) => entry.source === 'clientImport' && entry.sourceReference).map((entry) => entry.sourceReference!));

    let accountsCreated = 0;
    const errors: string[] = [];

    for (const account of parsed.accounts) {
      const key = account.name.toLowerCase();
      if (accountIdByName.has(key)) continue;
      setProgress(`Creating account "${account.name}"…`);
      const result = await window.api.accounts.create({
        code: nextFreeCode(account.accountType),
        name: account.name,
        accountType: account.accountType,
        accountSubtype: account.accountSubtype,
        description: account.description,
      });
      if (result.ok) {
        accountIdByName.set(key, result.data.id);
        accountsCreated++;
      } else {
        errors.push(`Account "${account.name}": ${result.error}`);
      }
    }

    let transactionsImported = 0;
    let transactionsSkipped = 0;

    for (const txn of parsed.transactions) {
      const fingerprint = importFingerprint('QuickBooks Desktop IIF', txn);
      if (importedFingerprints.has(fingerprint)) {
        transactionsSkipped++;
        continue;
      }
      if (!txn.balanced || txn.lines.length < 2) {
        transactionsSkipped++;
        continue;
      }
      const unresolvedLine = txn.lines.find((l) => !accountIdByName.has(l.accountName.toLowerCase()));
      if (unresolvedLine) {
        transactionsSkipped++;
        errors.push(`Skipped a ${txn.date} transaction — account "${unresolvedLine.accountName}" was not found.`);
        continue;
      }
      setProgress(`Importing transaction dated ${txn.date}…`);
      const lines = txn.lines.map((l) => ({
        accountId: accountIdByName.get(l.accountName.toLowerCase())!,
        debitCents: l.debitCents,
        creditCents: l.creditCents,
        description: l.memo,
      }));
      const postResult = await window.api.journal.createAndPost({ entryDate: txn.date, memo: txn.memo, reference: txn.docNumber, lines, source: 'clientImport', sourceReference: fingerprint });
      if (!postResult.ok) {
        transactionsSkipped++;
        errors.push(`Skipped a ${txn.date} transaction — ${postResult.error}`);
        continue;
      }
      importedFingerprints.add(fingerprint);
      transactionsImported++;
    }

    setBusy(false);
    setProgress(null);
    setSummary({ accountsCreated, transactionsImported, transactionsSkipped, errors });
    setParsed(null);
  }

  const unbalancedCount = parsed?.transactions.filter((t) => !t.balanced || t.lines.length < 2).length ?? 0;

  return (
    <div className="space-y-3">
      <div className="rounded border border-gold-200 bg-gold-50 px-3 py-2 text-sm text-gold-800">
        Import a client's Chart of Accounts and transaction history from a QuickBooks Desktop <strong>.IIF export</strong>. Accounts are
        matched by name (existing accounts are left untouched); missing ones are created automatically. Only balanced transactions are
        imported — anything that doesn't balance is skipped and listed below so nothing bad gets posted.
      </div>

      <div className="rounded border border-gray-200 bg-white p-3">
        <button type="button" onClick={handlePickFile} disabled={busy} className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50">
          Choose QuickBooks IIF File…
        </button>
        {fileName && <span className="ml-3 text-sm text-gray-500">{fileName}</span>}
      </div>

      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {progress && <p className="text-sm text-gray-400">{progress}</p>}

      {parsed && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="text-xs uppercase tracking-wide text-gray-400">Accounts Found</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{parsed.accounts.length}</div>
            </div>
            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="text-xs uppercase tracking-wide text-gray-400">Transactions Found</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{parsed.transactions.length}</div>
            </div>
            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="text-xs uppercase tracking-wide text-gray-400">Will Be Skipped</div>
              <div className={`mt-1 text-lg font-semibold ${unbalancedCount > 0 ? 'text-amber-600' : 'text-gray-900'}`}>{unbalancedCount}</div>
            </div>
          </div>

          <div className="rounded border border-gray-200 bg-white">
            <h3 className="border-b border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700">Accounts</h3>
            <table className="w-full border-collapse text-sm">
              <tbody>
                {parsed.accounts.map((a) => (
                  <tr key={a.name} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-1.5">{a.name}</td>
                    <td className="px-3 py-1.5 text-gray-500">
                      {a.accountType} · {a.accountSubtype}
                    </td>
                    <td className="px-3 py-1.5 text-right text-xs">
                      {existingNames.has(a.name.toLowerCase()) ? (
                        <span className="text-gray-400">already exists — will skip</span>
                      ) : (
                        <span className="text-green-600">will create</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded border border-gray-200 bg-white">
            <h3 className="border-b border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700">Transactions (first 20)</h3>
            <table className="w-full border-collapse text-sm">
              <tbody>
                {parsed.transactions.slice(0, 20).map((t, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-1.5 tabular-nums">{t.date}</td>
                    <td className="px-3 py-1.5">{t.memo ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right">
                      <Money cents={t.lines.reduce((s, l) => s + l.debitCents, 0)} />
                    </td>
                    <td className="px-3 py-1.5 text-right text-xs">{t.balanced ? '' : <span className="text-amber-600">unbalanced — will skip</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsed.transactions.length > 20 && <p className="px-3 py-2 text-xs text-gray-400">+{parsed.transactions.length - 20} more not shown.</p>}
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={handleImport}
            className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
          >
            {busy ? 'Importing…' : 'Import Into This Company'}
          </button>
        </div>
      )}

      {summary && (
        <div className="rounded border border-green-200 bg-green-50 p-3">
          <h3 className="text-sm font-semibold text-green-800">Import Complete</h3>
          <p className="mt-1 text-sm text-green-700">
            Created {summary.accountsCreated} account{summary.accountsCreated === 1 ? '' : 's'}, imported {summary.transactionsImported}{' '}
            transaction{summary.transactionsImported === 1 ? '' : 's'}
            {summary.transactionsSkipped > 0 ? `, skipped ${summary.transactionsSkipped}` : ''}.
          </p>
          {summary.errors.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-amber-700">
              {summary.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ColumnSelect({ label, headers, value, onChange, allowNone }: { label: string; headers: string[]; value: string; onChange: (v: string) => void; allowNone?: boolean }) {
  return (
    <label className="block text-sm">
      <span className="text-gray-600">{label}</span>
      <select className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5" value={value} onChange={(e) => onChange(e.target.value)}>
        {allowNone && <option value="">— none —</option>}
        {headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </label>
  );
}

function CsvAccountsImportPanel({ sourceLabel, fileHint }: { sourceLabel: string; fileHint: string }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [nameColumn, setNameColumn] = useState('');
  const [typeColumn, setTypeColumn] = useState('');
  const [descColumn, setDescColumn] = useState('');
  const [preview, setPreview] = useState<ParseAccountsCsvResult | null>(null);
  const [typeMapping, setTypeMapping] = useState<Record<string, { accountType: AccountType; accountSubtype: string }>>({});
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePickFile() {
    setError(null);
    setSummary(null);
    setPreview(null);
    const fileResult = await window.api.qbImport.readCsvFile();
    if (!fileResult.ok) return setError(fileResult.error);
    if (!fileResult.data.loaded) return;
    setFileName(fileResult.data.fileName);
    setCsvText(fileResult.data.content);
    const h = getAccountsCsvHeaders(fileResult.data.content);
    setHeaders(h);
    setNameColumn(h.find((c) => /account|name/i.test(c)) ?? h[0] ?? '');
    setTypeColumn(h.find((c) => /type/i.test(c)) ?? h[1] ?? '');
    setDescColumn(h.find((c) => /description|memo|detail/i.test(c)) ?? '');
  }

  async function handleMapColumns() {
    if (!csvText || !nameColumn || !typeColumn) return;
    setError(null);
    const result = parseAccountsCsvPreview(csvText, { nameColumn, typeColumn, descriptionColumn: descColumn || null });
    setPreview(result);
    setTypeMapping(Object.fromEntries(result.distinctTypes.map((t) => [t, guessAccountTypeMapping(t)])));
    const existingResult = await window.api.accounts.list({});
    if (existingResult.ok) setExistingNames(new Set(existingResult.data.map((a) => a.name.toLowerCase())));
  }

  async function handleImport() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    const resolved = applyAccountTypeMapping(preview.accounts, typeMapping);
    const existingResult = await window.api.accounts.list({});
    if (!existingResult.ok) {
      setBusy(false);
      return setError(existingResult.error);
    }
    const names = new Set(existingResult.data.map((a) => a.name.toLowerCase()));
    const nextFreeCode = makeCodeAllocator(new Set(existingResult.data.map((a) => a.code)));

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (const a of resolved) {
      if (names.has(a.name.toLowerCase())) {
        skipped++;
        continue;
      }
      const result = await window.api.accounts.create({
        code: nextFreeCode(a.accountType),
        name: a.name,
        accountType: a.accountType,
        accountSubtype: a.accountSubtype,
        description: a.description,
      });
      if (result.ok) {
        created++;
        names.add(a.name.toLowerCase());
      } else {
        skipped++;
        errors.push(`"${a.name}": ${result.error}`);
      }
    }
    setBusy(false);
    setSummary({ created, skipped, errors });
    setPreview(null);
  }

  return (
    <div className="space-y-3">
      <div className="rounded border border-gold-200 bg-gold-50 px-3 py-2 text-sm text-gold-800">
        Import a client's Chart of Accounts from a {sourceLabel} <strong>{fileHint}</strong>. Column layouts vary across
        reports/locales/versions, so map the columns below yourself — the account type guess is pre-filled but always editable before
        anything is created.
      </div>

      <div className="rounded border border-gray-200 bg-white p-3">
        <button type="button" onClick={handlePickFile} disabled={busy} className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50">
          Choose CSV or Excel File…
        </button>
        {fileName && <span className="ml-3 text-sm text-gray-500">{fileName}</span>}
      </div>

      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {headers.length > 0 && !preview && (
        <div className="rounded border border-gray-200 bg-white p-3">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Map Columns</h3>
          <div className="grid grid-cols-3 gap-3">
            <ColumnSelect label="Account Name" headers={headers} value={nameColumn} onChange={setNameColumn} />
            <ColumnSelect label="Type / Detail Type" headers={headers} value={typeColumn} onChange={setTypeColumn} />
            <ColumnSelect label="Description (optional)" headers={headers} value={descColumn} onChange={setDescColumn} allowNone />
          </div>
          <button
            type="button"
            disabled={!nameColumn || !typeColumn}
            onClick={handleMapColumns}
            className="mt-3 rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
          >
            Preview
          </button>
        </div>
      )}

      {preview && (
        <div className="space-y-3">
          {preview.warnings.length > 0 && (
            <div className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {preview.warnings.map((w, i) => (
                <div key={i}>{w}</div>
              ))}
            </div>
          )}

          <div className="rounded border border-gray-200 bg-white p-3">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">Confirm Account Type Mapping</h3>
            <p className="mb-3 text-xs text-gray-400">Every distinct value found in the type column — adjust any that were guessed wrong.</p>
            <div className="space-y-2">
              {preview.distinctTypes.map((rawType) => (
                <div key={rawType} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-gray-700">{rawType}</span>
                  <select
                    className="w-64 rounded border border-gray-300 bg-white px-2 py-1 text-xs"
                    value={`${typeMapping[rawType]?.accountType}|${typeMapping[rawType]?.accountSubtype}`}
                    onChange={(e) => {
                      const [accountType, accountSubtype] = e.target.value.split('|') as [AccountType, string];
                      setTypeMapping((prev) => ({ ...prev, [rawType]: { accountType, accountSubtype } }));
                    }}
                  >
                    <option value="Asset|Cash and Bank">Asset — Cash and Bank</option>
                    <option value="Asset|Current Asset">Asset — Current Asset</option>
                    <option value="Asset|Capital Asset">Asset — Capital Asset</option>
                    <option value="Liability|Credit Card">Liability — Credit Card</option>
                    <option value="Liability|Current Liability">Liability — Current Liability</option>
                    <option value="Liability|Long-Term Liability">Liability — Long-Term Liability</option>
                    <option value="Equity|Equity">Equity</option>
                    <option value="Revenue|Revenue">Revenue</option>
                    <option value="Expense|Cost of Sales">Expense — Cost of Sales</option>
                    <option value="Expense|Operating Expense">Expense — Operating Expense</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded border border-gray-200 bg-white">
            <h3 className="border-b border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700">Accounts ({preview.accounts.length})</h3>
            <table className="w-full border-collapse text-sm">
              <tbody>
                {preview.accounts.map((a) => (
                  <tr key={a.name} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-1.5">{a.name}</td>
                    <td className="px-3 py-1.5 text-gray-500">{a.rawType}</td>
                    <td className="px-3 py-1.5 text-right text-xs">
                      {existingNames.has(a.name.toLowerCase()) ? <span className="text-gray-400">already exists — will skip</span> : <span className="text-green-600">will create</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button type="button" disabled={busy} onClick={handleImport} className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50">
            {busy ? 'Importing…' : 'Import Into This Company'}
          </button>
        </div>
      )}

      {summary && (
        <div className="rounded border border-green-200 bg-green-50 p-3">
          <h3 className="text-sm font-semibold text-green-800">Import Complete</h3>
          <p className="mt-1 text-sm text-green-700">
            Created {summary.created} account{summary.created === 1 ? '' : 's'}
            {summary.skipped > 0 ? `, skipped ${summary.skipped}` : ''}.
          </p>
          {summary.errors.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-amber-700">
              {summary.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function CsvJournalImportPanel({ sourceLabel, fileHint }: { sourceLabel: string; fileHint: string }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [keyColumn, setKeyColumn] = useState('');
  const [dateColumn, setDateColumn] = useState('');
  const [accountColumn, setAccountColumn] = useState('');
  const [debitColumn, setDebitColumn] = useState('');
  const [creditColumn, setCreditColumn] = useState('');
  const [descColumn, setDescColumn] = useState('');
  const [preview, setPreview] = useState<ParseJournalCsvResult | null>(null);
  const [missingAccounts, setMissingAccounts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recognised, setRecognised] = useState<string | null>(null);

  async function handlePickFile() {
    setError(null);
    setSummary(null);
    setPreview(null);
    const fileResult = await window.api.qbImport.readCsvFile();
    if (!fileResult.ok) return setError(fileResult.error);
    if (!fileResult.data.loaded) return;
    setFileName(fileResult.data.fileName);
    setCsvText(fileResult.data.content);
    // QuickBooks Online's own Journal / General Ledger exports need no column mapping.
    const kind = detectQuickBooksReport(fileResult.data.content);
    if (kind) {
      const result = parseQuickBooksReport(fileResult.data.content);
      const company = result.titles[0] ? `${result.titles[0]} — ` : '';
      setRecognised(`${company}QuickBooks Online ${kind === 'journal' ? 'Journal' : 'General Ledger'} export recognised; columns mapped automatically.`);
      setHeaders([]);
      await showPreview(result);
      return;
    }
    setRecognised(null);
    const h = getJournalCsvHeaders(fileResult.data.content);
    setHeaders(h);
    setKeyColumn(h.find((c) => /trans\s*#|transaction\s*(number|no|#)|^num$|reference|journal/i.test(c)) ?? h[0] ?? '');
    setDateColumn(h.find((c) => /^date$/i.test(c)) ?? '');
    setAccountColumn(h.find((c) => /^account$/i.test(c)) ?? '');
    setDebitColumn(h.find((c) => /debit/i.test(c)) ?? '');
    setCreditColumn(h.find((c) => /credit/i.test(c)) ?? '');
    setDescColumn(h.find((c) => /memo|description/i.test(c)) ?? '');
  }

  async function handleMapColumns() {
    if (!csvText || !keyColumn || !dateColumn || !accountColumn || !debitColumn || !creditColumn) return;
    setError(null);
    const result = parseJournalCsv(csvText, {
      transactionKeyColumn: keyColumn,
      dateColumn,
      accountColumn,
      debitColumn,
      creditColumn,
      descriptionColumn: descColumn || null,
    });
    await showPreview(result);
  }

  async function showPreview(result: ParseJournalCsvResult) {
    setPreview(result);
    const existingResult = await window.api.accounts.list({});
    if (existingResult.ok) {
      const names = new Set(existingResult.data.map((a) => a.name.toLowerCase()));
      setMissingAccounts(result.accountNamesReferenced.filter((n) => !names.has(n.toLowerCase())));
    }
  }

  async function handleImport() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    const existingResult = await window.api.accounts.list({});
    if (!existingResult.ok) {
      setBusy(false);
      return setError(existingResult.error);
    }
    const accountIdByName = new Map(existingResult.data.map((a) => [a.name.toLowerCase(), a.id]));
    const journalResult = await window.api.journal.list({});
    if (!journalResult.ok) {
      setBusy(false);
      return setError(journalResult.error);
    }
    const importedFingerprints = new Set(journalResult.data.filter((entry) => entry.source === 'clientImport' && entry.sourceReference).map((entry) => entry.sourceReference!));

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const txn of preview.transactions) {
      const fingerprint = importFingerprint(`${sourceLabel} CSV`, txn);
      if (importedFingerprints.has(fingerprint)) {
        skipped++;
        continue;
      }
      if (!txn.balanced || txn.lines.length < 2) {
        skipped++;
        continue;
      }
      const unresolvedLine = txn.lines.find((l) => !accountIdByName.has(l.accountName.toLowerCase()));
      if (unresolvedLine) {
        skipped++;
        errors.push(`Skipped transaction "${txn.docNumber}" (${txn.date}) — account "${unresolvedLine.accountName}" was not found.`);
        continue;
      }
      setProgress(`Importing transaction "${txn.docNumber}" dated ${txn.date}…`);
      const lines = txn.lines.map((l) => ({
        accountId: accountIdByName.get(l.accountName.toLowerCase())!,
        debitCents: l.debitCents,
        creditCents: l.creditCents,
        description: l.memo,
      }));
      const postResult = await window.api.journal.createAndPost({ entryDate: txn.date, memo: txn.memo, reference: txn.docNumber, lines, source: 'clientImport', sourceReference: fingerprint });
      if (!postResult.ok) {
        skipped++;
        errors.push(`Skipped transaction "${txn.docNumber}" — ${postResult.error}`);
        continue;
      }
      importedFingerprints.add(fingerprint);
      imported++;
    }

    setBusy(false);
    setProgress(null);
    setSummary({ imported, skipped, errors });
    setPreview(null);
  }

  const unbalancedCount = preview?.transactions.filter((t) => !t.balanced || t.lines.length < 2).length ?? 0;

  return (
    <div className="space-y-3">
      <div className="rounded border border-gold-200 bg-gold-50 px-3 py-2 text-sm text-gold-800">
        Import transaction history from a {sourceLabel} <strong>{fileHint}</strong> — one row per debit/credit line, grouped into
        entries by a transaction/reference number column — QuickBooks Online's own Journal and General Ledger exports (Excel or CSV) are recognised and mapped automatically. This doesn't create accounts (a transaction export doesn't reliably say
        whether an account is a bank, expense, or equity account) — import the Chart of Accounts CSV first so every account name below
        already exists.
      </div>

      <div className="rounded border border-gray-200 bg-white p-3">
        <button type="button" onClick={handlePickFile} disabled={busy} className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50">
          Choose CSV or Excel File…
        </button>
        {fileName && <span className="ml-3 text-sm text-gray-500">{fileName}</span>}
      </div>

      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {progress && <p className="text-sm text-gray-400">{progress}</p>}

      {recognised && <div className="rounded bg-green-50 px-3 py-2 text-sm text-green-800">{recognised}</div>}

      {headers.length > 0 && !preview && (
        <div className="rounded border border-gray-200 bg-white p-3">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Map Columns</h3>
          <div className="grid grid-cols-3 gap-3">
            <ColumnSelect label="Transaction # (groups lines)" headers={headers} value={keyColumn} onChange={setKeyColumn} />
            <ColumnSelect label="Date" headers={headers} value={dateColumn} onChange={setDateColumn} />
            <ColumnSelect label="Account" headers={headers} value={accountColumn} onChange={setAccountColumn} />
            <ColumnSelect label="Debit" headers={headers} value={debitColumn} onChange={setDebitColumn} />
            <ColumnSelect label="Credit" headers={headers} value={creditColumn} onChange={setCreditColumn} />
            <ColumnSelect label="Memo / Description (optional)" headers={headers} value={descColumn} onChange={setDescColumn} allowNone />
          </div>
          <button
            type="button"
            disabled={!keyColumn || !dateColumn || !accountColumn || !debitColumn || !creditColumn}
            onClick={handleMapColumns}
            className="mt-3 rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
          >
            Preview
          </button>
        </div>
      )}

      {preview && (
        <div className="space-y-3">
          {preview.warnings.length > 0 && (
            <div className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {preview.warnings.map((w, i) => (
                <div key={i}>{w}</div>
              ))}
            </div>
          )}

          {missingAccounts.length > 0 && (
            <div className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">
              <p className="font-medium">These accounts aren't in your Chart of Accounts yet — transactions using them will be skipped:</p>
              <p className="mt-1">{missingAccounts.join(', ')}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="text-xs uppercase tracking-wide text-gray-400">Transactions Found</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{preview.transactions.length}</div>
            </div>
            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="text-xs uppercase tracking-wide text-gray-400">Will Be Skipped (unbalanced)</div>
              <div className={`mt-1 text-lg font-semibold ${unbalancedCount > 0 ? 'text-amber-600' : 'text-gray-900'}`}>{unbalancedCount}</div>
            </div>
          </div>

          <div className="rounded border border-gray-200 bg-white">
            <h3 className="border-b border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700">Transactions (first 20)</h3>
            <table className="w-full border-collapse text-sm">
              <tbody>
                {preview.transactions.slice(0, 20).map((t, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-1.5 tabular-nums">{t.date}</td>
                    <td className="px-3 py-1.5">{t.memo ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right">
                      <Money cents={t.lines.reduce((s, l) => s + l.debitCents, 0)} />
                    </td>
                    <td className="px-3 py-1.5 text-right text-xs">{t.balanced ? '' : <span className="text-amber-600">unbalanced — will skip</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.transactions.length > 20 && <p className="px-3 py-2 text-xs text-gray-400">+{preview.transactions.length - 20} more not shown.</p>}
          </div>

          <button type="button" disabled={busy} onClick={handleImport} className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50">
            {busy ? 'Importing…' : 'Import Into This Company'}
          </button>
        </div>
      )}

      {summary && (
        <div className="rounded border border-green-200 bg-green-50 p-3">
          <h3 className="text-sm font-semibold text-green-800">Import Complete</h3>
          <p className="mt-1 text-sm text-green-700">
            Imported {summary.imported} transaction{summary.imported === 1 ? '' : 's'}
            {summary.skipped > 0 ? `, skipped ${summary.skipped}` : ''}.
          </p>
          {summary.errors.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-amber-700">
              {summary.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
