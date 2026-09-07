/** Units a product or service is sold in. Bounded so "hr", "hour" and "Hours" stop being three
 * different units on three different invoices; "Other" keeps the door open for the genuinely
 * unusual. Grouped the way a person thinks about them, not alphabetically. */
export const PRODUCT_UNIT_GROUPS: { group: string; units: string[] }[] = [
  { group: 'Count', units: ['each', 'pair', 'dozen', 'pack', 'box', 'case', 'roll', 'sheet', 'set'] },
  { group: 'Time', units: ['hour', 'day', 'week', 'month', 'year', 'session', 'visit'] },
  { group: 'Weight', units: ['g', 'kg', 'lb', 'oz', 'tonne'] },
  { group: 'Volume', units: ['mL', 'L', 'gal'] },
  { group: 'Length and area', units: ['cm', 'm', 'km', 'in', 'ft', 'sq ft', 'sq m', 'acre'] },
  { group: 'Service', units: ['service', 'project', 'trip', 'km driven'] },
];

export const PRODUCT_UNITS: string[] = PRODUCT_UNIT_GROUPS.flatMap((group) => group.units);
export const DEFAULT_UNIT = 'each';

export function isListedUnit(value: string): boolean {
  const wanted = value.trim().toLowerCase();
  return PRODUCT_UNITS.some((unit) => unit.toLowerCase() === wanted);
}
