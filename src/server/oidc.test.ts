import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { authorizeUrl, providersFromEnv, verifyIdToken, type Jwk } from './oidc';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' }) as { kty: string; n: string; e: string };
const keys: Jwk[] = [{ kid: 'k1', kty: jwk.kty, n: jwk.n, e: jwk.e }];
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const nowSec = Math.floor(Date.now() / 1000);

function token(claims: Record<string, unknown>, opts: { kid?: string; alg?: string; key?: crypto.KeyObject } = {}): string {
  const head = b64({ alg: opts.alg ?? 'RS256', kid: opts.kid ?? 'k1', typ: 'JWT' });
  const body = b64({ iss: 'https://login.microsoftonline.com/bb50a25f-ee92-4a65-b1ac-515abfd3f439/v2.0', aud: 'client-1', exp: nowSec + 600, nbf: nowSec - 10, nonce: 'n1', email: 'Nisha@Firm.ca', name: 'Nisha', sub: 'abc', ...claims });
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), opts.key ?? privateKey).toString('base64url');
  return `${head}.${body}.${sig}`;
}
const ms = { clientId: 'client-1', nonce: 'n1', issuerOk: (iss: string) => /^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]+\/v2\.0$/i.test(iss) };

describe('verifyIdToken', () => {
  it('accepts a good token and lower-cases the email', () => {
    const c = verifyIdToken(token({}), keys, ms);
    expect(c.email).toBe('nisha@firm.ca');
    expect(c.name).toBe('Nisha');
  });
  it('falls back to preferred_username when email is absent (work accounts)', () => {
    expect(verifyIdToken(token({ email: undefined, preferred_username: 'p@firm.ca' }), keys, ms).email).toBe('p@firm.ca');
  });
  it('rejects a bad signature', () => {
    const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    expect(() => verifyIdToken(token({}, { key: other }), keys, ms)).toThrow(/signature/);
  });
  it('rejects an unknown key id, wrong algorithm, wrong audience, wrong issuer, expiry and nonce', () => {
    expect(() => verifyIdToken(token({}, { kid: 'zz' }), keys, ms)).toThrow(/key/);
    expect(() => verifyIdToken(token({}, { alg: 'HS256' }), keys, ms)).toThrow(/algorithm/);
    expect(() => verifyIdToken(token({ aud: 'someone-else' }), keys, ms)).toThrow(/another application/);
    expect(() => verifyIdToken(token({ iss: 'https://evil.example/v2.0' }), keys, ms)).toThrow(/issued/);
    expect(() => verifyIdToken(token({ exp: nowSec - 3600 }), keys, ms)).toThrow(/too long/);
    expect(() => verifyIdToken(token({ nonce: 'other' }), keys, ms)).toThrow(/this browser/);
    expect(() => verifyIdToken(token({ email_verified: false }), keys, ms)).toThrow(/not verified/);
  });
  it('accepts Google issuers only for the Google provider', () => {
    const g = { clientId: 'client-1', nonce: 'n1', issuerOk: (iss: string) => iss === 'https://accounts.google.com' };
    expect(verifyIdToken(token({ iss: 'https://accounts.google.com' }), keys, g).email).toBe('nisha@firm.ca');
    expect(() => verifyIdToken(token({}), keys, g)).toThrow(/issued/);
  });
});

describe('providersFromEnv and authorizeUrl', () => {
  it('turns on only the providers with both id and secret', () => {
    expect(providersFromEnv({})).toEqual([]);
    expect(providersFromEnv({ APEX_MS_CLIENT_ID: 'a' }).length).toBe(0);
    const ps = providersFromEnv({ APEX_MS_CLIENT_ID: 'a', APEX_MS_CLIENT_SECRET: 's', APEX_GOOGLE_CLIENT_ID: 'g', APEX_GOOGLE_CLIENT_SECRET: 'gs' });
    expect(ps.map((p) => p.id)).toEqual(['microsoft', 'google']);
    expect(ps[0].authorizeEndpoint).toContain('/common/');
    expect(providersFromEnv({ APEX_MS_CLIENT_ID: 'a', APEX_MS_CLIENT_SECRET: 's', APEX_MS_TENANT: 'tenant-x' })[0].tokenEndpoint).toContain('/tenant-x/');
  });
  it('builds the authorize URL with state and nonce', () => {
    const [p] = providersFromEnv({ APEX_MS_CLIENT_ID: 'a', APEX_MS_CLIENT_SECRET: 's' });
    const u = new URL(authorizeUrl(p, 'https://app.apexledger.ca/api/auth/microsoft/callback', 'st', 'no'));
    expect(u.searchParams.get('client_id')).toBe('a');
    expect(u.searchParams.get('state')).toBe('st');
    expect(u.searchParams.get('nonce')).toBe('no');
    expect(u.searchParams.get('scope')).toBe('openid profile email');
    expect(u.searchParams.get('redirect_uri')).toBe('https://app.apexledger.ca/api/auth/microsoft/callback');
  });
});
