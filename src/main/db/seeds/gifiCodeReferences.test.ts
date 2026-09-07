import { describe, it, expect } from 'vitest';
import { GIFI_CODES_SEED } from './gifi_codes.seed';
import { BUSINESS_TYPE_EXPENSE_CATEGORIES } from '@shared/domain/businessTypes';
import { RETAIL_TEMPLATE } from './coa_template.retail.seed';
import { GENERAL_SERVICES_TEMPLATE } from './coa_template.general_services.seed';

/**
 * `accounts.gifi_code` has a real foreign-key constraint against `gifi_codes.code` (see
 * 0003_chart_of_accounts.sql) — a company's gifi_codes table is only ever populated from
 * GIFI_CODES_SEED, so any gifiCode referenced elsewhere that isn't in that list makes account
 * creation fail with "FOREIGN KEY constraint failed" the moment someone actually tries to add
 * that category. This exact thing happened once already (code 8911 was dropped from the seed
 * during a correction pass, but ~11 "Rent" categories and two CoA templates still pointed at it) —
 * this test exists so the next GIFI correction pass can't reintroduce the same class of bug
 * silently; it'll fail immediately instead of waiting for a user to hit the FK error in the app.
 */
describe('every referenced GIFI code exists in the seed list', () => {
  const validCodes = new Set(GIFI_CODES_SEED.map((row) => row.code));

  it('every suggested-category gifiCode across every business type is valid', () => {
    const missing: string[] = [];
    for (const [businessType, categories] of Object.entries(BUSINESS_TYPE_EXPENSE_CATEGORIES)) {
      for (const category of categories) {
        if (category.gifiCode && !validCodes.has(category.gifiCode)) {
          missing.push(`${businessType} / "${category.name}" -> ${category.gifiCode}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('every Retail CoA template account gifiCode is valid', () => {
    const missing = RETAIL_TEMPLATE.accounts.filter((a) => a.gifiCode && !validCodes.has(a.gifiCode)).map((a) => `"${a.name}" -> ${a.gifiCode}`);
    expect(missing).toEqual([]);
  });

  it('every General/Professional Services CoA template account gifiCode is valid', () => {
    const missing = GENERAL_SERVICES_TEMPLATE.accounts.filter((a) => a.gifiCode && !validCodes.has(a.gifiCode)).map((a) => `"${a.name}" -> ${a.gifiCode}`);
    expect(missing).toEqual([]);
  });
});
