/** Countries offered in an address. Canada and the United States first — nearly every contact —
 * then the rest alphabetically. A country not listed is typed under "Other", so the list bounds
 * the common case without refusing the uncommon one. */
export const COUNTRIES: string[] = [
  'Canada',
  'United States',
  'Australia', 'Austria', 'Belgium', 'Brazil', 'Chile', 'China', 'Colombia', 'Czech Republic', 'Denmark', 'Egypt', 'Finland', 'France',
  'Germany', 'Greece', 'Hong Kong', 'Hungary', 'India', 'Indonesia', 'Ireland', 'Israel', 'Italy', 'Jamaica', 'Japan', 'Kenya', 'Malaysia',
  'Mexico', 'Netherlands', 'New Zealand', 'Nigeria', 'Norway', 'Pakistan', 'Philippines', 'Poland', 'Portugal', 'Saudi Arabia', 'Singapore',
  'South Africa', 'South Korea', 'Spain', 'Sri Lanka', 'Sweden', 'Switzerland', 'Taiwan', 'Thailand', 'Trinidad and Tobago', 'Turkey',
  'Ukraine', 'United Arab Emirates', 'United Kingdom', 'Vietnam',
];

export const DEFAULT_COUNTRY = 'Canada';

export function isListedCountry(value: string): boolean {
  const wanted = value.trim().toLowerCase();
  return COUNTRIES.some((country) => country.toLowerCase() === wanted);
}
