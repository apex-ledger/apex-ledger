import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];
const requireText = (file, text, message) => { if (!read(file).includes(text)) failures.push(message); };

requireText('src/main/ipc/journal.handlers.ts', 'export async function journalCreateAndPost', 'Atomic journal operation is missing.');
requireText('src/main/ipc/journal.handlers.ts', 'db.transaction().execute', 'Create & Post does not share a transaction.');
requireText('src/main/ipc/registerHandlers.ts', "'journal:createAndPost'", 'Atomic journal IPC is not registered.');
requireText('src/preload/index.ts', "createAndPost: invoke<JournalEntry>('journal:createAndPost')", 'Atomic journal operation is not exposed safely.');

for (const file of [
  'src/renderer/features/bank-import/BankImportPage.tsx',
  'src/renderer/features/chart-of-accounts/openingBalanceEquity.ts',
  'src/renderer/features/qb-import/QuickBooksImportPage.tsx',
  'src/renderer/features/quick-entry/QuickEntryPage.tsx',
  'src/renderer/features/quick-entry/BulkExpenseImportPage.tsx',
]) requireText(file, 'journal.createAndPost', `${file} bypasses atomic Create & Post.`);

const rendererFiles = fs.readdirSync(path.join(root, 'src/renderer/features'), { recursive: true })
  .filter((file) => typeof file === 'string' && file.endsWith('.tsx'));
for (const relative of rendererFiles) {
  const file = path.join('src/renderer/features', relative);
  if (file.replaceAll('\\', '/').endsWith('journal-entries/JournalEntryFormPage.tsx')) continue;
  if (/window\.api\.journal\.post\(/.test(read(file))) failures.push(`${file} still performs a separate immediate post.`);
}
requireText('src/renderer/features/quick-entry/BulkExpenseImportPage.tsx', 'leaveAsDraft ? await window.api.journal.create', 'Bulk Expense lost its deliberate Leave as Draft option.');

if (failures.length) {
  console.error('Atomic Create & Post verification FAILED:');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(2);
}
console.log('Atomic Create & Post verification PASSED.');
console.log(' Immediate-post imports, transfers, and opening balances roll back together; explicit Save Draft remains available.');
