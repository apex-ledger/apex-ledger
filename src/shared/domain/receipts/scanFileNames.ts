/** What the Receipt Inbox shows for a file. The scanner names files
 * "Scanned receipt 2026-09-03T01-39-07-137Z (page 2).jpg" — unique and sortable, but in a narrow
 * list every scan from one session looks identical once truncated, and "page 2" of a feeder run
 * is a second receipt, not a second page. The label says what a person needs: when it was scanned
 * and which receipt of that run it is. Other files keep their own names. */
export function receiptEntryLabel(fileName: string): string {
  const match = /^Scanned receipt (\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-\d{2}-\d{3}Z(?: \(page (\d+)\))?(?: \((\d+)\))?\.[a-z0-9]+$/i.exec(fileName);
  if (!match) return fileName;
  const [, date, hourUtc, minute, page] = match;
  const local = new Date(`${date}T${hourUtc}:${minute}:00Z`);
  const hh = String(local.getHours()).padStart(2, '0');
  const mm = String(local.getMinutes()).padStart(2, '0');
  const day = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
  return `Scan ${day} ${hh}:${mm} · receipt ${page ?? 1}`;
}
