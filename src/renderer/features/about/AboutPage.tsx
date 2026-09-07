import { useEffect, useState } from 'react';
import { Logo } from '../../components/Logo';

const CONTACT_PHONE = '416-365-1800';
const CONTACT_EMAIL = 'info@pjinsuretax.ca';

interface LicenseInfo {
  licensed: boolean;
  customer?: string;
  expires?: string | null;
  error?: string;
}

export function AboutPage() {
  const [version, setVersion] = useState<string | null>(null);
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [reactivateKey, setReactivateKey] = useState('');
  const [reactivating, setReactivating] = useState(false);
  const [reactivateError, setReactivateError] = useState<string | null>(null);

  function refresh() {
    window.api.app.getVersion().then((r) => r.ok && setVersion(r.data));
    window.api.license.status().then((r) => setLicense(r.ok ? r.data : { licensed: false, error: r.error }));
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleReactivate() {
    if (!reactivateKey.trim()) return;
    setReactivating(true);
    setReactivateError(null);
    const result = await window.api.license.activate(reactivateKey);
    setReactivating(false);
    if (!result.ok) return setReactivateError(result.error);
    if (!result.data.licensed) return setReactivateError(result.data.error ?? 'This license key is not valid.');
    setReactivateKey('');
    refresh();
  }

  return (
    <div className="max-w-2xl space-y-3">
      <div>
        <Logo size="sm" />
        <h1 className="mt-3 text-lg font-semibold text-brand-900">About &amp; License</h1>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Version</h2>
        <div className="rounded border border-gray-200 bg-white p-3 text-sm text-gray-700">
          Apex Ledger {version ? `— Version ${version}` : ''}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">License</h2>
        <div className="rounded border border-gray-200 bg-white p-3 text-sm">
          {license === null ? (
            <p className="text-gray-400">Checking…</p>
          ) : license.licensed ? (
            <div className="space-y-1 text-gray-700">
              <p>
                <span className="font-medium text-green-700">✓ Licensed</span>
                {license.customer && <> to {license.customer}</>}
              </p>
              <p className="text-gray-500">{license.expires ? `Valid until ${license.expires}` : 'No expiry on this license.'}</p>
            </div>
          ) : (
            <p className="text-red-600">{license.error ?? 'Not licensed.'}</p>
          )}

          <div className="mt-3 border-t border-gray-100 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Activate a different license key</p>
            <div className="flex gap-2">
              <textarea
                value={reactivateKey}
                onChange={(e) => setReactivateKey(e.target.value)}
                rows={2}
                placeholder="Paste a license key here"
                className="flex-1 rounded border border-gray-300 px-2 py-1.5 font-mono text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <button
                type="button"
                disabled={reactivating || !reactivateKey.trim()}
                onClick={handleReactivate}
                className="rounded bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {reactivating ? 'Activating…' : 'Activate'}
              </button>
            </div>
            {reactivateError && <p className="mt-2 text-sm text-red-600">{reactivateError}</p>}
            <p className="mt-2 text-xs text-gray-400">
              Need a license? Call {CONTACT_PHONE} or email{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-600 hover:underline">
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Privacy Policy</h2>
        <div className="space-y-3 rounded border border-gray-200 bg-white p-3 text-sm text-gray-700">
          <p>
            Apex Ledger is a desktop application. Your company's financial data — accounts, transactions, clients, and reports — is
            stored locally on this computer, in files you control, not on a remote server operated by us.
          </p>
          <p>
            <strong>What stays on this device:</strong> company files (SQLite databases), the client/reminder registry, backups, and
            app preferences (color scheme, font size).
          </p>
          <p>
            <strong>What leaves this device:</strong> only when you explicitly trigger it — checking for app updates (contacts the
            update server to compare version numbers only), the optional market ticker (fetches public stock/news data, no company
            data is sent), and anything you choose to email or message directly (e.g. "Send Feedback", client WhatsApp/email
            reminders).
          </p>
          <p>We do not sell, share, or transmit your client or company financial data to any third party.</p>
          <p className="text-gray-500">Questions about this policy: {CONTACT_EMAIL}.</p>
        </div>
      </section>
    </div>
  );
}
