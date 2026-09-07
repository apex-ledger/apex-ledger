import fs from 'node:fs';

const store = fs.readFileSync(new URL('../src/renderer/app/store/uiStore.ts', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/renderer/App.tsx', import.meta.url), 'utf8');
const header = fs.readFileSync(new URL('../src/renderer/layout/Header.tsx', import.meta.url), 'utf8');
const failures = [];

if (!store.includes('sessionLocked: boolean') || !store.includes('setSessionLocked: (locked: boolean)')) failures.push('Session lock state/action is missing.');
if (!app.includes('sessionLocked && companyPath') || !app.includes('heading="Unlock Apex Ledger"')) failures.push('The open company is not covered by the unlock gate.');
if (!header.includes('onClick={() => setSessionLocked(true)}')) failures.push('The header Lock button is not wired to the real gate.');
if (header.includes('Lock screen is coming in a future update.')) failures.push('The obsolete lock placeholder remains.');
if (!store.includes('sessionLocked: false });')) failures.push('Opening or closing a company does not clear stale lock state.');

if (failures.length) {
  console.error('Session lock verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Session lock verification passed.');
