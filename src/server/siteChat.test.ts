import { describe, expect, it } from 'vitest';
import { answerSiteQuestion, buildSystemPrompt, HANDOFF_MARK, IpLimiter, limitTurns } from './siteChat';

describe('limitTurns', () => {
  it('keeps the last twelve turns, folds repeated roles, and insists on a final question', () => {
    const turns = limitTurns([{ role: 'assistant', content: 'stray' }, { role: 'user', content: 'a' }, { role: 'user', content: 'b' }, { role: 'assistant', content: 'c' }, { role: 'user', content: 'd' }]);
    expect(turns).toEqual([{ role: 'user', content: 'a\nb' }, { role: 'assistant', content: 'c' }, { role: 'user', content: 'd' }]);
    const many = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `t${i}` }));
    const kept = limitTurns([...many, { role: 'user', content: 'last' }]);
    expect(kept.length).toBeLessThanOrEqual(12);
    expect(kept[kept.length - 1].content).toBe('last');
    expect(() => limitTurns([{ role: 'assistant', content: 'only me' }])).toThrow(/ask a question/i);
    expect(() => limitTurns('nope')).toThrow(/list of turns/i);
  });

  it('truncates a very long question rather than sending it whole', () => {
    const [t] = limitTurns([{ role: 'user', content: 'x'.repeat(5000) }]);
    expect(t.content).toHaveLength(1000);
  });
});

describe('IpLimiter', () => {
  it('allows the configured number per window and then refuses', () => {
    const l = new IpLimiter(3, 1000);
    expect([l.allow('a', 0), l.allow('a', 1), l.allow('a', 2), l.allow('a', 3)]).toEqual([true, true, true, false]);
    expect(l.allow('b', 3)).toBe(true); // another address is unaffected
    expect(l.allow('a', 1500)).toBe(true); // the window has passed
  });
});

describe('buildSystemPrompt', () => {
  it('confines the assistant to the website text and names the hand-off token', () => {
    const p = buildSystemPrompt('### Pricing\nBusiness $39');
    expect(p).toContain('only the website text');
    expect(p).toContain(HANDOFF_MARK);
    expect(p).toContain('Business $39');
    expect(p).toContain('Canadian data centres');
  });
});

describe('answerSiteQuestion', () => {
  const reply = (text: string, status = 200) => async () => new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status, headers: { 'content-type': 'application/json' } });

  it('returns the model text and no hand-off for a normal answer', async () => {
    const r = await answerSiteQuestion([{ role: 'user', content: 'How much is a seat?' }], { apiKey: 'k', fetchImpl: reply('Business is $39 per seat per month.') as unknown as typeof fetch, knowledge: 'x' });
    expect(r).toEqual({ answer: 'Business is $39 per seat per month.', handoff: false });
  });

  it('strips the hand-off token and flags the reply', async () => {
    const r = await answerSiteQuestion([{ role: 'user', content: 'Do you support Quebec payroll?' }], { apiKey: 'k', fetchImpl: reply('The website does not say. ' + HANDOFF_MARK) as unknown as typeof fetch, knowledge: 'x' });
    expect(r).toEqual({ answer: 'The website does not say.', handoff: true });
  });

  it('sends the key, the model and the conversation the API expects', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const f = (async (url: string, init: RequestInit) => { seen = { url, init }; return (await reply('ok')()); }) as unknown as typeof fetch;
    await answerSiteQuestion([{ role: 'user', content: 'hi' }], { apiKey: 'secret', model: 'claude-test', fetchImpl: f, knowledge: 'x' });
    expect(seen!.url).toBe('https://api.anthropic.com/v1/messages');
    expect((seen!.init.headers as Record<string, string>)['x-api-key']).toBe('secret');
    const body = JSON.parse(String(seen!.init.body));
    expect(body.model).toBe('claude-test');
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('turns an API failure into a plain error', async () => {
    await expect(answerSiteQuestion([{ role: 'user', content: 'hi' }], { apiKey: 'k', fetchImpl: reply('overloaded', 529) as unknown as typeof fetch, knowledge: 'x' })).rejects.toThrow(/unavailable right now \(529\)/);
  });
});
