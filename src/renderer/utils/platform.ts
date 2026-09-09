import type { SeatType } from '@shared/domain/seatScope';
/** Where the screens are running. The web server sets `window.__apexWeb` before the app mounts,
 * with the signed-in person and their organisation; the desktop never does. Screens use this to
 * hide what only makes sense with a desktop (file dialogs, the updater, a second window). */
export function isWeb(): boolean {
  return typeof window !== 'undefined' && Boolean((window as unknown as { __apexWeb?: unknown }).__apexWeb);
}

/** The signed-in person's seat on the web; 'full' on the desktop and for anything unknown. */
export function webSeat(): SeatType {
  const w = (window as unknown as { __apexWeb?: { user?: { seatType?: string } } }).__apexWeb;
  const t = w?.user?.seatType;
  return t === 'business' || t === 'payroll' || t === 'bookkeeper' ? t : 'full';
}
