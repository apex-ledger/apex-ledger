import { describe, expect, it } from 'vitest';
import { detectColumnMapping } from './bulkExpenseColumns';

function splitRows(text: string): string[][] {
  return text.split('\n').map((r) => r.split('\t'));
}

describe('detectColumnMapping', () => {
  it('detects roles from a recognizable header row', () => {
    const rows = splitRows(['Date\tVendor\tCategory\tPayment Method\tAmount', '2026-05-01\tEsso\tFuel\tVisa\t65.40'].join('\n'));
    const { mapping, hasHeaderRow } = detectColumnMapping(rows);
    expect(hasHeaderRow).toBe(true);
    expect(mapping).toEqual(['date', 'vendor', 'category', 'paymentMethod', 'amount']);
  });

  it('falls back to content-sniffing when there is no header row', () => {
    const rows = splitRows(
      [
        '2026-05-01\tEsso\tFuel\tVisa\t65.40',
        '2026-05-03\tShell\tFuel\tCash\t42.10',
        '2026-05-05\tHome Depot\tMaterials & Supplies\tVisa\t120.00',
        '2026-05-06\tCanadian Tire\tMaterials & Supplies\tCash\t38.20',
        '2026-05-07\t7-Eleven\tFuel\tVisa\t55.00',
        '2026-05-08\tStaples\tOffice Supplies\tCash\t29.99',
        '2026-05-09\tPetro-Canada\tFuel\tVisa\t61.75',
        '2026-05-10\tLowes\tMaterials & Supplies\tCash\t92.40',
      ].join('\n'),
    );
    const { mapping, hasHeaderRow } = detectColumnMapping(rows);
    expect(hasHeaderRow).toBe(false);
    expect(mapping[0]).toBe('date');
    // Column 1 (8 different merchant names) reads as the vendor; column 2 (3 repeated category
    // words) is claimed first as category since it's checked first; column 3 (Visa/Cash, only 2
    // distinct values across 8 rows) reads as the payment method; column 4 is the only
    // money-looking column, so it's unambiguously the amount.
    expect(mapping[1]).toBe('vendor');
    expect(mapping[2]).toBe('category');
    expect(mapping[3]).toBe('paymentMethod');
    expect(mapping[4]).toBe('amount');
  });

  it('detects an exchange-rate-looking column and a currency-code column', () => {
    const rows = splitRows(['2026-05-01\tEsso\t50.00\tUSD\t1.35', '2026-05-03\tShell\t42.10\tUSD\t1.36'].join('\n'));
    const { mapping } = detectColumnMapping(rows);
    expect(mapping[3]).toBe('currency');
    expect(mapping[4]).toBe('exchangeRate');
  });

  it('leaves ambiguous money-looking columns as ignore rather than guessing which role they are', () => {
    const rows = splitRows(['2026-05-01\tEsso\t$50.00\t$4.00\t$54.00', '2026-05-03\tShell\t$42.10\t$3.30\t$45.40'].join('\n'));
    const { mapping } = detectColumnMapping(rows);
    expect(mapping[2]).toBe('ignore');
    expect(mapping[3]).toBe('ignore');
    expect(mapping[4]).toBe('ignore');
  });

  it('returns an empty mapping for empty input', () => {
    expect(detectColumnMapping([])).toEqual({ mapping: [], hasHeaderRow: false });
  });
});
