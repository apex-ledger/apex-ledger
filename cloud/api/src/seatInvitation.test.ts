import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSeatInvitationSecret, hashSeatInvitationToken } from './seatInvitation.js';

describe('seat invitation secret', () => {
  it('stores a hash and keeps the raw token in the URL fragment', () => {
    const raw = Buffer.alloc(32, 7);
    const result = createSeatInvitationSecret('https://ledger.example/accept', Date.UTC(2026, 7, 29), () => raw);
    const parsed = new URL(result.acceptUrl);
    const token = parsed.hash.slice('#invite='.length);
    assert.equal(parsed.search, '');
    assert.equal(result.tokenHash, hashSeatInvitationToken(decodeURIComponent(token)));
    assert.equal(result.tokenHash.length, 64);
    assert.equal(result.acceptUrl.includes(result.tokenHash), false);
    assert.equal(result.expiresAt, '2026-09-05T00:00:00.000Z');
  });
});
