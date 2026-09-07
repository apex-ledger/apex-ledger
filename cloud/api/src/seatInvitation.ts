import { createHash, randomBytes } from 'node:crypto';

const invitationLifetimeMs = 7 * 24 * 60 * 60 * 1_000;

export interface SeatInvitationSecret {
  tokenHash: string;
  expiresAt: string;
  acceptUrl: string;
}

export function createSeatInvitationSecret(
  baseUrl: string,
  nowMs = Date.now(),
  randomSource: (size: number) => Buffer = randomBytes,
): SeatInvitationSecret {
  const token = randomSource(32).toString('base64url');
  return {
    tokenHash: hashSeatInvitationToken(token),
    expiresAt: new Date(nowMs + invitationLifetimeMs).toISOString(),
    // The fragment is interpreted by the browser and is not sent in the initial
    // HTTP request, keeping the raw token out of ordinary server access logs.
    acceptUrl: `${baseUrl}#invite=${encodeURIComponent(token)}`,
  };
}

export function hashSeatInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
