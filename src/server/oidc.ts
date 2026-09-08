/** Sign in with Microsoft (Entra ID) or Google for the web server, with no library: the standard
 * OpenID Connect code flow, and the ID token checked here with Node's own crypto against the
 * provider's published signing keys.
 *
 * Configuration comes from the environment. Microsoft: APEX_MS_CLIENT_ID, APEX_MS_CLIENT_SECRET
 * and optionally APEX_MS_TENANT ('common' lets any work, school or personal Microsoft account
 * sign in; a tenant id restricts it to one organisation). Google: APEX_GOOGLE_CLIENT_ID and
 * APEX_GOOGLE_CLIENT_SECRET. A provider without both values is off and its button does not show.
 *
 * Signing in with a provider never creates a seat: the verified email must already belong to an
 * active person in an organisation, exactly as with a password. */
import crypto from 'node:crypto';

export type ProviderId = 'microsoft' | 'google';
export interface Provider {
  id: ProviderId;
  label: string;
  clientId: string;
  clientSecret: string;
  authorizeEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  /** Accepts an issuer claim; Microsoft's carries the tenant id, Google's is fixed. */
  issuerOk: (iss: string) => boolean;
  extraAuthorizeParams: Record<string, string>;
}

export function providersFromEnv(env: NodeJS.ProcessEnv = process.env): Provider[] {
  const out: Provider[] = [];
  const ms = { id: (env.APEX_MS_CLIENT_ID ?? '').trim(), secret: (env.APEX_MS_CLIENT_SECRET ?? '').trim(), tenant: (env.APEX_MS_TENANT ?? 'common').trim() || 'common' };
  if (ms.id && ms.secret) {
    const authority = `https://login.microsoftonline.com/${encodeURIComponent(ms.tenant)}`;
    out.push({
      id: 'microsoft', label: 'Microsoft', clientId: ms.id, clientSecret: ms.secret,
      authorizeEndpoint: `${authority}/oauth2/v2.0/authorize`, tokenEndpoint: `${authority}/oauth2/v2.0/token`, jwksUri: `${authority}/discovery/v2.0/keys`,
      issuerOk: (iss) => /^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]+\/v2\.0$/i.test(iss),
      extraAuthorizeParams: { response_mode: 'query', prompt: 'select_account' },
    });
  }
  const g = { id: (env.APEX_GOOGLE_CLIENT_ID ?? '').trim(), secret: (env.APEX_GOOGLE_CLIENT_SECRET ?? '').trim() };
  if (g.id && g.secret) {
    out.push({
      id: 'google', label: 'Google', clientId: g.id, clientSecret: g.secret,
      authorizeEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth', tokenEndpoint: 'https://oauth2.googleapis.com/token', jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
      issuerOk: (iss) => iss === 'https://accounts.google.com' || iss === 'accounts.google.com',
      extraAuthorizeParams: { prompt: 'select_account' },
    });
  }
  return out;
}

export function authorizeUrl(p: Provider, redirectUri: string, state: string, nonce: string): string {
  const q = new URLSearchParams({ client_id: p.clientId, response_type: 'code', redirect_uri: redirectUri, scope: 'openid profile email', state, nonce, ...p.extraAuthorizeParams });
  return `${p.authorizeEndpoint}?${q.toString()}`;
}

export async function exchangeCode(p: Provider, code: string, redirectUri: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const body = new URLSearchParams({ client_id: p.clientId, client_secret: p.clientSecret, grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  const res = await fetchImpl(p.tokenEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const json = (await res.json()) as { id_token?: string; error?: string; error_description?: string };
  if (!res.ok || !json.id_token) throw new Error(json.error_description ?? json.error ?? `${p.label} did not return a token (${res.status}).`);
  return json.id_token;
}

export interface Jwk { kid: string; kty: string; n?: string; e?: string }

const keyCache = new Map<string, { keys: Jwk[]; at: number }>();
export async function signingKeys(p: Provider, fetchImpl: typeof fetch = fetch): Promise<Jwk[]> {
  const hit = keyCache.get(p.jwksUri);
  if (hit && Date.now() - hit.at < 60 * 60_000) return hit.keys;
  const res = await fetchImpl(p.jwksUri);
  const json = (await res.json()) as { keys?: Jwk[] };
  if (!res.ok || !json.keys) throw new Error(`Could not fetch ${p.label}'s signing keys.`);
  keyCache.set(p.jwksUri, { keys: json.keys, at: Date.now() });
  return json.keys;
}

export interface IdClaims { email: string; name: string; subject: string; issuer: string }

const b64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** Checks signature (RS256 against the key with the token's kid), issuer, audience, expiry and
 * nonce, and returns the person's email and name. Throws with a plain reason on any failure. */
export function verifyIdToken(idToken: string, keys: Jwk[], expected: { clientId: string; nonce: string; issuerOk: (iss: string) => boolean; now?: number }): IdClaims {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('The token is not in the expected form.');
  const header = JSON.parse(b64url(parts[0]).toString('utf8')) as { alg?: string; kid?: string };
  const claims = JSON.parse(b64url(parts[1]).toString('utf8')) as Record<string, unknown>;
  if (header.alg !== 'RS256') throw new Error(`Unexpected token algorithm ${header.alg ?? '(none)'}.`);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('The token was signed with a key the provider no longer publishes.');
  const key = crypto.createPublicKey({ key: { kty: jwk.kty, n: jwk.n, e: jwk.e }, format: 'jwk' });
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, b64url(parts[2]));
  if (!ok) throw new Error('The token signature does not check out.');
  const now = Math.floor((expected.now ?? Date.now()) / 1000);
  const iss = String(claims.iss ?? '');
  if (!expected.issuerOk(iss)) throw new Error('The token was not issued by the expected provider.');
  const aud = claims.aud;
  const audOk = Array.isArray(aud) ? aud.includes(expected.clientId) : aud === expected.clientId;
  if (!audOk) throw new Error('The token was issued for another application.');
  if (typeof claims.exp !== 'number' || claims.exp < now - 60) throw new Error('The sign-in took too long; please try again.');
  if (typeof claims.nbf === 'number' && claims.nbf > now + 60) throw new Error('The token is not valid yet.');
  if (claims.nonce !== expected.nonce) throw new Error('The sign-in did not start from this browser.');
  if (claims.email_verified === false) throw new Error('That email address is not verified with the provider.');
  const email = String(claims.email ?? claims.preferred_username ?? '').trim().toLowerCase();
  if (!email.includes('@')) throw new Error('The provider did not share an email address for this account.');
  return { email, name: String(claims.name ?? email), subject: String(claims.sub ?? ''), issuer: iss };
}
