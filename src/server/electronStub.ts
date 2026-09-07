/** What the main-process code sees as `electron` when it runs inside the web server.
 *
 * The handlers were written for a desktop where Electron provides file dialogs, the user-data
 * folder, the keychain and the IPC bus. On the server there is no desktop: dialogs cannot open,
 * data lives under APEX_DATA_DIR, secrets are kept as-is on an encrypted disk, and "IPC" is a
 * registry the HTTP layer reads. Anything that truly needs a desktop says so in a clear error
 * instead of hanging. The server bundle aliases `electron` to this file. */
import fs from 'node:fs';
import path from 'node:path';

export type IpcHandler = (event: unknown, ...args: unknown[]) => unknown;

/** Every channel registerIpcHandlers wires, by name. The HTTP layer dispatches into this. */
export const handlerRegistry = new Map<string, IpcHandler>();

const dataDir = process.env.APEX_DATA_DIR ? path.resolve(process.env.APEX_DATA_DIR) : path.resolve(process.cwd(), 'web-data');
fs.mkdirSync(dataDir, { recursive: true });

export const app = {
  getPath(name: string): string {
    const dir = path.join(dataDir, name === 'userData' ? 'user-data' : name);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  },
  getName: () => 'Apex Ledger Web',
  getVersion: () => process.env.APEX_VERSION ?? '0.1.330-alpha.17',
  isPackaged: true,
  on: () => app,
  once: () => app,
  whenReady: () => Promise.resolve(),
  quit: () => undefined,
  exit: () => undefined,
  setPath: () => undefined,
  commandLine: { appendSwitch: () => undefined },
  disableHardwareAcceleration: () => undefined,
  getAppPath: () => process.cwd(),
};

export const ipcMain = {
  handle(channel: string, listener: IpcHandler) { handlerRegistry.set(channel, listener); },
  on() { /* no push channels from the renderer on the web */ },
  removeHandler(channel: string) { handlerRegistry.delete(channel); },
};

const notOnWeb = (what: string) => { throw new Error(`${what} needs the desktop app. On the web, use the download or upload button for this instead.`); };

/** Where "Save as…" lands on the web: a handler writes the file here, and the HTTP layer turns
 * the returned path into a download for the browser, then deletes the file. */
export const DOWNLOAD_DIR = path.join(dataDir, 'downloads');
fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

export const dialog = {
  showOpenDialog: async () => ({ canceled: true, filePaths: [] as string[] }),
  showSaveDialog: async (_window?: unknown, options?: { defaultPath?: string; filters?: Array<{ extensions?: string[] }> }) => {
    const suggested = path.basename(options?.defaultPath ?? 'download');
    const ext = path.extname(suggested) || (options?.filters?.[0]?.extensions?.[0] ? `.${options.filters[0].extensions[0]}` : '');
    const base = suggested.endsWith(ext) ? suggested : `${suggested}${ext}`;
    const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return { canceled: false, filePath: path.join(DOWNLOAD_DIR, `${token}__${base.replace(/[<>:"/\\|?*]+/g, '_')}`) };
  },
  showMessageBox: async () => ({ response: 0, checkboxChecked: false }),
  showErrorBox: (title: string, content: string) => { console.error('[dialog]', title, content); },
};

export class BrowserWindow {
  static getAllWindows(): BrowserWindow[] { return []; }
  static fromWebContents(): BrowserWindow | null { return null; }
  webContents = { send: (channel: string, payload?: unknown) => { (globalThis as { __apexSend?: (c: string, p: unknown) => void }).__apexSend?.(channel, payload); }, id: 0, setWindowOpenHandler: () => undefined, on: () => undefined, once: () => undefined, openDevTools: () => undefined, getZoomFactor: () => 1, setZoomFactor: () => undefined, print: () => notOnWeb('Printing'), printToPDF: async () => Buffer.alloc(0) };
  isDestroyed() { return false; }
  hide() { /* no window */ }
  show() { /* no window */ }
  focus() { /* no window */ }
  on() { return this; }
  once() { return this; }
  loadURL() { return Promise.resolve(); }
  loadFile() { return Promise.resolve(); }
  setMenu() { /* no menu */ }
  setTitle() { /* no title */ }
  close() { /* no window */ }
  minimize() { /* no window */ }
  maximize() { /* no window */ }
  isMaximized() { return false; }
  unmaximize() { /* no window */ }
  reload() { /* no window */ }
}

export const safeStorage = {
  isEncryptionAvailable: () => false,
  encryptString: (s: string) => Buffer.from(s, 'utf8'),
  decryptString: (b: Buffer) => b.toString('utf8'),
};

export const shell = {
  openExternal: async () => notOnWeb('Opening a link'),
  openPath: async () => 'Opening a file needs the desktop app.',
  showItemInFolder: () => notOnWeb('Showing a file in its folder'),
};

export const clipboard = {
  writeText: () => undefined,
  readText: () => '',
  writeImage: () => undefined,
};

export const nativeImage = { createFromDataURL: () => ({}), createFromPath: () => ({}), createEmpty: () => ({}) };
export class Notification { static isSupported() { return false; } constructor(_o?: unknown) { void _o; } show() { /* no desktop */ } on() { return this; } }
export const Menu = { setApplicationMenu: () => undefined, buildFromTemplate: () => ({ popup: () => undefined }) };
export const screen = { getPrimaryDisplay: () => ({ workAreaSize: { width: 1440, height: 900 } }) };
export const session = { defaultSession: { setPermissionRequestHandler: () => undefined } };
export const net = { fetch: (input: string, init?: RequestInit) => fetch(input, init) };
export type IpcMainInvokeEvent = { sender: { id: number } };
export type WebContents = unknown;
export type MenuItemConstructorOptions = unknown;
export type OpenDialogOptions = unknown;
export type SaveDialogOptions = unknown;

export default { app, ipcMain, dialog, BrowserWindow, safeStorage, shell, clipboard, nativeImage, Notification, Menu, screen, session, net };
