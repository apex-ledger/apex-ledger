import { useCallback, useEffect, useRef, useState } from 'react';
import type { Account } from '@shared/domain/types';
import { BUSINESS_TYPES } from '@shared/domain/businessTypes';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { describeCommand, parseLessonControl, parseVoiceCommand, type QueryCommand, type QuickEntryCommand, type VoiceCommand } from '@shared/domain/voice/voiceCommands';
import { LESSONS, type Lesson } from '@shared/domain/voice/lessons';
import { useUiStore, type View } from '../app/store/uiStore';
import { useVoiceCapture } from '../voice/useVoiceCapture';
import { LessonOverlay } from '../voice/LessonOverlay';
import { markLessonDone } from '../features/company-settings/SelfTutorialSection';

/**
 * The voice agent. Hold the button (or press it once) and speak; release (or press again) and the
 * sentence is transcribed on this machine, read back as a card, and posted only when you say
 * "confirm" or click Post. Typing the same sentence works too, for a noisy office or a machine
 * without a microphone. Nothing is posted that you did not see first.
 */
type Phase = 'idle' | 'listening' | 'transcribing' | 'review' | 'posting';

/** How the read-back sounds. Pace and pitch are what a listener hears as mood; the words stay the same. */
export type MoodId = 'calm' | 'friendly' | 'cheerful' | 'gentle' | 'professional';
export const MOODS: Record<MoodId, { label: string; rate: number; pitch: number; sample: string }> = {
  friendly: { label: 'Friendly', rate: 0.95, pitch: 1.1, sample: 'Hi! Tell me an expense and I will post it for you.' },
  calm: { label: 'Calm', rate: 0.9, pitch: 0.95, sample: 'Take your time. Say the entry whenever you are ready.' },
  gentle: { label: 'Gentle', rate: 0.85, pitch: 1.05, sample: 'I am listening. We can go step by step.' },
  cheerful: { label: 'Cheerful', rate: 1.1, pitch: 1.25, sample: 'Great, that one is posted! What is next?' },
  professional: { label: 'Professional', rate: 1.0, pitch: 1.0, sample: 'Expense recorded. Say confirm to post the next one.' },
};

/** Softer, female-sounding Windows voices first (Aria, Jenny, Zira, Hazel, Susan, Linda, Heather, Sara), then the rest. */
const PREFERRED = ['aria', 'jenny', 'zira', 'hazel', 'susan', 'linda', 'heather', 'sara', 'samantha', 'clara', 'natasha', 'libby', 'sonia', 'emma', 'ava', 'michelle', 'female'];
function voiceRank(v: SpeechSynthesisVoice): number {
  const n = v.name.toLowerCase();
  const idx = PREFERRED.findIndex((p) => n.includes(p));
  const english = /^en/i.test(v.lang) ? 0 : 50;
  return (idx === -1 ? 30 : idx) + english;
}
function sortVoices(list: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return [...list].filter((v) => /^en/i.test(v.lang) || list.length < 4).sort((a, b) => voiceRank(a) - voiceRank(b) || a.name.localeCompare(b.name));
}
function shortVoiceName(v: SpeechSynthesisVoice): string {
  return v.name.replace(/^Microsoft\s+/i, '').replace(/\s+(Online|Desktop)\b.*$/i, '').replace(/\s*-\s*English.*$/i, '').replace(/\(.*?\)/g, '').trim() || v.name;
}

const EXAMPLES = [
  'Expense 85 dollars 50 fuel at Shell on Visa with HST',
  'Paid 250 for office supplies from chequing, tax included, yesterday',
  'Income 200 scrap copper into cash with HST',
  'New company Lakeshore Plumbing Inc, plumber, year end December 31',
  'Open payroll',
  'How much does Maple Ridge owe?',
  'What is the balance of chequing?',
  'How do I file the HST return?',
  'Teach me quick entry',
  'How to create an invoice',
];

export function readVoiceEnabled(): boolean {
  try { return localStorage.getItem('helpTutor.voiceEnabled') === '1'; } catch { return false; }
}

export function VoiceAgentPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const setView = useUiStore((s) => s.setView);
  const setNewCompanyPrefill = useUiStore((s) => s.setNewCompanyPrefill);
  const setShowNewCompanyModal = useUiStore((s) => s.setShowNewCompanyModal);
  const companyOpen = useUiStore((s) => s.companyPath !== null);
  const pendingLessonId = useUiStore((s) => s.pendingLessonId);
  const setPendingLessonId = useUiStore((s) => s.setPendingLessonId);
  const capture = useVoiceCapture();
  const [phase, setPhase] = useState<Phase>('idle');
  const [transcript, setTranscript] = useState('');
  const [typed, setTyped] = useState('');
  const [command, setCommand] = useState<VoiceCommand | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [names, setNames] = useState<{ vendors: string[]; customers: string[] }>({ vendors: [], customers: [] });
  const [modelStatus, setModelStatus] = useState<{ ready: boolean; downloaded: boolean; error: string | null } | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  // Voice is optional and off until enabled in Settings; typing works everywhere, including over Remote Desktop.
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() => readVoiceEnabled());
  useEffect(() => { const refresh = () => setVoiceEnabled(readVoiceEnabled()); window.addEventListener('helpTutor.voiceEnabled', refresh); return () => window.removeEventListener('helpTutor.voiceEnabled', refresh); }, []);
  const [speak, setSpeak] = useState<boolean>(() => { try { return localStorage.getItem('voiceAgent.speak') === '1'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem('voiceAgent.speak', speak ? '1' : '0'); } catch { /* private window */ } }, [speak]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    void window.api.voice.status().then((r) => r.ok && setModelStatus(r.data));
    if (companyOpen) {
      void window.api.accounts.list({}).then((r) => r.ok && setAccounts(r.data));
      void Promise.all([window.api.vendors.list(), window.api.customers.list()]).then(([v, c]) => setNames({ vendors: v.ok ? v.data.map((x) => x.name) : [], customers: c.ok ? c.data.map((x) => x.name) : [] }));
    }
    return window.api.events.onVoiceProgress((line) => setProgress(line));
  }, [open, companyOpen]);

  // The read-back voice: the Windows voices installed on this machine, softer female ones first,
  // and a mood that sets pace and pitch. Both choices are remembered on this computer.
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState<string>(() => { try { return localStorage.getItem('voiceAgent.voice') ?? ''; } catch { return ''; } });
  const [mood, setMood] = useState<MoodId>(() => { try { return (localStorage.getItem('voiceAgent.mood') as MoodId) || 'friendly'; } catch { return 'friendly'; } });
  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return;
    const load = () => setVoices(sortVoices(speechSynthesis.getVoices()));
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);
  useEffect(() => { try { localStorage.setItem('voiceAgent.voice', voiceName); localStorage.setItem('voiceAgent.mood', mood); } catch { /* private window */ } }, [voiceName, mood]);

  const say = useCallback((text: string) => {
    setMessage(text);
    if (!speak || !voiceEnabled || typeof speechSynthesis === 'undefined') return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const chosen = voices.find((v) => v.name === voiceName) ?? voices[0];
      if (chosen) u.voice = chosen;
      u.lang = chosen?.lang ?? 'en-CA';
      u.rate = MOODS[mood].rate;
      u.pitch = MOODS[mood].pitch;
      speechSynthesis.speak(u);
    } catch { /* no voices on this machine */ }
  }, [speak, voiceEnabled, voices, voiceName, mood]);

  const context = useCallback(() => ({ today: localIsoDate(), accounts, businessTypes: BUSINESS_TYPES, vendorNames: names.vendors, customerNames: names.customers }), [accounts, names]);

  // A running lesson: which one and which step. The step's screen is opened before it is pointed at.
  const [lesson, setLesson] = useState<{ lesson: Lesson; index: number } | null>(null);
  const runStep = useCallback((l: Lesson, index: number) => {
    const step = l.steps[index];
    if (step.view) setView(step.view as View);
    setLesson({ lesson: l, index });
    say(step.say);
  }, [say, setView]);
  const startLesson = useCallback((l: Lesson) => {
    say(`${l.title}. ${l.intro}`);
    window.setTimeout(() => runStep(l, 0), 400);
  }, [runStep, say]);
  const lessonNext = useCallback(() => {
    if (!lesson) return;
    if (lesson.index + 1 >= lesson.lesson.steps.length) { setLesson(null); markLessonDone(lesson.lesson.id); say(lesson.lesson.outro); return; }
    runStep(lesson.lesson, lesson.index + 1);
  }, [lesson, runStep, say]);
  const lessonBack = useCallback(() => { if (lesson && lesson.index > 0) runStep(lesson.lesson, lesson.index - 1); }, [lesson, runStep]);
  const lessonStop = useCallback(() => { setLesson(null); say('Lesson stopped.'); }, [say]);
  useEffect(() => {
    if (!open || !pendingLessonId) return;
    const l = LESSONS.find((x) => x.id === pendingLessonId);
    setPendingLessonId(null);
    if (l) startLesson(l);
  }, [open, pendingLessonId, setPendingLessonId, startLesson]);

  const postQuickEntry = useCallback(async (cmd: QuickEntryCommand) => {
    if (cmd.missing.length > 0 || cmd.categoryAccountId === null || cmd.moneyAccountId === null) {
      say(describeCommand(cmd, accounts));
      return;
    }
    setPhase('posting');
    const result = await window.api.quickEntry.create({
      type: cmd.type, entryDate: cmd.entryDate, moneyAccountId: cmd.moneyAccountId, categoryAccountId: cmd.categoryAccountId,
      baseCents: cmd.baseCents, taxCode: cmd.taxCode, taxCents: cmd.taxCents, description: cmd.description || null,
    });
    if (!result.ok) { setError(result.error); setPhase('review'); say('That was refused. ' + result.error); return; }
    setCommand(null);
    setTranscript('');
    setPhase('idle');
    say(`Posted. ${cmd.type === 'expense' ? 'Expense' : 'Income'} $${(cmd.baseCents / 100).toFixed(2)} to ${accounts.find((a) => a.id === cmd.categoryAccountId)?.name ?? 'the account'}.`);
  }, [accounts, say]);

  const act = useCallback(async (cmd: VoiceCommand) => {
    setError(null);
    switch (cmd.kind) {
      case 'confirm':
        if (command?.kind === 'quickEntry') await postQuickEntry(command);
        else say('Nothing is waiting to be posted.');
        return;
      case 'cancel':
        setCommand(null); setTranscript(''); setPhase('idle'); say('Cancelled.');
        return;
      case 'navigate':
        setView(cmd.view as View); say(describeCommand(cmd, accounts)); onClose();
        return;
      case 'createCompany':
        setNewCompanyPrefill({ legalName: cmd.legalName, businessType: cmd.businessType, fiscalYearEnd: cmd.fiscalYearEnd, businessNumber: cmd.businessNumber });
        setShowNewCompanyModal(true);
        say(describeCommand(cmd, accounts));
        onClose();
        return;
      case 'quickEntry':
        if (!companyOpen) { say('Open a company first, then I can post entries.'); return; }
        setCommand(cmd); setPhase('review'); say(describeCommand(cmd, accounts));
        return;
      case 'help':
        setCommand(cmd); setPhase('idle'); say(cmd.answer);
        return;
      case 'teach': {
        const l = LESSONS.find((x) => x.id === cmd.lessonId);
        if (!l) { say('I do not have that lesson yet.'); return; }
        if (!companyOpen && l.steps.some((s) => s.view)) { say('Open a company first, then I can walk you through it on the real screen.'); return; }
        setCommand(null); setPhase('idle');
        startLesson(l);
        return;
      }
      case 'query': {
        if (!companyOpen) { say('Open a company first, then I can look that up.'); return; }
        setCommand(cmd); setPhase('idle'); setMessage('Looking it up…');
        say(await answerQuery(cmd, accounts));
        return;
      }
      default:
        setPhase('idle'); say(describeCommand(cmd, accounts));
    }
  }, [accounts, command, companyOpen, onClose, postQuickEntry, say, setNewCompanyPrefill, setShowNewCompanyModal, setView]);

  const handleText = useCallback(async (text: string) => {
    setTranscript(text);
    // Inside a lesson, "next", "back", "repeat" and "stop" steer the lesson before anything else.
    if (lesson) {
      const control = parseLessonControl(text);
      if (control === 'next') { lessonNext(); return; }
      if (control === 'back') { lessonBack(); return; }
      if (control === 'repeat') { say(lesson.lesson.steps[lesson.index].say); return; }
      if (control === 'stop') { lessonStop(); return; }
    }
    const cmd = parseVoiceCommand(text, context());
    await act(cmd);
  }, [act, context, lesson, lessonBack, lessonNext, lessonStop, say]);

  async function toggleListening() {
    if (capture.state === 'listening') {
      const samples = capture.stop();
      setPhase('transcribing');
      const result = await window.api.voice.transcribe({ samples });
      if (!result.ok) { setError(result.error); setPhase('idle'); return; }
      if (!result.data.text) { setPhase('idle'); say("I didn't hear anything."); return; }
      await handleText(result.data.text);
      return;
    }
    setError(null);
    await capture.start();
    if (capture.state === 'denied') setError('Microphone access was refused. Allow the microphone for Apex Ledger in Windows Settings → Privacy → Microphone.');
    setPhase('listening');
  }

  useEffect(() => { if (capture.state === 'listening') setPhase('listening'); }, [capture.state]);

  if (!open) return null;
  const listening = capture.state === 'listening';
  const quick = command?.kind === 'quickEntry' ? command : null;
  const accountName = (id: number | null) => accounts.find((a) => a.id === id)?.name ?? '—';

  return (
    <>
    {lesson && <LessonOverlay lesson={lesson.lesson} index={lesson.index} onNext={lessonNext} onBack={lessonBack} onStop={lessonStop} />}
    <div className={`fixed bottom-4 right-4 z-40 w-[26rem] max-w-[calc(100vw-2rem)] rounded-lg border border-brand-200 bg-white shadow-xl ${lesson ? 'opacity-90' : ''}`} data-testid="voice-agent">
      <div className="flex items-center justify-between rounded-t-lg bg-brand-800 px-3 py-2 text-white">
        <div className="text-sm font-semibold">Help &amp; Tutor</div>
        <div className="flex items-center gap-2 text-xs">
          {!voiceEnabled && <span className="text-brand-200">Voice off · Settings to enable</span>}
          {voiceEnabled && <label className="flex items-center gap-1"><input type="checkbox" checked={speak} onChange={(e) => setSpeak(e.target.checked)} /> Read back</label>}
          {voiceEnabled && <select value={voiceName} onChange={(e) => setVoiceName(e.target.value)} title="Voice" aria-label="Read-back voice" className="max-w-[9rem] rounded border border-brand-600 bg-brand-700 px-1 py-0.5 text-white">
            {voices.length === 0 && <option value="">Default voice</option>}
            {voices.map((v) => <option key={v.name} value={v.name}>{shortVoiceName(v)}</option>)}
          </select>}
          {voiceEnabled && <select value={mood} onChange={(e) => setMood(e.target.value as MoodId)} title="Mood" aria-label="Read-back mood" className="rounded border border-brand-600 bg-brand-700 px-1 py-0.5 text-white">
            {(Object.keys(MOODS) as MoodId[]).map((m) => <option key={m} value={m}>{MOODS[m].label}</option>)}
          </select>}
          {voiceEnabled && <button type="button" onClick={() => say(MOODS[mood].sample)} title="Hear this voice" className="rounded px-1.5 py-0.5 hover:bg-brand-700">▶</button>}
          <button type="button" onClick={onClose} className="rounded px-2 py-0.5 hover:bg-brand-700" aria-label="Close Help & Tutor">✕</button>
        </div>
      </div>
      <div className="space-y-3 p-3">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const t = typed.trim(); if (t) { setTyped(''); void handleText(t); } }}>
          <input ref={inputRef} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Ask how to do something, start a lesson, or type an entry…" className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm" />
          <button type="submit" className="rounded bg-brand-700 px-3 py-1 text-sm font-medium text-white hover:bg-brand-800">Go</button>
        </form>

        {voiceEnabled && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void toggleListening()}
            disabled={phase === 'transcribing' || phase === 'posting'}
            className={`flex h-14 w-14 items-center justify-center rounded-full text-white shadow ${listening ? 'bg-red-600 animate-pulse' : 'bg-brand-700 hover:bg-brand-800'} disabled:opacity-50`}
            aria-label={listening ? 'Stop listening' : 'Start listening'}
            title={listening ? 'Stop and transcribe' : 'Speak'}
          >
            <MicGlyph />
          </button>
          <div className="min-w-0 flex-1 text-sm">
            {listening && <div className="font-medium text-red-700">Listening… press again when done.</div>}
            {phase === 'transcribing' && <div className="font-medium text-brand-700">Transcribing on this computer…</div>}
            {phase === 'posting' && <div className="font-medium text-brand-700">Posting…</div>}
            {!listening && phase !== 'transcribing' && phase !== 'posting' && <div className="text-gray-600">Or press the microphone and say it.</div>}
            {listening && <div className="mt-1 h-1.5 w-full rounded bg-gray-200"><div className="h-1.5 rounded bg-red-500" style={{ width: `${Math.min(100, Math.round(capture.level * 300))}%` }} /></div>}
            {modelStatus && !modelStatus.downloaded && !listening && (
              <div className="mt-1 text-xs text-amber-700">
                First use downloads the speech model (about 80 MB) to this computer. <button type="button" className="underline" onClick={() => { setProgress('Starting download…'); void window.api.voice.prepare().then((r) => { if (r.ok) setModelStatus(r.data); else setError(r.error); setProgress(null); }); }}>Download now</button>
                {progress && <div className="text-gray-500">{progress}</div>}
              </div>
            )}
          </div>
        </div>
        )}

        {transcript && <div className="rounded bg-gray-50 px-3 py-2 text-sm text-gray-800"><span className="text-xs uppercase tracking-wide text-gray-400">{voiceEnabled ? 'Heard' : 'You asked'}</span><br />“{transcript}”</div>}
        {message && <div className="text-sm text-brand-800" aria-live="polite">{message}</div>}
        {command?.kind === 'help' && command.view && (
          <button type="button" onClick={() => { setView(command.view as View); onClose(); }} className="rounded-full border border-brand-300 bg-brand-50 px-3 py-1 text-sm text-brand-800 hover:bg-brand-100">Open {command.viewLabel} →</button>
        )}
        {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        {quick && (
          <div className="rounded border border-brand-200 bg-brand-50 p-3 text-sm" data-testid="voice-review">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-700">{quick.type === 'expense' ? 'Expense' : 'Income'} to post</div>
            <table className="w-full">
              <tbody>
                <Row label="Date" value={quick.entryDate} />
                <Row label="Amount" value={`$${(quick.baseCents / 100).toFixed(2)}${quick.taxCents > 0 ? ` + tax $${(quick.taxCents / 100).toFixed(2)} = $${((quick.baseCents + quick.taxCents) / 100).toFixed(2)}` : ''}`} missing={quick.missing.includes('amount')} />
                <Row label="Tax code" value={quick.taxCode ?? 'None'} />
                <Row label="Category" value={quick.categoryAccountId ? accountName(quick.categoryAccountId) : `not found${quick.categoryText ? ` for “${quick.categoryText}”` : ''}`} missing={quick.missing.includes('category')} />
                <Row label={quick.type === 'expense' ? 'Paid from' : 'Into'} value={quick.moneyAccountId ? accountName(quick.moneyAccountId) : `not found${quick.moneyText ? ` for “${quick.moneyText}”` : ''}`} missing={quick.missing.includes('moneyAccount')} />
                <Row label="Description" value={quick.description || '—'} />
              </tbody>
            </table>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => void postQuickEntry(quick)} disabled={quick.missing.length > 0 || phase === 'posting'} className="rounded-full bg-brand-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50">Post</button>
              <button type="button" onClick={() => { setView({ kind: 'quickEntry', type: quick.type, prefill: { entryDate: quick.entryDate, moneyAccountId: quick.moneyAccountId, categoryAccountId: quick.categoryAccountId, baseCents: quick.baseCents, taxCode: quick.taxCode, taxCents: quick.taxCents, description: quick.description } }); onClose(); }} className="rounded-full border border-brand-300 px-4 py-1.5 text-sm text-brand-800 hover:bg-white">Open in Quick Entry to adjust</button>
              <button type="button" onClick={() => { setCommand(null); setPhase('idle'); }} className="rounded-full px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
            </div>
            {quick.missing.length > 0 && <p className="mt-2 text-xs text-gray-600">Say the missing part, or open it in Quick Entry to pick from the lists.</p>}
          </div>
        )}

        {!quick && !transcript && (
          <div className="text-xs text-gray-500">
            <div className="mb-1 font-medium text-gray-600">Try typing</div>
            <ul className="space-y-0.5">{EXAMPLES.map((e) => <li key={e}>• {e}</li>)}</ul>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

const dollars =(cents: number) => `$${(Math.abs(cents) / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Answers a question about the books from the same reports the screens use. */
async function answerQuery(cmd: QueryCommand, accounts: Account[]): Promise<string> {
  const when = cmd.periodLabel;
  switch (cmd.question) {
    case 'accountBalance': case 'cash': {
      const tb = await window.api.reports.trialBalance({ asOfDate: cmd.to });
      if (!tb.ok) return tb.error;
      const rows = tb.data.rows;
      if (cmd.question === 'accountBalance') {
        const row = rows.find((r) => r.account.id === cmd.subjectAccountId);
        const acct = accounts.find((a) => a.id === cmd.subjectAccountId);
        const net = row ? row.debitCents - row.creditCents : 0;
        const bal = acct?.normalBalance === 'Credit' ? -net : net;
        return `${acct?.name ?? 'That account'} is ${dollars(bal)}${bal < 0 ? ' on the wrong side' : ''} as of ${cmd.to}.`;
      }
      const banks = rows.filter((r) => r.account.accountSubtype === 'Cash and Bank');
      const total = banks.reduce((s, r) => s + r.debitCents - r.creditCents, 0);
      return `Cash and bank total ${dollars(total)}: ${banks.map((r) => `${r.account.name} ${dollars(r.debitCents - r.creditCents)}`).join(', ')}.`;
    }
    case 'customerOwes': case 'receivables': {
      const [inv, cust] = await Promise.all([window.api.invoices.list(), window.api.customers.list()]);
      if (!inv.ok) return inv.error;
      const names = new Map((cust.ok ? cust.data : []).map((c) => [c.id, c.name]));
      const open = inv.data.filter((i) => i.balanceDueCents > 0);
      if (cmd.question === 'customerOwes') {
        const mine = open.filter((i) => names.get(i.customerId) === cmd.subjectName);
        const total = mine.reduce((s, i) => s + i.balanceDueCents, 0);
        return mine.length === 0 ? `${cmd.subjectName} owes nothing.` : `${cmd.subjectName} owes ${dollars(total)} on ${mine.length} ${mine.length === 1 ? 'invoice' : 'invoices'}: ${mine.map((i) => `${i.invoiceNumber} ${dollars(i.balanceDueCents)}`).join(', ')}.`;
      }
      const byCustomer = new Map<string, number>();
      for (const i of open) byCustomer.set(names.get(i.customerId) ?? 'Unknown', (byCustomer.get(names.get(i.customerId) ?? 'Unknown') ?? 0) + i.balanceDueCents);
      const total = open.reduce((s, i) => s + i.balanceDueCents, 0);
      const top = [...byCustomer.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      return `Customers owe ${dollars(total)} in total. ${top.map(([n, c]) => `${n} ${dollars(c)}`).join(', ')}.`;
    }
    case 'vendorOwed': case 'payables': {
      const [bills, vend] = await Promise.all([window.api.bills.list(), window.api.vendors.list()]);
      if (!bills.ok) return bills.error;
      const names = new Map((vend.ok ? vend.data : []).map((v) => [v.id, v.name]));
      const open = bills.data.filter((b) => b.balanceDueCents > 0);
      if (cmd.question === 'vendorOwed') {
        const mine = open.filter((b) => names.get(b.vendorId) === cmd.subjectName);
        const total = mine.reduce((s, b) => s + b.balanceDueCents, 0);
        return mine.length === 0 ? `Nothing is owed to ${cmd.subjectName}.` : `You owe ${cmd.subjectName} ${dollars(total)} on ${mine.length} ${mine.length === 1 ? 'bill' : 'bills'}: ${mine.map((b) => `${b.billNumber ?? 'bill'} ${dollars(b.balanceDueCents)}`).join(', ')}.`;
      }
      const total = open.reduce((s, b) => s + b.balanceDueCents, 0);
      const byVendor = new Map<string, number>();
      for (const b of open) byVendor.set(names.get(b.vendorId) ?? 'Unknown', (byVendor.get(names.get(b.vendorId) ?? 'Unknown') ?? 0) + b.balanceDueCents);
      const top = [...byVendor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      return `You owe ${dollars(total)} in total. ${top.map(([n, c]) => `${n} ${dollars(c)}`).join(', ')}.`;
    }
    case 'hstOwing': {
      const r = await window.api.reports.hstSummary({ periodStart: cmd.from, periodEnd: cmd.to });
      if (!r.ok) return r.error;
      const rows = r.data.monthly.filter((p) => p.period >= cmd.from.slice(0, 7) && p.period <= cmd.to.slice(0, 7));
      const collected = rows.reduce((s, p) => s + p.collectedCents, 0);
      const itc = rows.reduce((s, p) => s + p.itcCents, 0);
      const net = collected - itc;
      return `GST/HST ${when}: collected ${dollars(collected)}, input tax credits ${dollars(itc)}, ${net >= 0 ? 'owing' : 'refund'} ${dollars(net)}.`;
    }
    case 'sales': case 'expenses': case 'netIncome': {
      const r = await window.api.reports.incomeStatement({ periodStart: cmd.from, periodEnd: cmd.to });
      if (!r.ok) return r.error;
      const pl = r.data;
      if (cmd.question === 'sales') return `Revenue ${when} is ${dollars(pl.revenue.totalCents)}.`;
      if (cmd.question === 'expenses') return `Expenses ${when} are ${dollars(pl.operatingExpenses.totalCents + pl.costOfSales.totalCents)}: cost of sales ${dollars(pl.costOfSales.totalCents)}, operating ${dollars(pl.operatingExpenses.totalCents)}.`;
      return `Net ${pl.netIncomeCents >= 0 ? 'income' : 'loss'} ${when} is ${dollars(pl.netIncomeCents)} on revenue of ${dollars(pl.revenue.totalCents)}.`;
    }
  }
}

function Row({ label, value, missing }: { label: string; value: string; missing?: boolean }) {
  return (
    <tr>
      <td className="w-24 py-0.5 pr-2 text-xs text-gray-500">{label}</td>
      <td className={`py-0.5 ${missing ? 'font-medium text-red-700' : 'text-gray-900'}`}>{value}</td>
    </tr>
  );
}

function MicGlyph() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
    </svg>
  );
}
