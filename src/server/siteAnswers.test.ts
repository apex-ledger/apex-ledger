import { describe, expect, it } from 'vitest';
import { answerFromSite, buildPassages, tokens } from './siteAnswers';
import { SITE_KNOWLEDGE } from './siteKnowledge.generated';

describe('site answers from the website text', () => {
  it('cuts the knowledge into FAQ pairs and heading chunks', () => {
    const p = buildPassages(SITE_KNOWLEDGE);
    expect(p.length).toBeGreaterThan(60);
    expect(p.some((x) => x.heading === 'What does a seat cost?')).toBe(true);
    expect(p.some((x) => x.heading === 'How safe is my data?')).toBe(true);
  });

  it('maps synonyms so everyday wording finds the page', () => {
    expect(tokens('How much does it cost per user?')).toEqual(expect.arrayContaining(['price', 'seat']));
    expect(tokens('Is my data safe?')).toContain('security');
  });

  const cases: [string, RegExp][] = [
    ['How much does a seat cost?', /Business \$39/],
    ['what is the price per user per month', /\$39|\$45|\$59|\$79/],
    ['Is my data safe?', /encrypted|AES|Activity Log/i],
    ['Where is my data stored?', /Canadian data centres/],
    ['Do you back up my data?', /every night|30 days/i],
    ['Can I move from QuickBooks Online?', /QuickBooks/],
    ['Does it do payroll for Quebec?', /payroll|province/i],
    ['Can it read PDF bank statements?', /PDF|statement/i],
    ['How do I cancel?', /end of any month|cancel/i],
    ['Do I need to install anything?', /browser/i],
    ['Is there a limit on company files?', /No limit|no limit|as many/i],
    ['Do you sell my data?', /Never|PIPEDA/],
    ['Who can see my books?', /Nobody|logged/i],
    ['What is the founding firm offer?', /half price|Founding/i],
  ];
  for (const [q, expected] of cases) {
    it(`answers: ${q}`, () => {
      const a = answerFromSite(q, SITE_KNOWLEDGE);
      expect(a.handoff, a.answer).toBe(false);
      expect(a.answer).toMatch(expected);
      expect(a.answer).toMatch(/https:\/\/apexledger\.ca/);
    });
  }

  it('hands off when the site says nothing about it', () => {
    const a = answerFromSite('What is the weather in Winnipeg tomorrow?', SITE_KNOWLEDGE);
    expect(a.handoff).toBe(true);
    const b = answerFromSite('zxqv plorb', SITE_KNOWLEDGE);
    expect(b.handoff).toBe(true);
  });

  it('never invents: every answer is a passage that exists in the knowledge', () => {
    const a = answerFromSite('How much does a seat cost?', SITE_KNOWLEDGE);
    const body = a.answer.split('\n\nFrom the')[0].replace(/^[^:]*: /, '');
    expect(SITE_KNOWLEDGE.replace(/\s+/g, ' ')).toContain(body.slice(0, 60));
  });
});
