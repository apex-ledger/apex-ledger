import { describe, expect, it } from 'vitest';
import { receiptEntryLabel } from './scanFileNames';

describe('receiptEntryLabel', () => {
  it('turns a scanner file name into the scan time and receipt number, in local time', () => {
    const first = receiptEntryLabel('Scanned receipt 2026-09-03T01-39-07-137Z.jpg');
    const second = receiptEntryLabel('Scanned receipt 2026-09-03T01-39-07-137Z (page 2).jpg');
    expect(first).toMatch(/^Scan \d{4}-\d{2}-\d{2} \d{2}:\d{2} · receipt 1$/);
    expect(second.replace(/receipt \d+$/, '')).toBe(first.replace(/receipt \d+$/, ''));
    expect(second).toMatch(/receipt 2$/);
  });

  it('leaves other files alone', () => {
    expect(receiptEntryLabel('IMG_2041.jpg')).toBe('IMG_2041.jpg');
    expect(receiptEntryLabel('Bell invoice March.pdf')).toBe('Bell invoice March.pdf');
  });
});
