import { describe, expect, it } from 'vitest';
import {
  compareDocumentNumbers,
  continueReference,
  isNumberTaken,
  resolveNewDocumentNumber,
  nextDocumentNumber,
  parseDocumentNumber,
  schemeInUse,
} from './documentNumbering';

describe('a brand-new file', () => {
  it('starts on the year-first shape, so numbers sort in date order', () => {
    expect(nextDocumentNumber('INV', [], '2026-08-21')).toBe('INV-2026-0001');
  });

  it('takes the year from the document date, not from today', () => {
    // Entering last year's invoices in January must not stamp them with this year.
    expect(nextDocumentNumber('INV', [], '2025-12-31')).toBe('INV-2025-0001');
  });
});

describe('continuing a file', () => {
  it('carries on from the highest number in that year', () => {
    const existing = ['INV-2026-0001', 'INV-2026-0002'];
    expect(nextDocumentNumber('INV', existing, '2026-08-21')).toBe('INV-2026-0003');
  });

  it('restarts at 0001 in a new year', () => {
    expect(nextDocumentNumber('INV', ['INV-2025-0900'], '2026-01-02')).toBe('INV-2026-0001');
  });

  it('does not let a later year affect an earlier one', () => {
    const existing = ['INV-2025-0004', 'INV-2026-0100'];
    expect(nextDocumentNumber('INV', existing, '2025-06-01')).toBe('INV-2025-0005');
  });

  it('never reuses a number freed by a deletion', () => {
    // A gap is awkward to explain to an auditor. The same number on two documents is worse.
    const existing = ['INV-2026-0001', 'INV-2026-0003'];
    expect(nextDocumentNumber('INV', existing, '2026-08-21')).toBe('INV-2026-0004');
  });
});

describe('a file already using the plain running shape', () => {
  it('keeps that shape rather than switching format mid-file', () => {
    // Invoice numbers get quoted on paperwork that has already gone out; a company should not end
    // up with two schemes and no explanation.
    expect(nextDocumentNumber('INV', ['INV-1001', 'INV-1002'], '2026-08-21')).toBe('INV-1003');
  });

  it('is not switched by one hand-typed oddity', () => {
    const existing = ['INV-1001', 'INV-1002', 'INV-1003', 'INV-2026-0001'];
    expect(schemeInUse('INV', existing)).toBe('running');
    expect(nextDocumentNumber('INV', existing, '2026-08-21')).toBe('INV-1004');
  });

  it('carries on from where a low-numbered file is, keeping its zero padding', () => {
    // A company that numbered INV-0001…INV-0025 by hand expects INV-0026 next — not a jump to
    // INV-1001 and not INV-26 with the padding lost.
    expect(nextDocumentNumber('INV', ['INV-0024', 'INV-0025'], '2026-08-21')).toBe('INV-0026');
    expect(nextDocumentNumber('INV', ['INV-1'], '2026-08-21')).toBe('INV-2');
    expect(nextDocumentNumber('INV', ['inv-0007'], '2026-08-21')).toBe('INV-0008');
  });

  it('starts fresh only when the file holds nothing countable', () => {
    expect(nextDocumentNumber('INV', ['INV-x', 'March deposit'], '2026-08-21')).toBe('INV-2026-0001');
  });
});

describe('a file numbered some other way', () => {
  it('continues the pattern already in use instead of restarting', () => {
    expect(nextDocumentNumber('INV', ['INV0024', 'INV0025'], '2026-08-21')).toBe('INV0026');
    expect(nextDocumentNumber('INV', ['2026-016', '2026-017'], '2026-08-21')).toBe('2026-018');
    expect(nextDocumentNumber('INV', ['100', '101'], '2026-08-21')).toBe('102');
  });

  it('follows the most common pattern, not a one-off reference', () => {
    expect(nextDocumentNumber('INV', ['A-100', 'A-101', 'A-102', 'Deposit 9'], '2026-08-21')).toBe('A-103');
  });

  it('continueReference steps one number in its own pattern', () => {
    expect(continueReference('A-0099')).toBe('A-0100');
    expect(continueReference('Bell 41')).toBe('Bell 42');
    expect(continueReference('no digits')).toBeNull();
  });
});

describe('parsing', () => {
  it('reads both shapes', () => {
    expect(parseDocumentNumber('INV', 'INV-1042')).toEqual({ scheme: 'running', year: null, sequence: 1042, width: 4 });
    expect(parseDocumentNumber('INV', 'INV-2026-0007')).toEqual({ scheme: 'yearly', year: 2026, sequence: 7, width: 4 });
  });

  it('ignores something that is not a document number at all', () => {
    expect(parseDocumentNumber('INV', 'Deposit for March')).toBeNull();
  });

  it('keeps prefixes apart', () => {
    expect(parseDocumentNumber('INV', 'SR-1001')).toBeNull();
  });
});

describe('other prefixes', () => {
  it('works the same for sales receipts', () => {
    expect(nextDocumentNumber('SR', ['SR-2026-0001'], '2026-08-21')).toBe('SR-2026-0002');
  });
});

describe('isNumberTaken', () => {
  it('catches a duplicate typed in a different case', () => {
    expect(isNumberTaken('inv-2026-0001', ['INV-2026-0001'])).toBe(true);
  });

  it('ignores surrounding whitespace', () => {
    expect(isNumberTaken('  INV-2026-0001 ', ['INV-2026-0001'])).toBe(true);
  });

  it('passes a genuinely new number', () => {
    expect(isNumberTaken('INV-2026-0002', ['INV-2026-0001'])).toBe(false);
  });
});

describe('sorting', () => {
  it('orders by sequence rather than as text', () => {
    // As text, INV-1002 sorts before INV-999, which reads as arbitrary.
    const sorted = ['INV-1002', 'INV-999', 'INV-1001'].sort((a, b) => compareDocumentNumbers('INV', a, b));
    expect(sorted).toEqual(['INV-999', 'INV-1001', 'INV-1002']);
  });

  it('orders across years', () => {
    const sorted = ['INV-2026-0001', 'INV-2025-0900'].sort((a, b) => compareDocumentNumbers('INV', a, b));
    expect(sorted).toEqual(['INV-2025-0900', 'INV-2026-0001']);
  });
});

describe('resolveNewDocumentNumber', () => {
  it('keeps a number nobody has used', () => {
    expect(resolveNewDocumentNumber('INV', 'INV-1005', ['INV-1004'], '2026-09-04', 'Invoice number')).toBe('INV-1005');
  });

  it('moves a stale auto-suggested number to the next free one instead of failing', () => {
    // The form suggested INV-1005 when it opened; another window saved INV-1005 meanwhile.
    expect(resolveNewDocumentNumber('INV', 'INV-1005', ['INV-1004', 'INV-1005'], '2026-09-04', 'Invoice number')).toBe('INV-1006');
    expect(resolveNewDocumentNumber('INV', 'inv-1005', ['INV-1005'], '2026-09-04', 'Invoice number')).not.toBe('inv-1005');
  });

  it('refuses a hand-typed reference that is a real duplicate', () => {
    expect(() => resolveNewDocumentNumber('INV', 'JOB-ALPHA', ['JOB-ALPHA'], '2026-09-04', 'Invoice number')).toThrow(/already in use/);
  });
});
