import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('multi-user activity migration', () => {
  it('adds revision attribution and the company-wide activity log', () => {
    const sql = fs.readFileSync('src/main/db/migrations/0070_multi_user_activity.sql', 'utf8').toLowerCase();
    expect(sql).toContain('alter table journal_entry_revisions add column changed_by text');
    expect(sql).toContain('create table user_activity_log');
    for (const column of ['actor_key', 'actor_name', 'actor_email', 'topic', 'action', 'target_reference', 'changed_at']) {
      expect(sql).toContain(column);
    }
  });
});
