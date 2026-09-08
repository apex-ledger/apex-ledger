import { useEffect, useState } from 'react';
import { isWeb } from '../../utils/platform';
import type { AppSettingsView } from '../../../preload/index';

/**
 * Three things that are not accounting settings but need a home: the logo on customer PDFs
 * (kept in the company file), and two installation-wide choices — where a second copy of every
 * backup goes, and how email leaves the app. The last two are the same for every client opened
 * on this machine, so they are saved with the installation, not with any company.
 */
export function InstallationSettingsSection({ logoDataUrl, onLogoChanged }: { logoDataUrl: string | null; onLogoChanged: (next: string | null) => void }) {
  const [settings, setSettings] = useState<AppSettingsView | null>(null);
  const [password, setPassword] = useState('');
  const [testTo, setTestTo] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    window.api.appSettings.get().then((r) => r.ok && setSettings(r.data));
  }, []);

  async function pickLogo() {
    setError(null);
    const r = await window.api.company.pickLogo();
    if (!r.ok) return setError(r.error);
    if (!r.data.picked) return;
    const saved = await window.api.company.update({ logoDataUrl: r.data.dataUrl });
    if (!saved.ok) return setError(saved.error);
    onLogoChanged(r.data.dataUrl);
    setNotice('Logo saved. It now prints at the top of invoices, sales receipts and statements.');
  }

  async function removeLogo() {
    const saved = await window.api.company.update({ logoDataUrl: null });
    if (!saved.ok) return setError(saved.error);
    onLogoChanged(null);
    setNotice('Logo removed.');
  }

  async function pickBackupFolder() {
    const r = await window.api.appSettings.pickBackupFolder();
    if (!r.ok) return setError(r.error);
    if (!r.data.picked || !settings) return;
    const next = { ...settings, secondaryBackupFolder: r.data.folder };
    const saved = await window.api.appSettings.save({ secondaryBackupFolder: next.secondaryBackupFolder, email: next.email });
    if (!saved.ok) return setError(saved.error);
    setSettings(saved.data);
    setNotice(`Every backup will also be copied to ${r.data.folder}.`);
  }

  async function clearBackupFolder() {
    if (!settings) return;
    const saved = await window.api.appSettings.save({ secondaryBackupFolder: null, email: settings.email });
    if (!saved.ok) return setError(saved.error);
    setSettings(saved.data);
  }

  async function saveEmail() {
    if (!settings) return;
    setBusy('save');
    setError(null);
    const saved = await window.api.appSettings.save({ secondaryBackupFolder: settings.secondaryBackupFolder, email: settings.email, smtpPassword: password || undefined });
    setBusy(null);
    if (!saved.ok) return setError(saved.error);
    setSettings(saved.data);
    setPassword('');
    setNotice(settings.email.mode === 'smtp' ? 'Email settings saved. Send a test to make sure they work.' : 'Email will open a draft in desktop Outlook.');
  }

  async function sendTest() {
    setBusy('test');
    setError(null);
    const r = await window.api.appSettings.sendTestEmail({ to: testTo });
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setNotice(`Test message sent to ${testTo}. Check the inbox (and junk folder).`);
  }

  const email = settings?.email;

  return (
    <>
      <div className="col-span-full mt-2 rounded border border-gray-200 bg-gray-50 p-3" data-testid="logo-settings">
        <div className="text-sm font-semibold text-gray-800">Logo on invoices, receipts and statements</div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {logoDataUrl ? <img src={logoDataUrl} alt="Company logo" className="h-12 max-w-[12rem] rounded bg-white object-contain p-1 ring-1 ring-gray-200" /> : <span className="text-xs text-gray-500">No logo yet. The company name prints on its own.</span>}
          <button type="button" onClick={() => void pickLogo()} className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100">{logoDataUrl ? 'Change logo…' : 'Choose logo…'}</button>
          {logoDataUrl && <button type="button" onClick={() => void removeLogo()} className="text-xs text-gray-500 hover:underline">Remove</button>}
        </div>
        <p className="mt-1 text-[11px] text-gray-500">PNG or JPG up to 400 KB, ideally wide rather than tall. It prints at the top right of customer PDFs, beside the company name.</p>
      </div>

      <VoiceModelCard />

      {/* On the web the server's disk is backed up nightly as a whole; there is no second folder to pick. */}
      {!isWeb() && (
      <div className="col-span-full mt-2 rounded border border-gray-200 bg-gray-50 p-3" data-testid="backup-settings">
        <div className="text-sm font-semibold text-gray-800">Backups — second copy</div>
        <p className="mt-1 text-xs text-gray-600">Automatic backups already go to the Backups folder beside each company file. Pick a second place — a OneDrive or Google Drive folder, a network share, an external drive — and every backup is copied there too, so a lost disk does not mean lost books.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded bg-white px-2 py-1 text-xs text-gray-700 ring-1 ring-gray-200">{settings?.secondaryBackupFolder ?? 'Not set'}</span>
          <button type="button" onClick={() => void pickBackupFolder()} className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100">Choose folder…</button>
          {settings?.secondaryBackupFolder && <button type="button" onClick={() => void clearBackupFolder()} className="text-xs text-gray-500 hover:underline">Stop copying</button>}
        </div>
      </div>
      )}

      <div className="col-span-full mt-2 rounded border border-gray-200 bg-gray-50 p-3" data-testid="email-settings">
        <div className="text-sm font-semibold text-gray-800">Email — statements, reminders, invoices and forms</div>
        {email && (
          <>
            <div className="mt-2 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="radio" checked={email.mode === 'outlook'} onChange={() => setSettings({ ...settings!, email: { ...email, mode: 'outlook' } })} /> Open a draft in desktop Outlook (you press Send)</label>
              <label className="flex items-center gap-2"><input type="radio" checked={email.mode === 'smtp'} onChange={() => setSettings({ ...settings!, email: { ...email, mode: 'smtp' } })} /> Send directly through a mail server</label>
            </div>
            {email.mode === 'smtp' && (
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                <label className="block text-sm"><span className="text-gray-600">Mail server</span><input className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={email.host} onChange={(e) => setSettings({ ...settings!, email: { ...email, host: e.target.value.trim() } })} placeholder="smtp.office365.com" /></label>
                <label className="block text-sm"><span className="text-gray-600">Port</span><input inputMode="numeric" className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={email.port} onChange={(e) => setSettings({ ...settings!, email: { ...email, port: Number(e.target.value) || 587 } })} /></label>
                <label className="block text-sm"><span className="text-gray-600">Security</span>
                  <select className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5" value={email.security} onChange={(e) => setSettings({ ...settings!, email: { ...email, security: e.target.value as 'starttls' | 'tls' } })}>
                    <option value="starttls">STARTTLS (port 587 — Microsoft 365, Gmail)</option>
                    <option value="tls">TLS (port 465)</option>
                  </select>
                </label>
                <label className="block text-sm"><span className="text-gray-600">Sign-in name</span><input className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={email.user} onChange={(e) => setSettings({ ...settings!, email: { ...email, user: e.target.value.trim() } })} placeholder="you@yourfirm.ca" autoComplete="off" /></label>
                <label className="block text-sm"><span className="text-gray-600">Password or app password {settings?.smtpPasswordSet ? '(saved)' : ''}</span><input type="password" className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={settings?.smtpPasswordSet ? '•••••••• (leave blank to keep)' : ''} autoComplete="new-password" /></label>
                <label className="block text-sm"><span className="text-gray-600">From name</span><input className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={email.fromName} onChange={(e) => setSettings({ ...settings!, email: { ...email, fromName: e.target.value } })} placeholder="Your Firm Name" /></label>
                <label className="block text-sm md:col-span-2"><span className="text-gray-600">From address</span><input className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={email.fromAddress} onChange={(e) => setSettings({ ...settings!, email: { ...email, fromAddress: e.target.value.trim() } })} placeholder="accounts@yourfirm.ca" /></label>
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" disabled={busy !== null} onClick={() => void saveEmail()} className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-800 hover:bg-brand-200 disabled:opacity-50">{busy === 'save' ? 'Saving…' : 'Save email settings'}</button>
              {email.mode === 'smtp' && (
                <>
                  <input className="w-56 rounded border border-gray-300 px-2 py-1 text-xs" value={testTo} onChange={(e) => setTestTo(e.target.value.trim())} placeholder="send a test to…" />
                  <button type="button" disabled={!testTo || busy !== null} onClick={() => void sendTest()} className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50">{busy === 'test' ? 'Sending…' : 'Send test'}</button>
                </>
              )}
            </div>
            <p className="mt-1 text-[11px] text-gray-500">The password is stored encrypted on this computer only. Microsoft 365 and Gmail need an app password, not the normal sign-in password. Example: Microsoft 365 is smtp.office365.com, port 587, STARTTLS, with the mailbox address as the sign-in name.</p>
          </>
        )}
      </div>
      {error && <div className="col-span-full rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {notice && <div className="col-span-full rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>}
    </>
  );
}

/** The speech model behind the voice agent: where it lives, whether it is on this computer yet. */
function VoiceModelCard() {
  const [status, setStatus] = useState<{ modelId: string; ready: boolean; downloaded: boolean; modelDir: string; error: string | null } | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() => { try { return localStorage.getItem('helpTutor.voiceEnabled') === '1'; } catch { return false; } });
  function toggleVoice(next: boolean) {
    setVoiceEnabled(next);
    try { localStorage.setItem('helpTutor.voiceEnabled', next ? '1' : '0'); window.dispatchEvent(new Event('helpTutor.voiceEnabled')); } catch { /* private window */ }
  }
  useEffect(() => {
    void window.api.voice.status().then((r) => r.ok && setStatus(r.data));
    return window.api.events.onVoiceProgress((line) => setProgress(line));
  }, []);
  async function download() {
    setBusy(true);
    setProgress('Starting…');
    const r = await window.api.voice.prepare();
    setBusy(false);
    setProgress(null);
    if (r.ok) setStatus(r.data);
    else setStatus((s) => (s ? { ...s, error: r.error } : s));
  }
  return (
    <div className="col-span-full mt-2 rounded border border-gray-200 bg-gray-50 p-3" data-testid="voice-settings">
      <div className="text-sm font-semibold text-gray-800">Help &amp; Tutor — voice (optional)</div>
      <p className="mt-1 text-xs text-gray-600">Help &amp; Tutor works by typing: ask how to do something, start a lesson, or type an entry. Voice is off unless you turn it on here. When on, the panel gains a microphone and a read-back voice; recognition runs on this computer with an open-source Whisper model and audio never leaves the machine. The model (about 80 MB) is downloaded once from Hugging Face on first use.</p>
      <label className="mt-2 flex items-center gap-2 text-sm text-gray-800"><input type="checkbox" checked={voiceEnabled} onChange={(e) => toggleVoice(e.target.checked)} /> Enable the microphone and read-back on this computer</label>
      {voiceEnabled && <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span className={`rounded px-2 py-1 text-xs ring-1 ${status?.downloaded ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-white text-gray-700 ring-gray-200'}`}>{status ? (status.downloaded ? 'Model on this computer' : 'Not downloaded yet') : 'Checking…'}</span>
        {status && !status.downloaded && <button type="button" onClick={() => void download()} disabled={busy} className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50">{busy ? 'Downloading…' : 'Download now'}</button>}
        {progress && <span className="text-xs text-gray-500">{progress}</span>}
        {status?.error && <span className="text-xs text-red-700">{status.error}</span>}
      </div>}
      {voiceEnabled && status && <p className="mt-1 text-[11px] text-gray-500">{status.modelId} · {status.modelDir}</p>}
    </div>
  );
}
