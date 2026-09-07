/** Which clients you keep the books for, and how their books are reached.
 *
 * A practice's client list mixes two very different relationships. For some clients you file a
 * return once a year and never touch a ledger; for others you keep the books, and there is a
 * company file somewhere holding them. Only the second kind has anywhere to go.
 *
 * The link already existed as a stored path that was printed on screen and did nothing. What was
 * missing was everything that makes it a link: opening it, checking it is still there, and saying
 * whose books you are looking at once you are in them.
 */

export interface ClientWithFile {
  id: string;
  clientName: string;
  companyFilePath: string | null;
}

/** A bookkeeping client is one whose books this practice keeps — i.e. one with a company file.
 *
 * Deliberately defined by the file rather than by a checkbox somebody has to maintain: a client
 * with books attached IS a bookkeeping client, and a flag that disagreed with the file would be
 * wrong in a way nobody would notice. */
export function isBookkeepingClient(client: ClientWithFile): boolean {
  return Boolean(client.companyFilePath?.trim());
}

/** The file name alone, for showing a path without letting it swallow the row. */
export function companyFileName(path: string | null): string | null {
  if (!path?.trim()) return null;
  return path.trim().split(/[\\/]/).pop() ?? null;
}

/** Compares two file paths the way the filesystem would.
 *
 * Windows paths are case-insensitive and can be written with either slash, so the same file
 * reached two ways would otherwise look like two different files — and the header would fail to
 * name the client whose books are open. */
export function isSameFile(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a?.trim() || !b?.trim()) return false;
  const normalise = (p: string) => p.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  return normalise(a) === normalise(b);
}

/** Which client's books are currently open, if any.
 *
 * Returns null rather than guessing when two clients point at the same file — that is a data
 * problem to be fixed, and naming an arbitrary one of them would hide it. */
export function clientForOpenFile<T extends ClientWithFile>(clients: T[], openFilePath: string | null): T | null {
  if (!openFilePath?.trim()) return null;
  const matches = clients.filter((c) => isSameFile(c.companyFilePath, openFilePath));
  return matches.length === 1 ? matches[0] : null;
}

/** Clients pointing at the same company file as another client.
 *
 * Two clients sharing one file means one of them is looking at somebody else's books. Worth
 * surfacing rather than leaving to be discovered. */
export function clientsSharingAFile<T extends ClientWithFile>(clients: T[]): T[][] {
  const byFile = new Map<string, T[]>();
  for (const client of clients) {
    if (!isBookkeepingClient(client)) continue;
    const key = (client.companyFilePath as string).trim().replace(/\\/g, '/').toLowerCase();
    byFile.set(key, [...(byFile.get(key) ?? []), client]);
  }
  return [...byFile.values()].filter((group) => group.length > 1);
}
