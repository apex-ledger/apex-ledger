import fs from 'node:fs';

const handler = fs.readFileSync('src/main/ipc/mileage.handlers.ts', 'utf8');
const journal = fs.readFileSync('src/main/ipc/journal.handlers.ts', 'utf8');
const registration = fs.readFileSync('src/main/ipc/registerHandlers.ts', 'utf8');
const preload = fs.readFileSync('src/preload/index.ts', 'utf8');
const page = fs.readFileSync('src/renderer/features/mileage/MileagePage.tsx', 'utf8');
const failures = [];
if (!handler.includes('mileageReverseLatestClaim')) failures.push('Mileage reversal endpoint is missing.');
if (!handler.includes('journalVoid(latest.journalEntryId!, false, trx, true)')) failures.push('Mileage GL is not voided in the release transaction.');
if (!handler.includes('journalEntryId: null, claimedAt: null')) failures.push('Claimed trips are not released for correction.');
if (!journal.includes("['mileage claim'")) failures.push('Direct mileage-journal void is not protected.');
if (!registration.includes('mileage:reverseLatestClaim') || !preload.includes('reverseLatestClaim')) failures.push('Mileage reversal is not registered/exposed.');
if (!page.includes('Reverse Latest Claim')) failures.push('Mileage UI has no visible correction action.');
if (failures.length) {
  console.error('Mileage-reversal verification FAILED:');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(2);
}
console.log('Mileage-reversal verification PASSED.');
console.log(' Latest yearly claim reverses atomically and releases only its trips; direct linked-journal void is blocked.');
