import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { AppConfig } from './config.js';

export interface AuthenticatedUser {
  objectId: string;
  subject: string;
  email: string | null;
  displayName: string | null;
}

export type TokenVerifier = (authorizationHeader: string | undefined) => Promise<AuthenticatedUser>;

function claimString(payload: JWTPayload, name: string): string | null {
  const value = payload[name];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function createEntraTokenVerifier(config: AppConfig): TokenVerifier {
  const jwks = createRemoteJWKSet(new URL(config.AUTH_JWKS_URI));

  return async (authorizationHeader) => {
    const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader ?? '');
    if (!match?.[1]) throw new Error('missing_bearer_token');

    const { payload } = await jwtVerify(match[1], jwks, {
      issuer: config.AUTH_ISSUER,
      audience: config.AUTH_AUDIENCE,
      algorithms: ['RS256'],
    });

    const objectId = claimString(payload, 'oid') ?? claimString(payload, 'sub');
    if (!objectId || !payload.sub) throw new Error('invalid_identity_claims');

    return {
      objectId,
      subject: payload.sub,
      // Invitation acceptance requires the identity provider's explicit email
      // claim. A display/sign-in name is not treated as a verified email.
      email: claimString(payload, 'email'),
      displayName: claimString(payload, 'name'),
    };
  };
}
