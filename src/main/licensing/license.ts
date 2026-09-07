import { app } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getMachineId } from './machineId';
import { editionFromLicense, type Edition } from '@shared/domain/licensing/editions';
import { licensedSeats, seatPlanFromLicense, type SeatPlanCode } from '@shared/domain/licensing/seatPlans';
import { localIsoDate } from '@shared/domain/dates/localDate';

/** Must match the --product= value used when issuing keys with generate-license.js. */
const PRODUCT_ID = 'pj-accounting';

/** Public half of the Ed25519 keypair generated once in the separate "Software Licensing"
 * folder (kept outside this repo). This half can only verify signatures, never create them,
 * so it is safe to ship inside the installed app. */
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEARb7mM3NW/taKkh4NtzdiIpA1TtfCc0RMWr+AB4b9d7c=
-----END PUBLIC KEY-----
`;

interface LicensePayload {
  customer: string;
  product: string;
  issued: string;
  expires: string | null;
  /** When set, this key only activates on the installation whose machine id matches — issued
   * with --seat=<machineId> in generate-license.js. Omitted (undefined/null) on older
   * already-issued keys, which stay valid on any machine for backward compatibility. */
  machineId?: string | null;
  /** Which seat plan was bought, and how many seats it covers. Both absent on keys issued before
   * seat billing, which stay unlimited for backward compatibility. */
  plan?: SeatPlanCode | null;
  seats?: number | null;
}

export interface LicenseStatus {
  licensed: boolean;
  customer?: string;
  expires?: string | null;
  error?: string;
  /** Which edition the key unlocks. Absent when the key is invalid, since nothing is unlocked. */
  edition?: Edition;
  /** The seat plan code, for looking up what a seat costs. Absent on pre-seat keys. */
  plan?: SeatPlanCode | null;
  /** How many people this licence covers. null means no limit — a pre-seat key. */
  seats?: number | null;
}

function licenseFilePath(): string {
  return path.join(app.getPath('userData'), 'license.json');
}

function todayIso(): string {
  return localIsoDate();
}

/** Verifies a license key's signature, product match, and expiry. Never throws — bad input
 * (garbage string, wrong product, tampered signature, expired date) all resolve to a status
 * with `licensed: false` and a human-readable `error`. */
export function verifyLicenseKey(key: string): LicenseStatus {
  const parts = key.trim().split('.');
  if (parts.length !== 2) return { licensed: false, error: 'That doesn’t look like a valid license key.' };
  const [payloadB64, sigB64] = parts;
  let payload: LicensePayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
  } catch {
    return { licensed: false, error: 'That doesn’t look like a valid license key.' };
  }
  let signatureValid: boolean;
  try {
    const publicKey = crypto.createPublicKey(PUBLIC_KEY_PEM);
    signatureValid = crypto.verify(null, Buffer.from(JSON.stringify(payload)), publicKey, Buffer.from(sigB64, 'base64url'));
  } catch {
    return { licensed: false, error: 'That doesn’t look like a valid license key.' };
  }
  if (!signatureValid) return { licensed: false, error: 'This license key is not valid.' };
  if (payload.product !== PRODUCT_ID) return { licensed: false, error: 'This license key is for a different product.' };
  if (payload.machineId && payload.machineId !== getMachineId()) {
    return { licensed: false, customer: payload.customer, error: 'This license key is activated on a different computer. Contact your vendor for a key for this machine.' };
  }
  if (payload.expires && payload.expires < todayIso()) {
    return { licensed: false, customer: payload.customer, expires: payload.expires, error: `This license expired on ${payload.expires}.` };
  }
  // A key with no edition predates editions entirely: those customers bought the app when it was
  // one product with everything in it, so they keep everything. An unrecognised edition fails
  // closed instead — see editionFromLicense.
  return {
    licensed: true,
    customer: payload.customer,
    expires: payload.expires,
    edition: editionFromLicense((payload as { edition?: string }).edition),
    plan: seatPlanFromLicense(payload.plan)?.code ?? null,
    seats: licensedSeats(payload.seats, seatPlanFromLicense(payload.plan)),
  };
}

/** Reads whatever key is currently stored for this install (if any) and re-verifies it fresh
 * every time, so an expiry date that has since passed is caught even without reactivating. */
/** On the web server the entitlement is the organisation's seats, checked at sign-in; there is
 * no per-machine key. The server sets this before any handler runs. */
export const WEB_LICENSE: { status: LicenseStatus | null } = { status: null };

export function getLicenseStatus(): LicenseStatus {
  if (WEB_LICENSE.status) return WEB_LICENSE.status;
  let stored: { key?: string };
  try {
    stored = JSON.parse(fs.readFileSync(licenseFilePath(), 'utf-8'));
  } catch {
    return { licensed: false, error: 'No license activated yet.' };
  }
  if (!stored.key) return { licensed: false, error: 'No license activated yet.' };
  return verifyLicenseKey(stored.key);
}

/** Validates a key and, only if valid, persists it to userData so future launches stay
 * activated without asking again (until/unless it expires). */
export function activateLicense(key: string): LicenseStatus {
  const status = verifyLicenseKey(key);
  if (!status.licensed) return status;
  const filePath = licenseFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({ key: key.trim() }, null, 2), 'utf-8');
  return status;
}
