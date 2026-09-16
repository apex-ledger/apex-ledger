import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { isInsideDir, mayOpenCompany, reachableCompanies } from './companyAccess';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-access-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
const maple = path.join(root, 'companies', 'maple');
const maple2 = path.join(root, 'companies', 'maple-2');
const lakeshore = path.join(root, 'companies', 'lakeshore-plumbing');
for (const [dir, files] of [[maple, ['Corner Bakery.company', 'Northside Dental.company']], [maple2, ['Other Firm Client.company']], [lakeshore, ['Lakeshore Plumbing.company']]] as const) {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of files) fs.writeFileSync(path.join(dir, f), 'x');
}
const names = (list: string[]) => list.map((f) => path.basename(f));

describe('who may open which company file', () => {
  it('never mistakes a firm whose name starts the same for the same firm', () => {
    expect(isInsideDir(maple, path.join(maple2, 'Other Firm Client.company'))).toBe(false);
    expect(mayOpenCompany({ ownDir: maple, scope: null, linkedDirs: [] }, path.join(maple2, 'Other Firm Client.company'))).toBe(false);
  });

  it('lets firm staff open every firm company and every business linked to the firm', () => {
    const staff = { ownDir: maple, scope: null, linkedDirs: [lakeshore] };
    expect(names(reachableCompanies(staff))).toEqual(['Corner Bakery.company', 'Northside Dental.company', 'Lakeshore Plumbing.company']);
    expect(mayOpenCompany(staff, path.join(lakeshore, 'Lakeshore Plumbing.company'))).toBe(true);
  });

  it('shows a client only their own company, and nothing of linked businesses', () => {
    const client = { ownDir: maple, scope: ['Corner Bakery.company'], linkedDirs: [lakeshore] };
    expect(names(reachableCompanies(client))).toEqual(['Corner Bakery.company']);
    expect(mayOpenCompany(client, path.join(maple, 'Northside Dental.company'))).toBe(false);
    expect(mayOpenCompany(client, path.join(lakeshore, 'Lakeshore Plumbing.company'))).toBe(false);
  });

  it('refuses paths that climb out of the folder or reach into subfolders', () => {
    const staff = { ownDir: maple, scope: null, linkedDirs: [] };
    expect(mayOpenCompany(staff, path.join(maple, '..', 'maple-2', 'Other Firm Client.company'))).toBe(false);
    expect(mayOpenCompany(staff, path.join(maple, 'archive', 'Old.company'))).toBe(false);
    expect(mayOpenCompany(staff, path.join(maple, 'notes.txt'))).toBe(false);
  });

  it('drops a business from the firm the moment the link ends', () => {
    expect(mayOpenCompany({ ownDir: maple, scope: null, linkedDirs: [] }, path.join(lakeshore, 'Lakeshore Plumbing.company'))).toBe(false);
  });
});
