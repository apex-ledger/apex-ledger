import { describe, it, expect } from 'vitest';
import { capitalizeWords } from './textCase';

describe('capitalizeWords', () => {
  it('capitalizes the first letter of each word', () => {
    expect(capitalizeWords('john smith')).toBe('John Smith');
  });

  it('leaves already-capitalized internal letters alone', () => {
    expect(capitalizeWords('McDonald')).toBe('McDonald');
  });

  it('capitalizes after a hyphen', () => {
    expect(capitalizeWords('mary-jane watson')).toBe('Mary-Jane Watson');
  });

  it('handles empty string', () => {
    expect(capitalizeWords('')).toBe('');
  });

  it('leaves numbers and punctuation untouched', () => {
    expect(capitalizeWords('123 main st.')).toBe('123 Main St.');
  });
});
