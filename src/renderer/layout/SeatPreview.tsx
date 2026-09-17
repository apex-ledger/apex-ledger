import { useState } from 'react';

type PreviewSeat = 'business' | 'payroll' | 'bookkeeper';
const LABEL: Record<PreviewSeat, string> = { business: 'Business', payroll: 'Payroll Unlimited', bookkeeper: 'Bookkeeper' };

interface WebInfo { user?: { previewSeat?: PreviewSeat | null }; org?: { isPlatform?: boolean } }
const webInfo = (): WebInfo | null => (window as unknown as { __apexWeb?: WebInfo }).__apexWeb ?? null;

/** Switches this session to act as another seat (or back), then reloads so every menu and screen
 * is drawn for that seat from the start. */
async function setPreview(seatType: PreviewSeat | null): Promise<string | null> {
  try {
    const res = await fetch('/api/admin/preview-seat', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seatType }) });
    const r = (await res.json()) as { ok: boolean; error?: string };
    if (!r.ok) return r.error ?? 'Could not switch.';
    window.location.reload();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** Administration, platform administrator only: try the app as each seat. */
export function SeatPreviewPicker() {
  const info = webInfo();
  const [error, setError] = useState<string | null>(null);
  if (!info?.org?.isPlatform) return null;
  const current = info.user?.previewSeat ?? null;
  return (
    <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm" data-testid="seat-preview">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-violet-900">Preview the app as a seat</span>
        <span className="text-xs text-violet-800">See exactly what each seat sees and is refused, with your own sign-in. Only you see it.</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {(Object.keys(LABEL) as PreviewSeat[]).map((seat) => (
          <button key={seat} type="button" aria-pressed={current === seat} onClick={() => void setPreview(seat).then(setError)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${current === seat ? 'bg-violet-700 text-white' : 'border border-violet-300 bg-white text-violet-800 hover:bg-violet-100'}`}>
            {LABEL[seat]}
          </button>
        ))}
        {current && <button type="button" onClick={() => void setPreview(null).then(setError)} className="rounded-full px-3 py-1 text-xs font-medium text-violet-900 underline">Back to Full accountant</button>}
      </div>
      {error && <div className="mt-2 text-xs text-red-700">{error}</div>}
    </div>
  );
}

/** A strip across the top while previewing, so it is never mistaken for the real thing. */
export function SeatPreviewBanner() {
  const info = webInfo();
  const seat = info?.user?.previewSeat ?? null;
  if (!seat) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 bg-violet-700 px-4 py-1.5 text-sm text-white" role="status">
      <span>Previewing as a <b>{LABEL[seat]}</b> seat: menus and access are what that seat gets.</span>
      <button type="button" onClick={() => void setPreview(null)} className="rounded-full bg-white px-3 py-0.5 text-xs font-semibold text-violet-800 hover:bg-violet-100">Back to Full accountant</button>
    </div>
  );
}
