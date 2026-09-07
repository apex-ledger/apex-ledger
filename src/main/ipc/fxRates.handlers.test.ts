import { afterEach, describe, expect, it, vi } from 'vitest';
import { fxRatesGetLatest } from './fxRates.handlers';

describe('fxRatesGetLatest', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('requests and reads the selected Bank of Canada currency series', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ observations: [{ d: '2026-08-31', FXEURCAD: { v: '1.6098' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fxRatesGetLatest('EUR')).resolves.toEqual({ rate: 1.6098, date: '2026-08-31' });
    expect(fetchMock).toHaveBeenCalledWith('https://www.bankofcanada.ca/valet/observations/FXEURCAD/json?recent=1');
  });

  it('rejects a currency outside the supported accounting contract', async () => {
    await expect(fxRatesGetLatest('AED' as never)).rejects.toThrow('Unsupported foreign currency');
  });
});
