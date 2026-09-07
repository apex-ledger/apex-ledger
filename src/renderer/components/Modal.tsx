import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { QuickScroll } from './QuickScroll';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** A record or document form: takes the whole window, title at the left, close at the top
   * right, footer bar at the bottom — the way every ledger opens a bill or an invoice. Small
   * confirmations and pickers stay as centred dialogs. */
  fullScreen?: boolean;
}

export function Modal({ open, onClose, title, children, footer, wide = false, fullScreen = false }: ModalProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  // Esc closes a full-page form, like the × at its top right. (Centred dialogs keep their scrim click.)
  useEffect(() => {
    if (!open || !fullScreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, fullScreen, onClose]);
  if (!open) return null;
  if (fullScreen) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex flex-col bg-white animate-fadeIn" role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-2">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-xl leading-none text-gray-500 hover:bg-gray-100 hover:text-gray-900" aria-label="Close" title="Close (Esc)">
            ×
          </button>
        </div>
        <div className="relative flex min-h-0 flex-1">
          <div ref={bodyRef} className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          <QuickScroll targetRef={bodyRef} />
        </div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-2">{footer}</div>}
      </div>,
      document.body,
    );
  }
  // Rendered into document.body, NOT in place. `position: fixed` is only relative to the viewport
  // while no ancestor establishes a containing block — and a transform, filter, backdrop-filter or
  // `contain` on ANY ancestor does establish one. When that happened here, `inset-0` stopped
  // meaning "the window" and started meaning "that ancestor", so the overlay covered only the
  // scrollable page area and the dialog centred itself in the middle of that tall region: the
  // screen dimmed, nothing appeared, and the panel was found by scrolling down. A portal puts the
  // overlay outside every such ancestor, so `fixed` means the viewport again no matter what CSS
  // any page above it happens to use. Fixing the individual offending property instead would only
  // hold until the next `transform` or blur was added somewhere upstream.
  return createPortal(
    // Blurring what's behind the sheet (rather than just dimming it) is what pushes the page back
    // in space instead of merely darkening it — the dialog reads as floating above the app.
    // The overlay itself scrolls, and the panel is centred by a min-h-full flex wrapper rather than
    // by centring the panel against a fixed box. Centring a panel that is taller than its container
    // overflows it EQUALLY in both directions, which puts the top of a long form above the top of
    // the screen where it can't be scrolled to — the failure this layout prevents. On a short
    // window the panel now simply scrolls with the overlay instead of losing its head.
    // NOTE: no backdrop-blur here. A backdrop-filter on a full-screen overlay composites badly on
    // some GPUs in Electron — the whole app, INCLUDING this dialog's own panel, renders washed out
    // and unreadable, which is exactly the "faded screen with nothing on it" this app hit. The
    // sidebar already carries a backdrop-filter (apple.css), and stacking a second one over the
    // whole window is what tips it over. A plain translucent scrim gives the same separation with
    // no compositing risk.
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 animate-fadeIn" onMouseDown={onClose}>
      <div className="flex min-h-full items-center justify-center p-3">
        <div
          className={`max-h-[calc(100vh-2rem)] w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} overflow-y-auto overscroll-contain rounded-xl2 bg-white shadow-float ring-1 ring-slate-900/5 animate-popIn`}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Sticky so the title and close button stay reachable in a long form. */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-2.5">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className="px-3 py-2">{children}</div>
          {footer && (
            <div className="sticky bottom-0 flex flex-wrap justify-start gap-2 border-t border-gray-100 bg-white px-4 py-2.5">{footer}</div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
