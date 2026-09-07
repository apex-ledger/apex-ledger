import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('staff sign-in log migration', () => {
  it('creates the sign-in table with a sign-in, a sign-out, and the reason it ended', () => {
    const sql = fs.readFileSync('src/main/db/migrations/0072_staff_sign_in_log.sql', 'utf8').toLowerCase();
    expect(sql).toContain('create table staff_sessions');
    for (const column of ['actor_key', 'actor_name', 'actor_email', 'role', 'window_id', 'signed_in_at', 'signed_out_at', 'end_reason']) {
      expect(sql).toContain(column);
    }
    // An open session is found by window when it has to be closed; without the partial index that
    // becomes a scan of every session ever recorded on every switch, lock and close.
    expect(sql).toContain('where signed_out_at is null');
  });
});
