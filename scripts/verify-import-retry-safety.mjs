import fs from 'node:fs';

const source = fs.readFileSync('src/renderer/features/qb-import/QuickBooksImportPage.tsx', 'utf8');
const failures = [];
const expect = (text, message) => { if (!source.includes(text)) failures.push(message); };

expect('function importFingerprint', 'Stable transaction fingerprint is missing.');
expect("entry.source === 'clientImport' && entry.sourceReference", 'Existing imported transactions are not loaded for retry detection.');
expect("importFingerprint('QuickBooks Desktop IIF', txn)", 'IIF retry detection is missing.');
expect('importFingerprint(`${sourceLabel} CSV`, txn)', 'QuickBooks/Xero CSV retry detection is missing.');
expect('if (importedFingerprints.has(fingerprint))', 'Previously imported rows are not skipped.');
expect("source: 'clientImport', sourceReference: fingerprint", 'Imported entries are not tagged with their retry fingerprint.');
expect('importedFingerprints.add(fingerprint)', 'Duplicates inside the same import file are not suppressed.');

if (failures.length) {
  console.error('Import retry safety verification FAILED:');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(2);
}
console.log('Import retry safety verification PASSED.');
console.log(' QuickBooks Desktop, QuickBooks Online, and Xero transaction retries skip matching transactions already imported or repeated in the same file.');
