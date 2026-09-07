import { Menu, type BrowserWindow } from 'electron';

/** North Ledger has no native OS menu bar (File/Edit/View/Window) — it looked like a generic
 * Windows utility rather than part of this app's own branded UI. The same actions (New/Open
 * Company, Save As, Close) live in the Header's company switcher instead. NOTE: removing the menu
 * DOES break the standard editing shortcuts (Ctrl+C/V/X/A) — Electron wires those via menu
 * accelerators, and Chromium won't run them on its own — so those are restored per-window in
 * clipboardSupport.ts (keyboard + right-click), which keeps the shortcuts without the menu bar. */
export function removeNativeMenu(): void {
  Menu.setApplicationMenu(null);
}

/** Kept as a no-op so the many call sites after company open/create/save/close don't need to
 * change — there's simply nothing left to refresh now that there's no native menu. */
export function refreshMenu(_window: BrowserWindow): void {}
