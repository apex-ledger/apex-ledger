import { useUiStore } from '../app/store/uiStore';
import { seatAllowsToolbar } from '@shared/domain/seatScope';
import { webSeat } from '../utils/platform';

/** What the switch and the sidebar button call the focused workspace. */
export const CUSTOM_WORKSPACE_LABEL = 'Custom Workspace';

/**
 * The two ways of working in a company file, as a switch in the top bar: Daily Books (the full
 * menu) or the Custom Workspace (a focused sidebar the person arranges and saves under their name,
 * which starts as the year-end review). It is a mode, not a page, so it shows which one is on and
 * one click turns it back.
 */
export function WorkspaceModeSwitch() {
  const workspaceOn = useUiStore((s) => s.yearEndMode);
  const setView = useUiStore((s) => s.setView);
  const setYearEndMode = useUiStore((s) => s.setYearEndMode);
  const onWorkspacePage = useUiStore((s) => s.view.kind === 'yearEndWorkspace');
  if (!seatAllowsToolbar(webSeat(), 'accountant')) return null;

  const base = 'rounded-full px-2.5 py-1 text-xs font-semibold transition-colors';
  return (
    <div role="group" aria-label="Way of working" className="flex flex-shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full border border-brand-700 bg-brand-800 p-0.5">
      <button
        type="button"
        aria-pressed={!workspaceOn}
        onClick={() => { setYearEndMode(false); if (onWorkspacePage) setView({ kind: 'dashboard' }); }}
        className={`${base} ${!workspaceOn ? 'bg-white text-brand-900 shadow-sm' : 'text-brand-100 hover:bg-brand-700'}`}
        title="The full menu for day-to-day bookkeeping"
      >
        Daily Books
      </button>
      <button
        type="button"
        aria-pressed={workspaceOn}
        onClick={() => setView({ kind: 'yearEndWorkspace' })}
        className={`${base} ${workspaceOn ? 'bg-violet-500 text-white shadow-sm' : 'text-brand-100 hover:bg-brand-700'}`}
        title="A focused sidebar you arrange and save under your name; starts as the year-end review"
      >
        {CUSTOM_WORKSPACE_LABEL}
      </button>
    </div>
  );
}

/** The same place, from the top of the sidebar: a button in its own colour, under New. */
export function CustomWorkspaceButton() {
  const setView = useUiStore((s) => s.setView);
  const active = useUiStore((s) => s.view.kind === 'yearEndWorkspace');
  if (!seatAllowsToolbar(webSeat(), 'accountant')) return null;
  return (
    <div className="px-2 pt-1.5">
      <button
        type="button"
        onClick={() => setView({ kind: 'yearEndWorkspace' })}
        className={`flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-bold text-white shadow-sm ${active ? 'bg-violet-700' : 'bg-violet-600 hover:bg-violet-700'}`}
      >
        {CUSTOM_WORKSPACE_LABEL}
      </button>
    </div>
  );
}
