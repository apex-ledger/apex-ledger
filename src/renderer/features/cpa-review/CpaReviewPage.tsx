import { useCallback, useEffect, useState } from 'react';
import type { Account, CompanyInfo, CpaNote } from '@shared/domain/types';
import { LetterPickerModal } from './LetterPickerModal';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { localIsoDate } from '@shared/domain/dates/localDate';

function todayIso(): string {
  return localIsoDate();
}

function startOfYear(): string {
  return `${new Date().getFullYear()}-01-01`;
}

interface NoteDraft {
  id: number | null;
  noteDate: string;
  subject: string;
  body: string;
  accountId: number | null;
  cpaResponse: string;
}

function emptyDraft(): NoteDraft {
  return { id: null, noteDate: todayIso(), subject: '', body: '', accountId: null, cpaResponse: '' };
}

/**
 * Notes for the CPA, plus the review package that bundles them with the statements. The two halves
 * belong on one screen because they're one workflow: write down what the reviewer needs to know as
 * you find it, then send it along with the numbers it refers to.
 */
export function CpaReviewPage() {
  const [notes, setNotes] = useState<CpaNote[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [draft, setDraft] = useState<NoteDraft>(emptyDraft());
  const [showResolved, setShowResolved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [letterOpen, setLetterOpen] = useState(false);
  const [company, setCompany] = useState<CompanyInfo | null>(null);

  const [periodStart, setPeriodStart] = useState(startOfYear());
  const [periodEnd, setPeriodEnd] = useState(todayIso());
  const [includeBalanceSheet, setIncludeBalanceSheet] = useState(true);
  const [includeIncomeStatement, setIncludeIncomeStatement] = useState(true);
  const [includeTrialBalance, setIncludeTrialBalance] = useState(false);
  const [includeOpenNotesOnly, setIncludeOpenNotesOnly] = useState(false);
  const [coverMessage, setCoverMessage] = useState('');

  const reload = useCallback(() => {
    window.api.cpaNotes.list().then((r) => {
      if (r.ok) setNotes(r.data);
    });
  }, []);

  useEffect(() => {
    window.api.accounts.list().then((r) => {
      if (r.ok) setAccounts(r.data);
    });
    window.api.company.get().then((r) => {
      if (r.ok) setCompany(r.data);
    });
    reload();
  }, [reload]);

  const visibleNotes = notes.filter((n) => (showResolved ? true : n.status === 'open'));
  const openCount = notes.filter((n) => n.status === 'open').length;

  function accountLabel(id: number | null): string | null {
    if (id === null) return null;
    const account = accounts.find((a) => a.id === id);
    return account ? `${account.name}` : null;
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    const result = await window.api.cpaNotes.save({
      id: draft.id,
      noteDate: draft.noteDate,
      subject: draft.subject.trim(),
      body: draft.body.trim(),
      accountId: draft.accountId,
      cpaResponse: draft.cpaResponse.trim() || null,
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setDraft(emptyDraft());
    reload();
  }

  async function handleSetStatus(note: CpaNote, status: 'open' | 'resolved') {
    setBusy(true);
    setError(null);
    const result = await window.api.cpaNotes.setStatus({ id: note.id, status });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    reload();
  }

  async function handleDelete(note: CpaNote) {
    if (!window.confirm(`Delete the CPA review note “${note.subject}”? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    const result = await window.api.cpaNotes.delete(note.id);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    if (draft.id === note.id) setDraft(emptyDraft());
    reload();
  }

  async function handleGeneratePackage() {
    setBusy(true);
    setError(null);
    setSavedPath(null);
    const result = await window.api.cpaNotes.generateReviewPackage({
      periodStart,
      periodEnd,
      includeBalanceSheet,
      includeIncomeStatement,
      includeTrialBalance,
      includeOpenNotesOnly,
      coverMessage: coverMessage.trim() || null,
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    if (result.data.saved) setSavedPath(result.data.filePath);
  }

  return (
    <div className="w-full space-y-3">
      <p className="text-sm text-gray-500">
        Notes for whoever reviews these books — the questions and explanations that would otherwise live in a separate email thread. They travel with the
        company file, and go out with the statements in one PDF.
      </p>

      {error && <div className="rounded-xl2 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <section className="rounded-xl2 border border-gray-200/80 bg-white p-3 shadow-soft">
        <h2 className="mb-3 text-sm font-bold text-gray-800">{draft.id === null ? 'New note' : 'Editing note'}</h2>
        <div className="grid grid-cols-3 gap-3">
          <label className="block text-sm">
            <span className="text-gray-600">Date</span>
            <input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5" value={draft.noteDate} onChange={(e) => setDraft({ ...draft, noteDate: clampIsoDate(e.target.value) })} />
          </label>
          <label className="col-span-2 block text-sm">
            <span className="text-gray-600">Subject</span>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5"
              placeholder="e.g. Large deposit in June — shareholder loan, not revenue"
              value={draft.subject}
              onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
            />
          </label>
        </div>
        <label className="mt-3 block text-sm">
          <span className="text-gray-600">Note</span>
          <textarea
            rows={4}
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5"
            placeholder="What the reviewer needs to know, or the question you need answered."
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-gray-600">Related account (optional)</span>
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5"
              value={draft.accountId ?? ''}
              onChange={(e) => setDraft({ ...draft, accountId: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">—</option>
              {accounts
                .filter((a) => a.isActive)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">CPA response (fill in when it comes back)</span>
            <input className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5" value={draft.cpaResponse} onChange={(e) => setDraft({ ...draft, cpaResponse: e.target.value })} />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={busy || !draft.subject.trim() || !draft.body.trim()}
            onClick={handleSave}
            className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
          >
            {draft.id === null ? 'Add note' : 'Save changes'}
          </button>
          {draft.id !== null && (
            <button type="button" onClick={() => setDraft(emptyDraft())} className="rounded-full px-3 py-2 text-sm text-gray-600 hover:bg-gray-100">
              Cancel edit
            </button>
          )}
        </div>
      </section>

      <section className="rounded-xl2 border border-gray-200/80 bg-white p-3 shadow-soft">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800">
            Notes{' '}
            {openCount > 0 && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{openCount} open</span>}
          </h2>
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
            Show resolved
          </label>
        </div>
        {visibleNotes.length === 0 ? (
          <p className="text-sm text-gray-400">{showResolved ? 'No notes yet.' : 'Nothing open — every note has been resolved.'}</p>
        ) : (
          <div className="space-y-2">
            {visibleNotes.map((note) => (
              <article
                key={note.id}
                className={`rounded-xl2 border p-3 duration-250 ease-standard ${note.status === 'open' ? 'border-amber-200 bg-amber-50/40' : 'border-gray-100 bg-gray-50/60'}`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-semibold text-gray-800">{note.subject}</h3>
                  <span className="whitespace-nowrap text-xs text-gray-400">{note.noteDate}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{note.body}</p>
                {accountLabel(note.accountId) && <p className="mt-1 text-xs text-gray-400">Account: {accountLabel(note.accountId)}</p>}
                {note.cpaResponse && (
                  <p className="mt-2 rounded-lg bg-white/80 px-2 py-1.5 text-sm text-gray-700">
                    <span className="font-semibold">CPA:</span> {note.cpaResponse}
                  </p>
                )}
                <div className="mt-2 flex items-center gap-3 text-xs">
                  {note.status === 'open' ? (
                    <button type="button" disabled={busy} onClick={() => handleSetStatus(note, 'resolved')} className="text-emerald-700 hover:underline">
                      Mark resolved
                    </button>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => handleSetStatus(note, 'open')} className="text-amber-700 hover:underline">
                      Reopen
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDraft({ id: note.id, noteDate: note.noteDate, subject: note.subject, body: note.body, accountId: note.accountId, cpaResponse: note.cpaResponse ?? '' })}
                    className="text-brand-600 hover:underline"
                  >
                    Edit
                  </button>
                  <button type="button" disabled={busy} onClick={() => handleDelete(note)} className="text-gray-400 hover:text-red-600">
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl2 border border-gray-200/80 bg-white p-3 shadow-soft">
        <h2 className="mb-1 text-sm font-bold text-gray-800">Send to CPA for review</h2>
        <p className="mb-3 text-xs text-gray-500">
          Builds one PDF: your notes for the period on the cover pages, then the statements you tick below. Figures come from the same report code the
          on-screen statements use, so the CPA sees exactly what you see.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-gray-600">Period start</span>
            <input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5" value={periodStart} onChange={(e) => setPeriodStart(clampIsoDate(e.target.value))} />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Period end (balance sheet date)</span>
            <input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5" value={periodEnd} onChange={(e) => setPeriodEnd(clampIsoDate(e.target.value))} />
          </label>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={includeBalanceSheet} onChange={(e) => setIncludeBalanceSheet(e.target.checked)} />
            Balance Sheet
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={includeIncomeStatement} onChange={(e) => setIncludeIncomeStatement(e.target.checked)} />
            Profit and Loss Summary
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={includeTrialBalance} onChange={(e) => setIncludeTrialBalance(e.target.checked)} />
            Trial Balance
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={includeOpenNotesOnly} onChange={(e) => setIncludeOpenNotesOnly(e.target.checked)} />
            Only include notes still open
          </label>
        </div>
        <label className="mt-3 block text-sm">
          <span className="text-gray-600">Cover message (optional)</span>
          <textarea rows={2} className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5" value={coverMessage} onChange={(e) => setCoverMessage(e.target.value)} />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={handleGeneratePackage}
          className="mt-3 rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
        >
          Generate review package PDF
        </button>
        {savedPath && <p className="mt-2 text-xs text-emerald-700">Saved to {savedPath}</p>}
      </section>

      <section className="rounded-xl2 border border-gray-200/80 bg-white p-3 shadow-soft">
        <h2 className="mb-1 text-sm font-bold text-gray-800">Letters</h2>
        <p className="mb-3 text-xs text-gray-500">
          Standard-form letters that go out with a set of statements — the compilation engagement report, engagement and management representation letters,
          the disclosure-notes skeleton, and the client covering letter. Fields prefill from this company file where possible.
        </p>
        <button
          type="button"
          onClick={() => setLetterOpen(true)}
          className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200"
        >
          Add a letter
        </button>
      </section>

      <LetterPickerModal
        open={letterOpen}
        onClose={() => setLetterOpen(false)}
        defaults={{
          clientName: company?.legalName ?? '',
          firmName: company?.legalName ?? '',
          city: company?.businessCity ?? '',
          periodStart,
          periodEnd,
        }}
      />
    </div>
  );
}
