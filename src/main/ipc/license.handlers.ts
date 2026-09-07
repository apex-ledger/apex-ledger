import { z } from 'zod';
import { activateLicense, getLicenseStatus } from '../licensing/license';
import { formatMachineId, getMachineId } from '../licensing/machineId';

const activateLicenseSchema = z.string().min(1);

export function licenseStatus() {
  return getLicenseStatus();
}

export function licenseActivate(input: unknown) {
  const key = activateLicenseSchema.parse(input);
  return activateLicense(key);
}

export function licenseGetMachineId() {
  return formatMachineId(getMachineId());
}
