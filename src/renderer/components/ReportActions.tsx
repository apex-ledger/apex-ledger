import { useEffect, useRef, useState, type RefObject } from 'react';
import { normalizeCellForExport, rowsToTsv } from '@shared/domain/reporting/tableToCsv';

/** Export controls: Excel, clipboard, PDF.
 *
 * Used above every report and on the working screens too — a list of expenses or products is just
 * as likely to be wanted in a spreadsheet as a formal statement is.
 *
 * Reads the tables already on screen rather than asking each report to hand over its data. That
 * sounds like a shortcut and is actually the correct behaviour: what gets exported is exactly what
 * is being looked at, including whichever dates, filters and toggles are set. A separate export
 * path would eventually disagree with the screen, and nobody would notice which one was wrong.
 *
 * Copy uses tabs so pasted rows spread across spreadsheet columns. Export passes the same visible
 * rows to the main process, which creates a genuine .xlsx workbook.
 */

function extractTables(root: HTMLElement | null): string[][] {
  if (!root) return [];
  const rows: string[][] = [];

  for (const table of Array.from(root.querySelectorAll('table'))) {
    // A blank line between tables, so a report made of several keeps them apart in the file.
    if (rows.length > 0) rows.push([]);
    const metadataRows = Array.from(table.querySelectorAll('[data-export-row]'))
      .map((element) => normalizeCellForExport(element.textContent ?? ''))
      .filter(Boolean);
    for (const metadata of metadataRows) rows.push([metadata]);
    if (metadataRows.length > 0) rows.push([]);
    for (const tr of Array.from(table.querySelectorAll('tr'))) {
      // A cell marked data-export-skip is screen-only: the General Ledger's User column keeps its
      // colour badges for the firm, but staff names must not travel in a workbook handed to a client.
      const cells = Array.from(tr.querySelectorAll('th, td')).filter((cell) => !cell.hasAttribute('data-export-skip'));
      if (cells.length === 0) continue;
      const row = cells.map((cell) => {
        // An input holds its value in the DOM property, not as text — an editable cell would
        // otherwise export as empty.
        const input = cell.querySelector('input, select');
        if (input instanceof HTMLInputElement) return normalizeCellForExport(input.value);
        if (input instanceof HTMLSelectElement) return normalizeCellForExport(input.selectedOptions[0]?.text ?? '');
        return normalizeCellForExport(cell.textContent ?? '');
      });
      // Rows that are entirely empty are layout, not data.
      if (row.some((c) => c !== '')) rows.push(row);
    }
  }
  return rows;
}

export function ReportGeneratedStamp({ generatedAt }: { generatedAt: string }) {
  return (
    <div className="-mt-1 mb-1 text-right text-[11px] text-gray-400" data-testid="report-generated-at">
      Generated on: {generatedAt}
    </div>
  );
}

export function ReportActions({ targetRef, reportName, generatedAt }: { targetRef: RefObject<HTMLElement>; reportName: string; generatedAt?: string }) {
  const [status, setStatus] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [matchIndex, setMatchIndex] = useState(-1);
  const [matchCount, setMatchCount] = useState(0);
  const matchesRef = useRef<HTMLElement[]>([]);

  function clearSearchMarks() {
    const root = targetRef.current;
    if (!root) return;
    for (const cell of Array.from(root.querySelectorAll<HTMLElement>('[data-report-search-match]'))) {
      cell.removeAttribute('data-report-search-match');
      cell.classList.remove('bg-yellow-100', 'ring-2', 'ring-inset', 'ring-amber-500');
    }
  }

  function activateMatch(index: number, scroll = true) {
    const matches = matchesRef.current;
    for (const match of matches) match.classList.remove('ring-2', 'ring-inset', 'ring-amber-500');
    if (matches.length === 0) { setMatchIndex(-1); return; }
    const next = ((index % matches.length) + matches.length) % matches.length;
    const active = matches[next];
    active.classList.add('ring-2', 'ring-inset', 'ring-amber-500');
    if (scroll && typeof active.scrollIntoView === 'function') active.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    setMatchIndex(next);
  }

  useEffect(() => {
    const root = targetRef.current;
    if (!root) return;
    const rebuild = () => {
      clearSearchMarks();
      const query = search.trim().toLocaleLowerCase();
      if (!query) {
        matchesRef.current = [];
        setMatchCount(0);
        setMatchIndex(-1);
        return;
      }
      const matches = Array.from(root.querySelectorAll<HTMLElement>('caption, th, td')).filter((cell) => {
        const input = cell.querySelector('input, select');
        const value = input instanceof HTMLInputElement ? input.value : input instanceof HTMLSelectElement ? input.selectedOptions[0]?.text ?? '' : cell.textContent ?? '';
        return value.toLocaleLowerCase().includes(query);
      });
      for (const match of matches) {
        match.setAttribute('data-report-search-match', 'true');
        match.classList.add('bg-yellow-100');
      }
      matchesRef.current = matches;
      setMatchCount(matches.length);
      activateMatch(0, false);
    };
    rebuild();
    const observer = new MutationObserver(rebuild);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      clearSearchMarks();
    };
    // targetRef is stable for a mounted report; search re-indexes the current tables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, targetRef]);

  function flash(message: string) {
    setStatus(message);
    window.setTimeout(() => setStatus(null), 4000);
  }

  async function copyToClipboard() {
    const rows = extractTables(targetRef.current);
    if (rows.length === 0) return flash('Nothing to copy — this report has no table on screen.');
    const exportRows = generatedAt ? [[`Generated on: ${generatedAt}`], [], ...rows] : rows;
    await navigator.clipboard.writeText(rowsToTsv(exportRows));
    flash(`Copied ${exportRows.length} rows — paste straight into a spreadsheet.`);
  }

  async function exportExcel() {
    const rows = extractTables(targetRef.current);
    if (rows.length === 0) return flash('Nothing to export — this report has no table on screen.');
    const exportRows = generatedAt ? [[`Generated on: ${generatedAt}`], [], ...rows] : rows;
    const result = await window.api.app.saveExcelFile({ suggestedName: reportName, rows: exportRows });
    if (!result.ok) return flash(result.error);
    if (result.data.saved) flash('Saved.');
  }

  async function savePdf() {
    const result = await window.api.app.savePdf({});
    if (!result.ok) return flash(result.error);
    if (result.data.saved) flash('Saved.');
  }

  const button = 'rounded border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => void exportExcel()} className={button} title="Save what is on screen as an Excel workbook">
        Export Excel
      </button>
      <button type="button" onClick={() => void copyToClipboard()} className={button} title="Copy for pasting into Excel">
        Copy
      </button>
      <button type="button" onClick={() => void savePdf()} className={button} title="Save this page as a PDF">
        Save as PDF
      </button>
      <div className="flex items-center gap-1 rounded border border-gray-300 bg-white px-1.5 py-0.5">
        <input
          type="search"
          aria-label="Find in report"
          placeholder="Find in report…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setSearch('');
            if (event.key === 'Enter') { event.preventDefault(); activateMatch(matchIndex + (event.shiftKey ? -1 : 1)); }
          }}
          className="w-44 border-0 bg-transparent px-1 text-xs outline-none"
        />
        {search && <span className="min-w-12 text-center text-[11px] text-gray-500">{matchCount ? `${matchIndex + 1} of ${matchCount}` : '0 found'}</span>}
        <button type="button" disabled={matchCount === 0} onClick={() => activateMatch(matchIndex - 1)} className="rounded px-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-30" aria-label="Previous report match">↑</button>
        <button type="button" disabled={matchCount === 0} onClick={() => activateMatch(matchIndex + 1)} className="rounded px-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-30" aria-label="Next report match">↓</button>
      </div>
      {status && <span className="text-xs text-gray-500">{status}</span>}
    </div>
  );
}
