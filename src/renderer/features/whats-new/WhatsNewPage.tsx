import { useEffect, useState } from 'react';
import { RELEASE_NOTES } from './whatsNew';

const SEEN_KEY = 'apexLedger.whatsNew.seenVersion';

export function markWhatsNewSeen(version: string): void {
  try {
    window.localStorage.setItem(SEEN_KEY, version);
  } catch {
    /* storage unavailable */
  }
}

export function whatsNewSeenVersion(): string | null {
  try {
    return window.localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

export function WhatsNewPage() {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    window.api.app.getVersion().then((r) => {
      if (!r.ok) return;
      setVersion(r.data);
      markWhatsNewSeen(r.data);
    });
  }, []);
  return (
    <div className="w-full space-y-3">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">What's new</h1>
        <p className="text-sm text-gray-500">What changed in each version, in the words of the screens. {version ? `You are on ${version}.` : ''}</p>
      </div>
      {RELEASE_NOTES.map((note) => (
        <section key={note.version} className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 className="text-sm font-semibold text-gray-900">{note.version}</h2>
            <span className="text-xs text-gray-400">{note.date}</span>
            <span className="text-sm text-gray-700">{note.headline}</span>
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
            {note.items.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** One line on the dashboard the first time a new version opens; gone once What's new is read. */
export function WhatsNewBanner({ onOpen }: { onOpen: () => void }) {
  const [show, setShow] = useState<{ version: string; headline: string } | null>(null);
  useEffect(() => {
    window.api.app.getVersion().then((r) => {
      if (!r.ok) return;
      const seen = whatsNewSeenVersion();
      if (seen === r.data) return;
      const note = RELEASE_NOTES.find((n) => n.version === r.data) ?? RELEASE_NOTES[0];
      setShow({ version: r.data, headline: note.headline });
    });
  }, []);
  if (!show) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" data-testid="whats-new-banner">
      <span className="font-semibold">New in {show.version}:</span>
      <span>{show.headline}.</span>
      <button type="button" onClick={onOpen} className="rounded-full bg-white px-3 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-300 hover:bg-emerald-100">See what changed</button>
      <button type="button" onClick={() => { markWhatsNewSeen(show.version); setShow(null); }} className="ml-auto text-xs text-emerald-700 hover:underline">Dismiss</button>
    </div>
  );
}
