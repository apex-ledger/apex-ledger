import { describe, expect, it } from 'vitest';
import { findLetterTemplate, LETTER_TEMPLATES, missingLetterFields, renderLetter } from './letterTemplates';

describe('letter templates', () => {
  it('ships the current CSRS 4200 compilation report and no Notice to Reader', () => {
    const ids = LETTER_TEMPLATES.map((t) => t.id);
    expect(ids).toContain('compilation-engagement-report');
    // Notice to Reader was retired for periods ending on or after 2021-12-14 — offering one would
    // hand a practitioner a superseded communication.
    expect(ids.some((id) => id.includes('notice-to-reader'))).toBe(false);
    const compilation = findLetterTemplate('compilation-engagement-report')!;
    expect(compilation.standard).toBe('CSRS 4200');
    expect(compilation.practitionerReviewRequired).toBe(true);
  });

  it('states the basis of accounting and disclaims assurance in the compilation report', () => {
    const rendered = renderLetter(findLetterTemplate('compilation-engagement-report')!, {
      clientName: 'Northwind Ltd.',
      periodEnd: '2026-12-31',
      basisOfAccounting: 'the historical cost basis',
    }).join(' ');

    expect(rendered).toContain('Northwind Ltd.');
    expect(rendered).toContain('the historical cost basis');
    expect(rendered).toContain('express no assurance');
    expect(rendered).toContain('may not be appropriate');
  });

  it('substitutes every placeholder it is given and leaves a visible blank for the rest', () => {
    const rendered = renderLetter(findLetterTemplate('client-year-end-letter')!, { clientName: 'Acme Inc.' }).join('\n');
    expect(rendered).toContain('Acme Inc.');
    expect(rendered).toContain('____________');
    // No template syntax may survive into something a practitioner might print and send.
    expect(rendered).not.toMatch(/\{\{|\}\}/);
  });

  it('treats a whitespace-only value as missing', () => {
    const template = findLetterTemplate('management-representation-letter')!;
    const missing = missingLetterFields(template, { clientName: '   ', firmName: 'Somebody LLP' });
    expect(missing).toContain('clientName');
    expect(missing).not.toContain('firmName');
  });

  it('every template declares its fields and has a body', () => {
    for (const template of LETTER_TEMPLATES) {
      expect(template.fields.length).toBeGreaterThan(0);
      expect(template.body.length).toBeGreaterThan(0);
      // Every placeholder used in the body must be declared as a field, or it can never be filled.
      const used = new Set([...template.body.join(' ').matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]));
      for (const key of used) {
        expect(template.fields).toContain(key);
      }
    }
  });
});
