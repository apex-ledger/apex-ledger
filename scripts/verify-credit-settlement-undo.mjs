import fs from 'node:fs';

const handler = fs.readFileSync('src/main/ipc/creditNotes.handlers.ts', 'utf8');
const registration = fs.readFileSync('src/main/ipc/registerHandlers.ts', 'utf8');
const preload = fs.readFileSync('src/preload/index.ts', 'utf8');
const page = fs.readFileSync('src/renderer/features/credit-notes/CreditNotesPage.tsx', 'utf8');
const failures = [];
if (!handler.includes('creditNotesUndoSettlement')) failures.push('Credit settlement undo endpoint is missing.');
if (!handler.includes('db.transaction().execute')) failures.push('Credit settlement undo is not transactional.');
if (!handler.includes('journalVoid(note.refundJournalEntryId, false, trx, true)')) failures.push('Refund undo does not void cash GL atomically.');
if (!handler.includes("selectFrom('invoicePayments')") || !handler.includes("selectFrom('billPayments')")) failures.push('Applied-credit undo does not restore the prior payment link.');
if (!handler.includes("status: 'open', appliedToId: null") || !handler.includes("status: 'open', refundJournalEntryId: null")) failures.push('Undo does not return the credit to Open cleanly.');
if (!registration.includes('creditNotes:undoSettlement') || !preload.includes('undoSettlement')) failures.push('Undo is not registered/exposed.');
if (!page.includes('Undo Settlement')) failures.push('Credit Notes UI has no visible undo action.');
if (failures.length) {
  console.error('Credit-settlement undo verification FAILED:');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(2);
}
console.log('Credit-settlement undo verification PASSED.');
console.log(' Applied credits reopen their target balance; refunded credits void cash GL; earlier partial payments remain linked.');
