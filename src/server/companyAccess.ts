import fs from 'node:fs';
import path from 'node:path';

/**
 * Which company files one signed-in person may see and open on the web.
 *
 *   - Their own organisation's folder, all of it, unless they are limited to named companies.
 *   - A person limited to named companies (a client of the firm, say) sees only those, and only in
 *     their own organisation's folder, never a linked business.
 *   - The unlimited people of a CPA firm also reach the folders of businesses linked to the firm,
 *     for as long as the link lasts.
 *
 * Folder checks compare whole path segments: "companies/maple" never matches
 * "companies/maple-2/Books.company".
 */
export interface CompanyReach {
  ownDir: string;
  scope: string[] | null;
  linkedDirs: string[];
}

export function isInsideDir(dir: string, target: string): boolean {
  const root = path.resolve(dir);
  const file = path.resolve(target);
  const rel = path.relative(root, file);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function mayOpenCompany(reach: CompanyReach, target: string): boolean {
  if (!target.toLowerCase().endsWith('.company')) return false;
  if (isInsideDir(reach.ownDir, target)) {
    if (path.dirname(path.resolve(target)) !== path.resolve(reach.ownDir)) return false;
    return reach.scope === null || reach.scope.some((n) => sameName(n, path.basename(target)));
  }
  if (reach.scope !== null) return false;
  return reach.linkedDirs.some((d) => isInsideDir(d, target) && path.dirname(path.resolve(target)) === path.resolve(d));
}

function companiesIn(dir: string): string[] {
  try {
    return fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.company')).sort().map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

/** Every company file the person may open, their own organisation's first. */
export function reachableCompanies(reach: CompanyReach): string[] {
  const own = companiesIn(reach.ownDir).filter((f) => mayOpenCompany(reach, f));
  if (reach.scope !== null) return own;
  return [...own, ...reach.linkedDirs.flatMap(companiesIn)];
}
