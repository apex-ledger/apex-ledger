import { useEffect, useState } from 'react';
import type { UpdaterStatus } from '../../preload/index';

export function UpdateBanner() {
  const [status, setStatus] = useState<UpdaterStatus | null>(null);

  useEffect(() => {
    return window.api.updater.onStatus(setStatus);
  }, []);

  if (!status || status.state === 'checking' || status.state === 'not-available' || status.state === 'error') return null;

  if (status.state === 'available') {
    return (
      <div className="flex items-center justify-center gap-2 border-b border-gold-300 bg-gold-50 px-3 py-1.5 text-xs text-gold-800">
        Update {status.version} found — downloading in the background…
      </div>
    );
  }

  if (status.state === 'downloading') {
    return (
      <div className="flex items-center justify-center gap-2 border-b border-gold-300 bg-gold-50 px-3 py-1.5 text-xs text-gold-800">
        Downloading update… {status.percent}%
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-3 border-b border-brand-300 bg-brand-50 px-3 py-1.5 text-xs text-brand-900">
      <span>Update {status.version} is ready to install.</span>
      <button
        type="button"
        onClick={() => window.api.updater.quitAndInstall()}
        className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-200"
      >
        Restart &amp; Update
      </button>
    </div>
  );
}
