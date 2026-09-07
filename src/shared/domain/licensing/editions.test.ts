import { describe, expect, it } from 'vitest';
import { EDITIONS, editionDefinition, editionFromLicense, editionLimits, editionsWith, hasFeature } from './editions';

describe('the three editions', () => {
  it('gives the full edition everything', () => {
    const full = editionDefinition('full');
    expect(full.features).toContain('payroll');
    expect(full.features).toContain('crm');
    expect(full.features).toContain('inventory');
    expect(full.limits.maxCompanies).toBeNull();
  });

  it('leaves payroll and client management out of Books & Inventory', () => {
    expect(hasFeature('booksInventory', 'payroll')).toBe(false);
    expect(hasFeature('booksInventory', 'crm')).toBe(false);
    expect(hasFeature('booksInventory', 'inventory')).toBe(true);
    expect(hasFeature('booksInventory', 'bookkeeping')).toBe(true);
  });

  it('leaves inventory and client management out of Books & Payroll', () => {
    expect(hasFeature('booksPayroll', 'inventory')).toBe(false);
    expect(hasFeature('booksPayroll', 'crm')).toBe(false);
    expect(hasFeature('booksPayroll', 'payroll')).toBe(true);
    expect(hasFeature('booksPayroll', 'bookkeeping')).toBe(true);
  });

  it('keeps bookkeeping and invoicing in every edition', () => {
    // Billing a customer is accounts receivable — core double entry, not an add-on.
    for (const e of EDITIONS) {
      expect(hasFeature(e.edition, 'bookkeeping'), `${e.edition} must include bookkeeping`).toBe(true);
      expect(hasFeature(e.edition, 'invoicing'), `${e.edition} must include invoicing`).toBe(true);
    }
  });
});

describe('failing closed', () => {
  it('treats an unknown edition as the most restricted one, not the most generous', () => {
    // A corrupt or future licence value must not unlock everything.
    expect(hasFeature('nonsense' as never, 'payroll')).toBe(true); // fallback is Books & Payroll
    expect(hasFeature('nonsense' as never, 'inventory')).toBe(false);
    expect(hasFeature('nonsense' as never, 'crm')).toBe(false);
  });

  it('does the same for a missing edition', () => {
    expect(hasFeature(null, 'inventory')).toBe(false);
    expect(hasFeature(undefined, 'crm')).toBe(false);
  });

  it('never returns an unlimited company count by accident', () => {
    expect(editionLimits(null).maxCompanies).not.toBeNull();
    expect(editionLimits('nonsense' as never).maxCompanies).not.toBeNull();
  });
});

describe('upgrade prompts', () => {
  it('can name which editions would unlock a feature', () => {
    expect(editionsWith('payroll').map((e) => e.edition)).toEqual(['full', 'booksPayroll']);
    expect(editionsWith('inventory').map((e) => e.edition)).toEqual(['full', 'booksInventory']);
    expect(editionsWith('crm').map((e) => e.edition)).toEqual(['full']);
  });
});

describe('the edition table itself', () => {
  it('has no duplicate editions', () => {
    const ids = EDITIONS.map((e) => e.edition);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every edition a label and a summary to show on the licence screen', () => {
    for (const e of EDITIONS) {
      expect(e.label.length).toBeGreaterThan(0);
      expect(e.summary.length).toBeGreaterThan(0);
    }
  });

  it('never lists the same feature twice within an edition', () => {
    for (const e of EDITIONS) {
      expect(new Set(e.features).size, `${e.edition} repeats a feature`).toBe(e.features.length);
    }
  });
});

describe('reading the edition off a licence key', () => {
  it('grandfathers a key issued before editions existed', () => {
    // Those customers bought the app when it was one product with everything in it.
    expect(editionFromLicense(undefined)).toBe('full');
    expect(editionFromLicense(null)).toBe('full');
    expect(editionFromLicense('')).toBe('full');
  });

  it('fails closed on a key naming an edition it does not know', () => {
    // Corrupt, tampered with, or from a newer version — none of which should unlock everything.
    expect(editionFromLicense('enterprise-plus')).toBe('booksPayroll');
    expect(hasFeature(editionFromLicense('garbage'), 'inventory')).toBe(false);
  });

  it('reads the three real editions back', () => {
    expect(editionFromLicense('full')).toBe('full');
    expect(editionFromLicense('booksInventory')).toBe('booksInventory');
    expect(editionFromLicense('booksPayroll')).toBe('booksPayroll');
  });
});
