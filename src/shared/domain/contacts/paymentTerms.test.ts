import { describe, expect, it } from 'vitest';
import {
  asPaymentTerm,
  daysUntilDue,
  DEFAULT_PAYMENT_TERM,
  dueDateFor,
  PAYMENT_TERMS,
  paymentTermLabel,
  termFromDates,
} from './paymentTerms';

describe('dueDateFor', () => {
  it('makes due-on-receipt fall due the same day', () => {
    expect(dueDateFor('2025-03-01', 'dueOnReceipt')).toBe('2025-03-01');
  });

  it('counts plain calendar days, not business days', () => {
    // Net 30 means thirty days on every supplier invoice and in every other package.
    expect(dueDateFor('2025-03-01', 'net30')).toBe('2025-03-31');
    expect(dueDateFor('2025-03-01', 'net45')).toBe('2025-04-15');
    expect(dueDateFor('2025-03-01', 'net90')).toBe('2025-05-30');
  });

  it('crosses a month end correctly', () => {
    expect(dueDateFor('2025-01-31', 'net30')).toBe('2025-03-02');
  });

  it('handles a leap year', () => {
    expect(dueDateFor('2024-02-01', 'net30')).toBe('2024-03-02');
  });

  it('leaves a custom date to the caller', () => {
    expect(dueDateFor('2025-03-01', 'custom')).toBeNull();
  });

  it('refuses to invent a date from a broken one', () => {
    expect(dueDateFor('not-a-date', 'net30')).toBeNull();
  });

  it('does not shift a day either way regardless of timezone', () => {
    // Parsed as UTC deliberately: a due date landing a day early puts an invoice in the wrong
    // ageing bucket, and that would only show up for users west of Greenwich.
    for (const term of ['net15', 'net30', 'net60'] as const) {
      expect(dueDateFor('2025-06-15', term)?.endsWith('T00:00:00Z')).toBe(false);
      expect(dueDateFor('2025-06-15', term)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('termFromDates', () => {
  it('recognises the term behind an existing due date', () => {
    // Invoices entered before terms existed carry only dates. Reading them back as their real term
    // is what stops every one of them showing as "Custom date".
    expect(termFromDates('2025-03-01', '2025-03-31')).toBe('net30');
    expect(termFromDates('2025-03-01', '2025-03-01')).toBe('dueOnReceipt');
  });

  it('falls back to custom for a date no term produces', () => {
    expect(termFromDates('2025-03-01', '2025-03-19')).toBe('custom');
  });
});

describe('reading a stored value back', () => {
  it('defaults when the field was never set', () => {
    expect(asPaymentTerm(null)).toBe(DEFAULT_PAYMENT_TERM);
    expect(asPaymentTerm(undefined)).toBe(DEFAULT_PAYMENT_TERM);
  });

  it('defaults rather than breaking on something unrecognised', () => {
    expect(asPaymentTerm('net17')).toBe(DEFAULT_PAYMENT_TERM);
  });

  it('keeps a value it knows', () => {
    expect(asPaymentTerm('net45')).toBe('net45');
  });
});

describe('the default', () => {
  it('is Net 30, not due on receipt', () => {
    // Due-on-receipt as a silent default would push every new invoice into the overdue bucket on
    // the ageing report the day after it was raised.
    expect(DEFAULT_PAYMENT_TERM).toBe('net30');
  });

  it('names itself when nothing is chosen', () => {
    expect(paymentTermLabel(null)).toBe('Net 30');
  });
});

describe('the list itself', () => {
  it('covers the terms the user asked for', () => {
    const labels = PAYMENT_TERMS.map((t) => t.label);
    expect(labels).toContain('Due on receipt');
    expect(labels).toContain('Net 30');
    expect(labels).toContain('Net 45');
    expect(labels).toContain('Net 90');
  });

  it('gives every term except custom a day count', () => {
    for (const definition of PAYMENT_TERMS) {
      if (definition.term === 'custom') expect(definition.days).toBeNull();
      else expect(definition.days).toBeGreaterThanOrEqual(0);
    }
  });

  it('runs shortest to longest, so the list reads in order', () => {
    const days = PAYMENT_TERMS.filter((t) => t.days !== null).map((t) => t.days as number);
    expect([...days].sort((a, b) => a - b)).toEqual(days);
  });
});

describe('daysUntilDue', () => {
  it('counts down to the due date', () => {
    expect(daysUntilDue('2025-03-31', '2025-03-01')).toBe(30);
  });

  it('goes negative once overdue', () => {
    expect(daysUntilDue('2025-03-01', '2025-03-31')).toBe(-30);
  });
});
