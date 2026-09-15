import { describe, expect, it } from 'vitest';
import { maskSinForEmail } from './slipDelivery';

describe('the SIN on an emailed slip', () => {
  it('shows only the last three digits, however it was typed', () => {
    expect(maskSinForEmail('046 454 286')).toBe('*** *** 286');
    expect(maskSinForEmail('046454286')).toBe('*** *** 286');
    expect(maskSinForEmail('046-454-286')).toBe('*** *** 286');
  });

  it('leaves blanks and anything that is not a nine-digit SIN as it was', () => {
    expect(maskSinForEmail(null)).toBeNull();
    expect(maskSinForEmail('')).toBe('');
    expect(maskSinForEmail('123456789RT0001')).toBe('123456789RT0001');
  });
});
