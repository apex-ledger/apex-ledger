/**
 * Minimal RFC4180-style CSV parser: handles quoted fields (including escaped "" and commas or
 * newlines embedded inside quotes) — unlike a plain `line.split(',')`, this won't break on a
 * QuickBooks memo/description field like `"Payment, thanks!"`. Strips a leading UTF-8 BOM if
 * present (common in exports from Windows-authored tools). Blank rows are dropped.
 */
export function parseCsvRows(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  function endField() {
    row.push(field);
    field = '';
  }
  function endRow() {
    endField();
    if (!(row.length === 1 && row[0] === '')) rows.push(row);
    row = [];
  }

  while (i < input.length) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      endField();
      i++;
      continue;
    }
    if (ch === '\r') {
      i++;
      continue;
    }
    if (ch === '\n') {
      endRow();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field.length > 0 || row.length > 0) endRow();

  return rows;
}
