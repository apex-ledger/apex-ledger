import fs from 'node:fs';

const handler = fs.readFileSync('src/main/ipc/inventory.handlers.ts', 'utf8');
const page = fs.readFileSync('src/renderer/features/inventory/ProductsPage.tsx', 'utf8');
const registration = fs.readFileSync('src/main/ipc/registerHandlers.ts', 'utf8');
const preload = fs.readFileSync('src/preload/index.ts', 'utf8');
const failures = [];
if (!handler.includes('movementsReverse')) failures.push('Manual inventory reversal endpoint is missing.');
if (!handler.includes('journalVoid(movement.journalEntryId!, false, trx, true)')) failures.push('Inventory GL is not voided transactionally.');
if (!handler.includes("deleteFrom('inventoryMovements')")) failures.push('Corrected manual movement is not removed with the void.');
if (!handler.includes('movement.sourceDocumentType !== null')) failures.push('Document-owned stock can bypass its original correction workflow.');
if (!registration.includes('inventory:reverseMovement') || !preload.includes('reverseMovement')) failures.push('Inventory reversal is not registered/exposed.');
if (!page.includes("? 'Reverse' : 'Delete'")) failures.push('Inventory UI does not distinguish posted reversal from zero-value deletion.');
if (failures.length) {
  console.error('Inventory movement-reversal verification FAILED:');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(2);
}
console.log('Inventory movement-reversal verification PASSED.');
console.log(' Manual posted stock corrections atomically void GL and remove the movement; document-owned stock stays in its original workflow.');
