import { useEffect, useState } from 'react';
import { useUiStore } from '../../app/store/uiStore';
import { Logo } from '../../components/Logo';
import { IconLock } from '../../components/icons';

const LOGIN_ID = 'admin';
const LOGIN_PASSWORD = 'NL1970';

function companyNameFromPath(filePath: string): string {
  return filePath.split(/[\\/]/).pop()?.replace(/\.company$/, '') ?? filePath;
}

/** A simple shared-PIN gate, not a real multi-user account system — this computer is used by
 * several people with no separate Windows logins of their own, so the goal is just a light
 * deterrent against casually opening the software, not per-person authentication. Checked
 * entirely client-side and not persisted: closing and reopening the app asks again, which is the
 * point of having it at all. */
export function LoginGate({ lastCompanyPath, onSuccess, heading = 'Sign In' }: { lastCompanyPath: string | null; onSuccess: () => void; heading?: string }) {
  // On the web the person already signed in with their own email and password at the server, so
  // this shared-PIN gate is skipped and their identity is stamped on the session instead.
  const web = (window as unknown as { __apexWeb?: { user: { name: string; email: string } } }).__apexWeb;
  useEffect(() => {
    if (!web) return;
    void window.api.access.setIdentity({ key: `web:${web.user.email}`, name: web.user.name, email: web.user.email }).then(() => onSuccess());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (loginId.trim().toLowerCase() === LOGIN_ID && password === LOGIN_PASSWORD) {
      const result = await window.api.access.setIdentity({ key: 'local:administrator', name: 'Local Administrator', email: null });
      if (result.ok) {
        setError(null);
        onSuccess();
      } else {
        setError(result.error);
      }
    } else {
      setError('Incorrect login ID or password.');
    }
  }

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-gradient-to-b from-brand-900 via-brand-800 to-brand-900">
      {lastCompanyPath && (
        <div className="mb-3 rounded-full border border-gold-400/30 bg-brand-800/60 px-4 py-1.5 text-xs text-brand-100">
          Last opened: <span className="font-semibold text-gold-300">{companyNameFromPath(lastCompanyPath)}</span>
        </div>
      )}

      <div className="w-full max-w-sm rounded-2xl border border-gold-400/20 bg-white p-8 shadow-2xl">
        <div className="flex flex-col items-center text-center">
          <Logo size="lg" showTagline />
          <div className="mt-3 h-px w-16 bg-gold-400" />
          <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-brand-800">
            <IconLock className="h-4 w-4" />
            {heading}
          </div>
        </div>

        {error && <div className="mt-3 rounded bg-red-50 px-3 py-2 text-center text-sm text-red-700">{error}</div>}

        <div className="mt-5 space-y-3">
          <label className="block text-sm">
            <span className="text-gray-600">Login ID</span>
            <input
              autoFocus
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Password</span>
            <input
              type="password"
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </label>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!loginId.trim() || !password}
          className="mt-5 w-full rounded-full bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
        >
          {heading === 'Unlock Apex Ledger' ? 'Unlock' : 'Sign In'}
        </button>
      </div>
    </div>
  );
}

export function WelcomePage() {
  const setCompany = useUiStore((s) => s.setCompany);
  const setView = useUiStore((s) => s.setView);
  const setShowNewCompanyModal = useUiStore((s) => s.setShowNewCompanyModal);
  const [recents, setRecents] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  // While true, the company-picker card is skipped entirely and the last company opens straight
  // into the real app — the picker only ever shows if there's no recent company to jump to, or
  // that auto-open attempt failed (see the effect below, which flips this back off on failure).
  const [autoOpening, setAutoOpening] = useState(false);

  useEffect(() => {
    window.api.company.listRecent().then((r) => r.ok && setRecents(r.data));
  }, []);

  async function handleOpen(filePath?: string) {
    setBusy(true);
    setError(null);
    const result = await window.api.company.open(filePath);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    if (result.data.opened) setCompany(result.data.filePath, result.data.company.legalName);
  }

  async function handleInstallDemo() {
    setBusy(true);
    setError(null);
    const result = await window.api.company.installDemo();
    setBusy(false);
    if (!result.ok) return setError(result.error);
    if (result.data.opened) setCompany(result.data.filePath, result.data.company.legalName);
  }

  /** The fictitious test company — every flow already exercised; see docs/TEST-COMPANY-EXPECTED-RESULTS.md. */
  async function handleOpenTestCompany() {
    setBusy(true);
    setError(null);
    const result = await window.api.company.installTestCompany();
    setBusy(false);
    if (!result.ok) return setError(result.error);
    if (result.data.opened) setCompany(result.data.filePath, result.data.company.legalName);
  }

  useEffect(() => {
    if (!signedIn || recents.length === 0) return;
    setAutoOpening(true);
    (async () => {
      const result = await window.api.company.open(recents[0]);
      if (result.ok && result.data.opened) {
        setCompany(result.data.filePath, result.data.company.legalName);
        return; // setCompany switches the whole app away from this page — nothing left to do.
      }
      // Couldn't reopen it (e.g. the file moved) — fall back to the normal picker with the error shown.
      setAutoOpening(false);
      setError(!result.ok ? result.error : 'Could not reopen the last company.');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  if (!signedIn) {
    return <LoginGate lastCompanyPath={recents[0] ?? null} onSuccess={() => setSignedIn(true)} />;
  }

  // No styled full-screen page here on purpose — this is a near-instant local file open, and a
  // second colored page flashing between the login screen and the real app would be more jarring
  // than just staying blank for the split second it takes.
  if (autoOpening) return null;

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-gradient-to-b from-brand-900 via-brand-800 to-brand-900">
      {recents.length > 0 && (
        <div className="mb-3 rounded-full border border-gold-400/30 bg-brand-800/60 px-4 py-1.5 text-xs text-brand-100">
          Last opened: <span className="font-semibold text-gold-300">{companyNameFromPath(recents[0])}</span>
        </div>
      )}

      <div className="w-full max-w-lg rounded-2xl border border-gold-400/20 bg-white p-8 shadow-2xl">
        <div className="flex flex-col items-center text-center">
          <Logo size="lg" showTagline />
          <div className="mt-3 h-px w-16 bg-gold-400" />
        </div>
        <p className="mt-3 text-center text-sm text-gray-500">
          Double-entry accounting with GIFI mapping and HST tracking for Canadian businesses.
        </p>

        {error && <div className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="mt-3 flex gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => setShowNewCompanyModal(true)}
            className="flex-1 rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
          >
            Create New Company
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => handleOpen()}
            className="flex-1 rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
          >
            Open Company File…
          </button>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={handleInstallDemo}
          className="mt-3 w-full rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-200 disabled:opacity-50"
        >
          Open Comprehensive Demo Company
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={handleOpenTestCompany}
          className="mt-3 w-full rounded-full bg-sky-100 px-4 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-200 disabled:opacity-50"
          title="Northwind Bookkeeping Test Co. — every flow already exercised, with a sheet of expected figures to check each screen against"
        >
          Open Test Company (Northwind Bookkeeping)
        </button>

        <button
          type="button"
          onClick={() => setView({ kind: 'clientHub' })}
          className="mt-3 w-full rounded-full bg-gold-100 px-4 py-2 text-sm font-medium text-gold-800 hover:bg-gold-200"
        >
          📅 Client Reminders &amp; Filing Deadlines
        </button>

        {recents.length > 0 && (
          <div className="mt-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Recent Companies</h2>
            <ul className="mt-2 space-y-1">
              {recents.map((path) => (
                <li key={path}>
                  <button
                    type="button"
                    onClick={() => handleOpen(path)}
                    className="w-full truncate rounded px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100"
                    title={path}
                  >
                    {companyNameFromPath(path)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
