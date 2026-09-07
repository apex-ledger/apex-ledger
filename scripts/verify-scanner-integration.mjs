import fs from 'node:fs';

const handler = fs.readFileSync(new URL('../src/main/ipc/receiptInbox.handlers.ts', import.meta.url), 'utf8');
const register = fs.readFileSync(new URL('../src/main/ipc/registerHandlers.ts', import.meta.url), 'utf8');
const preload = fs.readFileSync(new URL('../src/preload/index.ts', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../src/renderer/features/receipt-inbox/ReceiptInboxPage.tsx', import.meta.url), 'utf8');
const header = fs.readFileSync(new URL('../src/renderer/layout/Header.tsx', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const script = (name) => {
  try { return fs.readFileSync(new URL(`../resources/scripts/${name}.js`, import.meta.url), 'utf8'); } catch { return ''; }
};

const failures = [];
if (!handler.includes('export async function receiptInboxScannerStatus')) failures.push('Scanner discovery handler is missing.');
if (!handler.includes('export async function receiptInboxScan')) failures.push('Scanner acquisition handler is missing.');
// The WIA scripts ship as static files run by the signed Windows script host — never written at
// run time (the dropper pattern) and never PowerShell (IDP.Generic bait). See docs/CODE-SIGNING-AND-ANTIVIRUS.md.
if (!script('scan-dialog').includes('WIA.CommonDialog')) failures.push('Windows WIA acquisition is not used.');
if (!script('scan-feeder').includes('WIA.DeviceManager') || !script('scanner-status').includes('WIA.DeviceManager')) failures.push('Direct WIA feeder scanning is not shipped.');
if (!handler.includes("runWiaScript('scan-feeder'") || !handler.includes("runWiaScript('scan-dialog'")) failures.push('The scan handlers do not run the shipped WIA scripts.');
if (/powershell|tasklist|writeFileSync\([^)]*script/i.test(handler)) failures.push('The scan handler spawns PowerShell, lists processes, or writes scripts at run time.');
if (!(pkg.build.extraResources ?? []).some((r) => r.from === 'resources/scripts' && r.to === 'scripts')) failures.push('resources/scripts is not shipped with the installation.');
if (!handler.includes('APEX_LEDGER_SCAN_PATH')) failures.push('The scan destination is not passed safely through the process environment.');
if (!register.includes("'receiptInbox:scannerStatus'")) failures.push('Scanner discovery IPC is not registered.');
if (!register.includes("'receiptInbox:scan'")) failures.push('Scanner acquisition IPC is not registered.');
if (!preload.includes("scannerStatus: invoke<ReceiptScannerStatus>('receiptInbox:scannerStatus')")) failures.push('Scanner discovery is not exposed through preload.');
if (!preload.includes("scan: invoke<ReceiptScanResult>('receiptInbox:scan')")) failures.push('Scanner acquisition is not exposed through preload.');
if (!page.includes('Epson / Windows Document Scanner')) failures.push('Receipt Inbox does not identify the Epson/Windows scanner workflow.');
if (!page.includes('onScanned(result.data.fileName)')) failures.push('A completed scan is not selected for immediate OCR review.');
if (!header.includes('window.api.receiptInbox.scan()')) failures.push('The top Scan Receipt action is not connected to hardware acquisition.');
if (page.includes('Connection reserved for later setup') || page.includes('>PLANNED<')) failures.push('Obsolete scanner placeholder text remains visible.');

if (failures.length) {
  console.error('Scanner integration verification FAILED:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('Epson/Windows scanner integration verification PASSED.');
console.log(' WIA discovery, native acquisition, safe Inbox storage, OCR hand-off, and header action are connected.');
