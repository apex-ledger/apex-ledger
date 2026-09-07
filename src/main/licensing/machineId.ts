import { app } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function machineIdFilePath(): string {
  return path.join(app.getPath('userData'), 'machine-id.json');
}

/** A stable per-installation identifier used to lock a license key to this computer. Generated
 * once and persisted in userData — not derived from hardware, so reinstalling Windows or wiping
 * userData changes it (the customer would then need a reissued key for the new id). This keeps
 * activation fully offline (no license server) while still stopping a key from being copy-pasted
 * onto a second machine. */
export function getMachineId(): string {
  const filePath = machineIdFilePath();
  try {
    const stored = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (stored.machineId) return stored.machineId;
  } catch {
    // no stored id yet — generate one below
  }
  const machineId = crypto.randomUUID().replace(/-/g, '').toUpperCase();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({ machineId }, null, 2), 'utf-8');
  return machineId;
}

/** Groups a raw machine id into readable XXXX-XXXX-... blocks for display/copy-paste. */
export function formatMachineId(machineId: string): string {
  return machineId.match(/.{1,4}/g)?.join('-') ?? machineId;
}
