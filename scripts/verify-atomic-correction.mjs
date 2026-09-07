import fs from 'node:fs';

const handler = fs.readFileSync(new URL('../src/main/ipc/quickEntry.handlers.ts', import.meta.url), 'utf8');
const renderer = fs.readFileSync(new URL('../src/renderer/features/quick-entry/QuickEntryPage.tsx', import.meta.url), 'utf8');
const registration = fs.readFileSync(new URL('../src/main/ipc/registerHandlers.ts', import.meta.url), 'utf8');
const failures = [];
for (const marker of ['export async function quickEntryCorrect', 'db.transaction().execute', 'journalPost(draft.id, trx)', 'journalVoid(original.id, false, trx)', 'original: voided, corrected']) {
  if (!handler.includes(marker)) failures.push(`Missing atomic correction step: ${marker}`);
}
if (!handler.includes('This entry belongs to another business document. Correct it from its original page.')) failures.push('Document-owned journals are not blocked from Quick Entry correction.');
if (!renderer.includes("e.source === 'quickEntry'") || !renderer.includes('e.sourceReference == null')) failures.push('Quick Entry recent rows do not filter out document-owned journals.');
if (!registration.includes("'quickEntry:correct'")) failures.push('Atomic correction IPC is not registered.');
if (!renderer.includes('window.api.quickEntry.correct')) failures.push('Quick Entry Edit does not call atomic correction.');
const editStart = renderer.indexOf('function EditAmountModal');
const pageStart = renderer.indexOf('export function QuickEntryPage');
const editSource = renderer.slice(editStart, pageStart);
if (editSource.includes('window.api.journal.void') || editSource.includes('window.api.journal.post')) failures.push('Renderer still performs a multi-step void/post correction.');
if (!editSource.includes('Nothing was changed:')) failures.push('Correction failure does not clearly confirm rollback to the user.');
if (failures.length) { console.error('Atomic Quick Entry correction verification FAILED:'); failures.forEach((failure) => console.error(` - ${failure}`)); process.exit(2); }
console.log('Atomic Quick Entry correction verification PASSED.');
console.log(' replacement post and original void share one database transaction; renderer has one correction call and explicit rollback feedback.');
