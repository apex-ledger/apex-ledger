import { describe, expect, it } from 'vitest';
import { ACCOUNTING_NAV, BOOKKEEPING_NAV, MAIN_NAV, type NavItem } from './Sidebar';
import { EDITIONS, hasFeature } from '@shared/domain/licensing/editions';

/** What each edition's sidebar actually contains.
 *
 * Gating is easy to get subtly wrong in a way nobody notices until a customer complains: a screen
 * left ungated that should not be there, or — far worse — a screen gated behind a feature its own
 * edition lacks, leaving a paying customer unable to reach something they bought.
 */

const ALL: NavItem[] = [...MAIN_NAV, ...BOOKKEEPING_NAV, ...ACCOUNTING_NAV].flatMap((i) => [i, ...(i.children ?? [])]);

function visibleIn(edition: (typeof EDITIONS)[number]['edition']): string[] {
  return ALL.filter((i) => !i.feature || hasFeature(edition, i.feature)).map((i) => i.label);
}

describe('the full edition', () => {
  it('shows everything', () => {
    expect(visibleIn('full')).toHaveLength(ALL.length);
  });
});

describe('Books & Inventory', () => {
  it('hides payroll and client management', () => {
    const visible = visibleIn('booksInventory');
    expect(visible).not.toContain('Payroll');
    expect(visible).not.toContain('Client Management');
  });

  it('keeps inventory, which is what the edition is named for', () => {
    expect(visibleIn('booksInventory')).toContain('Inventory');
  });
});

describe('Books & Payroll', () => {
  it('hides inventory and client management', () => {
    const visible = visibleIn('booksPayroll');
    expect(visible).not.toContain('Inventory');
    expect(visible).not.toContain('Client Management');
  });

  it('keeps payroll, which is what the edition is named for', () => {
    expect(visibleIn('booksPayroll')).toContain('Payroll');
  });
});

describe('what no edition may lose', () => {
  it('leaves every edition able to do bookkeeping', () => {
    // Whatever else is withheld, the app has to remain an accounting package.
    for (const edition of EDITIONS) {
      const visible = visibleIn(edition.edition);
      for (const essential of ['Dashboard', 'Sales & Payments', 'Expenses & Bills', 'Banking & Accounting', 'Sales Tax (GST/HST)', 'Reports & Analytics', 'Business Tax & GIFI', 'Settings']) {
        expect(visible, `${edition.label} cannot reach ${essential}`).toContain(essential);
      }
    }
  });

  it('never gates a screen behind a feature its own edition lacks', () => {
    // A paying customer unable to reach something they bought is the worst failure here, and it
    // would only ever be noticed by them.
    for (const edition of EDITIONS) {
      for (const item of ALL) {
        if (!item.feature) continue;
        if (edition.features.includes(item.feature)) {
          expect(visibleIn(edition.edition), `${edition.label} bought ${item.feature} but cannot see ${item.label}`).toContain(
            item.label,
          );
        }
      }
    }
  });
});

describe('the gates themselves', () => {
  it('tags only the screens an edition can withhold', () => {
    // Anything gated must name a feature the edition table actually knows about, or it would be
    // hidden from everyone forever.
    const known = new Set(EDITIONS.flatMap((e) => e.features));
    for (const item of ALL) {
      if (item.feature) expect(known, `${item.label} is gated behind an unknown feature`).toContain(item.feature);
    }
  });
});
