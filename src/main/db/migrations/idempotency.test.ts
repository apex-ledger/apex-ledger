import { describe, expect, it } from 'vitest';
import { MIGRATIONS } from './index';
import { splitStatements } from '../migrationRunner';

/**
 * The runner re-applies every migration on every company open. That makes two shapes of
 * statement dangerous: an INSERT ... SELECT with no guard (it inserts again each launch — 0062,
 * 0071 and 0073 did exactly that and multiplied bill lines, credit applications and period locks
 * on every open), and ALTER TABLE ... DROP COLUMN (it wipes the column's data each launch).
 * This test refuses both so the mistake cannot ship again.
 */
describe('migrations are safe to re-run', () => {
  it('guards every INSERT ... SELECT with NOT EXISTS or OR IGNORE', () => {
    const offenders: string[] = [];
    for (const m of MIGRATIONS) {
      for (const statement of splitStatements(m.sql)) {
        const upper = statement.toUpperCase();
        if (!upper.startsWith('INSERT')) continue;
        if (!/\bSELECT\b/.test(upper)) continue; // literal VALUES inserts are covered by the next test
        if (upper.includes('NOT EXISTS') || upper.includes('OR IGNORE')) continue;
        offenders.push(`${m.version} ${m.name}: ${statement.slice(0, 80)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never inserts literal VALUES rows without OR IGNORE (they would repeat each open)', () => {
    const offenders: string[] = [];
    for (const m of MIGRATIONS) {
      for (const statement of splitStatements(m.sql)) {
        const upper = statement.toUpperCase();
        if (upper.startsWith('INSERT') && /\bVALUES\b/.test(upper) && !upper.includes('OR IGNORE') && !upper.includes('NOT EXISTS')) {
          offenders.push(`${m.version} ${m.name}: ${statement.slice(0, 80)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never drops a column', () => {
    const offenders = MIGRATIONS.filter((m) => splitStatements(m.sql).some((statement) => /DROP\s+COLUMN/i.test(statement))).map((m) => `${m.version} ${m.name}`);
    expect(offenders).toEqual([]);
  });
});
