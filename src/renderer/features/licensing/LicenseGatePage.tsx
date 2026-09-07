import { useEffect, useState } from 'react';
import { Logo } from '../../components/Logo';

export function LicenseGatePage({ initialError, onActivated }: { initialError?: string; onActivated: () => void }) {
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState(false);
  const [machineId, setMachineId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    window.api.license.getMachineId().then((result) => {
      if (result.ok) setMachineId(result.data);
    });
  }, []);

  async function handleActivate() {
    if (!key.trim()) return;
    setBusy(true);
    setError(null);
    const result = await window.api.license.activate(key);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    if (result.data.licensed) onActivated();
    else setError(result.data.error ?? 'This license key is not valid.');
  }

  function handleCopyMachineId() {
    if (!machineId) return;
    navigator.clipboard.writeText(machineId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-brand-900">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-2xl">
        <Logo size="lg" showTagline />
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="mt-3 text-lg font-semibold text-gray-900">Activate this install</h1>
          <p className="text-sm text-gray-500">Enter the license key you received to unlock Apex Ledger.</p>
        </div>

        {error && <div className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <textarea
          value={key}
          onChange={(e) => setKey(e.target.value)}
          rows={4}
          placeholder="Paste your license key here"
          className="mt-3 w-full rounded border border-gray-300 px-3 py-2 font-mono text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />

        <button
          type="button"
          disabled={busy || !key.trim()}
          onClick={handleActivate}
          className="mt-3 w-full rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
        >
          {busy ? 'Activating…' : 'Activate'}
        </button>

        <div className="mt-3 rounded border border-gray-200 bg-gray-50 px-3 py-2">
          <p className="text-xs font-medium text-gray-500">Your Machine ID</p>
          <p className="mt-1 text-xs text-gray-400">Send this to your vendor when purchasing or renewing a license — each key only activates on one computer.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 rounded bg-white px-2 py-1 font-mono text-xs text-gray-700">{machineId ?? '…'}</code>
            <button
              type="button"
              disabled={!machineId}
              onClick={handleCopyMachineId}
              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
