import fs from 'node:fs';
import path from 'node:path';

/** Bytes used by everything under a folder: a firm's company files, with their -wal and -shm
 * companions and anything else kept beside them. A folder that does not exist yet uses nothing. */
export function folderBytes(dir: string): number {
  let total = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += folderBytes(full);
    else if (entry.isFile()) {
      try { total += fs.statSync(full).size; } catch { /* removed while counting */ }
    }
  }
  return total;
}

/** Size and free space of the disk holding the data folder, or null where the platform cannot say. */
export function diskSpace(dir: string): { totalBytes: number; freeBytes: number } | null {
  try {
    const s = fs.statfsSync(dir);
    return { totalBytes: s.blocks * s.bsize, freeBytes: s.bavail * s.bsize };
  } catch {
    return null;
  }
}
