import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../src/renderer', import.meta.url));
const destructiveCall = /window\.api\..*\.(?:delete|deleteGroup|deleteTemplate|deleteMovement|deleteCurrent|void|deactivate)\s*\(/;
const confirmationGuard = /window\.confirm\s*\(|confirmDialog\s*\(/;
const failures = [];
let checked = 0;

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.tsx?$/.test(entry.name) ? [absolute] : [];
  });
}

for (const file of sourceFiles(root)) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!destructiveCall.test(line)) return;
    checked += 1;

    // File > Delete Company & Data uses a stronger safeguard: the legal name must be typed
    // exactly before the destructive button enables.
    if (file.endsWith(`${path.sep}layout${path.sep}Header.tsx`) && line.includes('company.deleteCurrent')) {
      const wholeFile = lines.join('\n');
      if (!wholeFile.includes("typed.trim() === companyLegalName.trim()") || !wholeFile.includes('disabled={!matches || busy}')) {
        failures.push(`${path.relative(root, file)}:${index + 1} lost its typed-name confirmation.`);
      }
      return;
    }

    let functionStart = index;
    while (functionStart > 0 && !/(?:async\s+)?function\s+\w+|const\s+\w+\s*=\s*(?:async\s*)?\(/.test(lines[functionStart])) {
      functionStart -= 1;
    }
    const handlerBeforeCall = lines.slice(functionStart, index + 1).join('\n');
    if (!confirmationGuard.test(handlerBeforeCall)) {
      failures.push(`${path.relative(root, file)}:${index + 1} calls a destructive API without confirmation in its handler.`);
    }
  });
}

const bankImport = fs.readFileSync(path.join(root, 'features', 'bank-import', 'BankImportPage.tsx'), 'utf8');
if (!/function deleteRow[\s\S]*?window\.confirm[\s\S]*?setRows/.test(bankImport)) {
  failures.push('features/bank-import/BankImportPage.tsx deleteRow is missing confirmation.');
}
if (!/function deleteSelectedRows[\s\S]*?window\.confirm[\s\S]*?setRows/.test(bankImport)) {
  failures.push('features/bank-import/BankImportPage.tsx deleteSelectedRows is missing confirmation.');
}

if (failures.length) {
  console.error('Delete-confirmation verification FAILED:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(2);
}

console.log('Delete-confirmation verification PASSED.');
console.log(` ${checked} destructive renderer API calls are protected by confirmation.`);
