import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clearAccessSession } from './accessSession';
import { recordWindowClosed } from './staffSessions';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APP_ROOT = path.join(__dirname, '../..');
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const RENDERER_DIST = path.join(APP_ROOT, 'dist');

/** Every window (the main one and any mirror windows opened via the header's Mirror Window
 * button) points at the same renderer bundle and the same main-process company connection, so
 * they always show the same books — this list exists so we can broadcast data-change events to
 * all of them. */
const allWindows = new Set<BrowserWindow>();

function loadApp(window: BrowserWindow): void {
  if (VITE_DEV_SERVER_URL) {
    window.loadURL(VITE_DEV_SERVER_URL);
  } else {
    window.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

/** Intercepts the window's close button (and quit-triggered close) so unsaved entry data isn't
 * silently lost: the renderer is asked whether it's safe to close, and gets a chance to show a
 * Save/Cancel prompt and actually save before the window is allowed to go away. Runs independently
 * of main/index.ts's before-quit auto-backup — that still fires afterward, once every window has
 * actually agreed to close. */
function attachCloseGuard(window: BrowserWindow): void {
  let forceClose = false;
  window.on('close', (event) => {
    if (forceClose) return;
    event.preventDefault();
    const responseChannel = `app:closeResponse:${window.id}`;
    ipcMain.once(responseChannel, (_event, action: 'close' | 'cancel') => {
      if (action === 'close') {
        forceClose = true;
        window.close();
      }
    });
    window.webContents.send('app:requestClose', { responseChannel });
  });
}

function attachCommonWindowBehavior(window: BrowserWindow): void {
  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });

  window.webContents.on('render-process-gone', (_event, details) => {
    console.error('[main] render-process-gone', details);
  });

  // Links with target="_blank" (WhatsApp, email, website) open in the user's real browser
  // instead of a blocked/blank Electron window.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  attachCloseGuard(window);
  allWindows.add(window);
  const sessionId = window.webContents.id;
  window.on('closed', () => {
    allWindows.delete(window);
    void recordWindowClosed(sessionId);
    clearAccessSession(sessionId);
  });
}

export function createPrimaryWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: `Apex Ledger ${app.getVersion()}`,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  loadApp(window);
  attachCommonWindowBehavior(window);
  return window;
}

/** Opens an additional window mirroring the same company file — a second screen for doing entries
 * side by side, kept in sync with the main window via broadcastDataChanged below. */
export function createMirrorWindow(): BrowserWindow {
  const mirror = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: `Apex Ledger ${app.getVersion()} (Mirror Window)`,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  loadApp(mirror);
  attachCommonWindowBehavior(mirror);
  return mirror;
}

/** Sends to every open window (including the sender), e.g. so any list, dropdown, or dashboard
 * built on useIpcQuery refreshes itself the moment data changes anywhere — mirroring entries
 * across windows without either side needing to click "refresh". */
/** The web server registers a sink so desktop-style broadcasts also reach browser sessions. */
let broadcastSink: ((channel: string, payload: unknown) => void) | null = null;
export function setBroadcastSink(sink: ((channel: string, payload: unknown) => void) | null): void {
  broadcastSink = sink;
}

export function broadcastToAllWindows<T>(channel: string, payload: T): void {
  broadcastSink?.(channel, payload);
  for (const window of allWindows) {
    if (window.isDestroyed()) continue;
    window.webContents.send(channel, payload);
  }
}

export function broadcastDataChanged(topic: string): void {
  broadcastToAllWindows('data:changed', { topic });
}

export function getAllWindows(): BrowserWindow[] {
  return [...allWindows];
}
