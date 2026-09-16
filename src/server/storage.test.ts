import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { diskSpace, folderBytes } from './storage';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-storage-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('storage used by a firm', () => {
  it('adds up every file under the firm folder, including subfolders', () => {
    const firm = path.join(root, 'firm-one');
    fs.mkdirSync(path.join(firm, 'archive'), { recursive: true });
    fs.writeFileSync(path.join(firm, 'Lakeshore.company'), Buffer.alloc(4096));
    fs.writeFileSync(path.join(firm, 'Lakeshore.company-wal'), Buffer.alloc(1024));
    fs.writeFileSync(path.join(firm, 'archive', 'old.company'), Buffer.alloc(2048));
    expect(folderBytes(firm)).toBe(7168);
  });

  it('counts a firm with no folder yet as using nothing', () => {
    expect(folderBytes(path.join(root, 'not-created'))).toBe(0);
  });

  it('reports the disk size and free space', () => {
    const disk = diskSpace(root);
    expect(disk === null || (disk.totalBytes > 0 && disk.freeBytes <= disk.totalBytes)).toBe(true);
  });
});
