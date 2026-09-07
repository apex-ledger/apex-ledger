import type { Employee } from '../types';

export type EmployeeAddressFields = Pick<Employee, 'addressLine1' | 'addressLine2' | 'addressCity' | 'addressProvince' | 'addressPostalCode'>;

/**
 * Formats an employee's mailing address the way it's printed in the T4's employee block —
 * street on one line, "City, PROV A1A 1A1" on the next — matching companyAddressLines() so the
 * employer and employee blocks of a slip read the same. Missing pieces are simply left out, so a
 * partially filled address still prints sensibly rather than showing stray commas.
 */
export function employeeAddressLines(employee: EmployeeAddressFields): string[] {
  const lines: string[] = [];
  if (employee.addressLine1) lines.push([employee.addressLine1, employee.addressLine2].filter(Boolean).join(', '));
  const cityLine = [employee.addressCity, [employee.addressProvince, employee.addressPostalCode].filter(Boolean).join(' ').trim()]
    .filter(Boolean)
    .join(', ');
  if (cityLine) lines.push(cityLine);
  return lines;
}

/** True once there's enough of an address to print on a slip — i.e. anything at all was entered. */
export function hasEmployeeAddress(employee: EmployeeAddressFields): boolean {
  return employeeAddressLines(employee).length > 0;
}
