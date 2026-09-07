import { app } from 'electron';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Where the app's Windows Script Host programs live: shipped inside the installation
 * (resources/scripts, via electron-builder's extraResources), read straight from there. */
export function windowsScriptPath(name: string): string {
  const folder = app.isPackaged ? path.join(process.resourcesPath, 'scripts') : path.join(app.getAppPath(), 'resources', 'scripts');
  return path.join(folder, `${name}.js`);
}

/** Runs one of the app's Windows Script Host (JScript) programs that talk to the scanner through WIA.
 *
 * Why not PowerShell: an unsigned application that launches
 * `powershell.exe -ExecutionPolicy Bypass -EncodedCommand …` is exactly the behaviour Norton's
 * IDP.Generic and similar heuristics exist to stop, and they stop it by killing the process —
 * which looked to the person like the app crashing on Scan Receipt.
 *
 * Why the scripts are files installed with the app rather than written when needed: a program
 * that drops a script onto the disk and immediately runs it is the other classic pattern those
 * heuristics watch for. Nothing is written at run time; `cscript.exe` is a signed Windows binary
 * running a plain-text file from the installation folder, and everything variable (folders,
 * names) travels through the process environment — a script is never built from user input. */
export async function runWiaScript(name: string, env: NodeJS.ProcessEnv = {}): Promise<string> {
  return runWindowsScript(name, env, 180_000);
}

/** The same runner for any Windows automation the app needs (Outlook, WIA). */
export async function runWindowsScript(name: string, env: NodeJS.ProcessEnv = {}, timeout = 60_000): Promise<string> {
  if (process.platform !== 'win32') throw new Error('Direct scanner capture is available on Windows only.');
  const scriptPath = windowsScriptPath(name);
  if (!fs.existsSync(scriptPath)) throw new Error(`The "${name}" helper is missing from this installation (${scriptPath}). Reinstall the application.`);
  const result = await execFileAsync('cscript.exe', ['//Nologo', '//E:JScript', scriptPath], {
    env: { ...process.env, ...env },
    windowsHide: true,
    timeout,
    maxBuffer: 1024 * 1024,
  });
  return result.stdout.trim();
}
