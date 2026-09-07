import { app, type BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';

export type UpdaterStatus =
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };


function isTestBuild(): boolean {
  return app.getName().toUpperCase().includes('TEST') || process.env.NORTH_LEDGER_TEST_BUILD === '1';
}

function send(window: BrowserWindow, status: UpdaterStatus): void {
  if (window.isDestroyed()) return;
  window.webContents.send('updater:status', status);
}

/** Wires electron-updater's events to the renderer and does one check on startup — packaged
 * builds only, since there is nothing to update against while running `npm run dev`. Downloads
 * happen automatically once an update is found; installing only happens when the user clicks
 * "Restart & Update" (quitAndInstallUpdate), never silently behind their back. */
export function setupAutoUpdater(window: BrowserWindow): void {
  if (!app.isPackaged || isTestBuild()) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => send(window, { state: 'checking' }));
  autoUpdater.on('update-available', (info) => send(window, { state: 'available', version: info.version }));
  autoUpdater.on('update-not-available', () => send(window, { state: 'not-available' }));
  autoUpdater.on('download-progress', (progress) => send(window, { state: 'downloading', percent: Math.round(progress.percent) }));
  autoUpdater.on('update-downloaded', (info) => send(window, { state: 'downloaded', version: info.version }));
  autoUpdater.on('error', (err) => send(window, { state: 'error', message: err.message }));

  autoUpdater.checkForUpdates().catch((err) => send(window, { state: 'error', message: err instanceof Error ? err.message : String(err) }));
}

export function checkForUpdatesNow(): void {
  if (!app.isPackaged || isTestBuild()) return;
  autoUpdater.checkForUpdates().catch((err) => console.error('[updater] check failed', err));
}

export function quitAndInstallUpdate(): void {
  if (isTestBuild()) return;
  autoUpdater.quitAndInstall();
}
