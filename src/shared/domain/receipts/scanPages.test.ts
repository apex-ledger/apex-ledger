import { describe, expect, it } from 'vitest';
import { sidesWithContent } from './scanPages';

describe('sidesWithContent', () => {
  it('drops the blank back of a single receipt whichever way it was loaded', () => {
    expect(sidesWithContent([0.031, 0.0004])).toEqual([0]);
    expect(sidesWithContent([0.0006, 0.028])).toEqual([1]);
  });

  it('keeps both sides when both carry printing', () => {
    expect(sidesWithContent([0.03, 0.012])).toEqual([0, 1]);
  });

  it('handles a stack of receipts with backs', () => {
    expect(sidesWithContent([0.03, 0.0003, 0.041, 0.0009, 0.0001, 0.025])).toEqual([0, 2, 5]);
  });

  it('keeps the darkest side rather than nothing for a faded receipt', () => {
    expect(sidesWithContent([0.0009, 0.0004])).toEqual([0]);
  });

  it('is empty for no pages', () => {
    expect(sidesWithContent([])).toEqual([]);
  });
});
