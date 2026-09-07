import { describe, expect, it } from 'vitest';
import { newAccountSchema, updateAccountSchema } from './schemas';

/** The four-character floor on account codes. Codes sort the whole chart of accounts and are what
 * the account pickers match on as you type; a one-character code like "1" matches loosely enough to
 * be picked by accident, which is how a bank account lands on a line that meant something else. */

function newAccount(code: string) {
  return { code, name: 'Chequing', accountType: 'Asset' as const };
}

describe('account code length', () => {
  it('accepts the usual four-digit codes', () => {
    for (const code of ['1000', '1002', '1005', '5100', '20000']) {
      expect(newAccountSchema.safeParse(newAccount(code)).success).toBe(true);
    }
  });

  it('rejects anything shorter than four characters', () => {
    for (const code of ['1', '12', '125']) {
      const result = newAccountSchema.safeParse(newAccount(code));
      expect(result.success, `expected "${code}" to be rejected`).toBe(false);
    }
  });

  it('explains what to do instead of just failing', () => {
    const result = newAccountSchema.safeParse(newAccount('1'));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('at least 4 characters');
    }
  });

  it('allows letters, since some charts number accounts 1000A', () => {
    expect(newAccountSchema.safeParse(newAccount('1000A')).success).toBe(true);
  });

  it('applies the same rule when an existing code is edited', () => {
    // The Chart of Accounts edits codes in place, so the rule has to hold on update too, not only
    // when an account is first created.
    expect(updateAccountSchema.safeParse({ id: 1, patch: { code: '1' } }).success).toBe(false);
    expect(updateAccountSchema.safeParse({ id: 1, patch: { code: '1000' } }).success).toBe(true);
  });

  it('leaves an edit that does not touch the code alone', () => {
    // Renaming an account whose code predates this rule must still work.
    expect(updateAccountSchema.safeParse({ id: 1, patch: { name: 'Chequing (0542)' } }).success).toBe(true);
  });

  it('trims before measuring, so spaces cannot pad a short code', () => {
    expect(newAccountSchema.safeParse(newAccount('  1  ')).success).toBe(false);
  });
});
