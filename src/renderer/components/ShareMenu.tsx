import { useState } from 'react';
import { IconShare } from './icons';

export interface ShareMenuAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

/** A single "Share ▾" button expanding into Email / WhatsApp / Export — consolidates what used to
 * be 2-3 separate buttons on document pages (Invoices, and anywhere else a generated PDF gets
 * sent out) into one place, the way a modern Office app puts Share in one spot instead of a row of
 * individual send buttons. */
export function ShareMenu({ busy, actions }: { busy?: boolean; actions: ShareMenuAction[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        className="flex items-center gap-1.5 rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
      >
        <IconShare width={16} height={16} />
        Share
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 w-56 rounded border border-gray-200 bg-white py-1 shadow-lg">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              disabled={action.disabled || busy}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setOpen(false);
                action.onClick();
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
