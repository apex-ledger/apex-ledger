import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ContactPrivacyError, hashCanadianSin, looksLikeSinSearch, normalizeCanadianSin } from './contactPrivacy.js';

describe('contact SIN privacy', () => {
  const secret = 'test-only-secret-with-at-least-32-characters';

  it('normalizes a valid SIN and stores only a stable keyed lookup plus last four', () => {
    assert.equal(normalizeCanadianSin('046 454 286'), '046454286');
    const first = hashCanadianSin(secret, '046-454-286');
    const second = hashCanadianSin(secret, '046454286');
    assert.equal(first.lookupHash, second.lookupHash);
    assert.equal(first.lastFour, '4286');
    assert.equal(first.lookupHash.includes('046454286'), false);
  });

  it('rejects invalid identifiers and recognizes only complete SIN-shaped searches', () => {
    assert.throws(() => normalizeCanadianSin('123456789'), ContactPrivacyError);
    assert.equal(looksLikeSinSearch('046 454 286'), true);
    assert.equal(looksLikeSinSearch('4286'), false);
  });
});
