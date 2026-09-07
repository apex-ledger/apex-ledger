// Reads src/preload/index.ts and writes src/web/apiMap.json: every window.api group, its methods
// and the IPC channel each one calls, plus the event channels. The browser build uses this to
// offer the identical window.api over HTTP, so the screens do not know they are on the web.
//
//   node scripts/gen-api-map.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const src = fs.readFileSync(path.join(root, 'src', 'preload', 'index.ts'), 'utf8');
const lines = src.split('\n');
const groups = {};
const events = {};
let group = null;
for (const line of lines) {
  const g = line.match(/^  (\w+): \{\s*$/);
  if (g) { group = g[1]; groups[group] ??= {}; continue; }
  if (/^  \},?\s*$/.test(line)) { group = null; continue; }
  if (!group) continue;
  const m = line.match(/^\s{4}(\w+): (invoke|subscribe)<[^>]*(?:>[^>]*)*?>\('([\w:.-]+)'\)/) ?? line.match(/^\s{4}(\w+): (invoke|subscribe)<.*?\('([\w:.-]+)'\)/);
  if (m) {
    if (m[2] === 'invoke') groups[group][m[1]] = m[3];
    else (events[group] ??= {})[m[1]] = m[3];
    continue;
  }
  // Methods written by hand as arrow functions that call ipcRenderer.invoke('channel', ...).
  const h = line.match(/^\s{4}(\w+): \([^)]*\) =>\s*$/) ?? line.match(/^\s{4}(\w+): \([^)]*\) => ipcRenderer\.invoke\('([\w:.-]+)'/);
  if (h && h[2]) groups[group][h[1]] = h[2];
  else if (h) groups[group][h[1]] = '__next__';
  else if (groups[group] && Object.values(groups[group]).includes('__next__')) {
    const key = Object.keys(groups[group]).find((k) => groups[group][k] === '__next__');
    const inv = line.match(/ipcRenderer\.invoke\('([\w:.-]+)'/);
    if (inv) groups[group][key] = inv[1];
  }
}
for (const g of Object.keys(groups)) for (const k of Object.keys(groups[g])) if (groups[g][k] === '__next__') delete groups[g][k];
const out = { groups, events };
const dest = path.join(root, 'src', 'web', 'apiMap.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n', 'utf8');
const methods = Object.values(groups).reduce((n, g) => n + Object.keys(g).length, 0);
console.log(`api map: ${Object.keys(groups).length} groups, ${methods} methods, ${Object.values(events).reduce((n, g) => n + Object.keys(g).length, 0)} events → ${dest}`);
