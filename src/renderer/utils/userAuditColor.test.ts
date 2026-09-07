import { describe, expect, it } from 'vitest';
import { userAuditStyle } from './userAuditColor';

describe('user audit colors', () => {
  it('uses the signed-in-user style for the current person', () => {
    expect(userAuditStyle('Asha', 'Asha').row).toContain('emerald');
  });

  it('assigns another person a stable, visibly different style', () => {
    const first = userAuditStyle('Morgan', 'Asha');
    expect(first).toEqual(userAuditStyle('Morgan', 'Asha'));
    expect(first.row).not.toContain('emerald');
  });

  it('keeps legacy rows neutral', () => {
    expect(userAuditStyle(null, 'Asha').row).toBe('');
  });
});
