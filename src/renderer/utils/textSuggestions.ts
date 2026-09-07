import { CANADIAN_CITY_NAMES, suggestProvince } from '@shared/domain/contacts/canadianPlaces';

const MAX_SUGGESTIONS_PER_FIELD = 20;
const STORAGE_PREFIX = 'nl-suggest:';

function storageKey(fieldKey: string): string {
  return `${STORAGE_PREFIX}${fieldKey}`;
}

/** Every value previously entered into this field (most recent first), for a native `<datalist>`
 * autosuggest dropdown. Keyed by an arbitrary caller-chosen `fieldKey` (e.g. "je-line-description")
 * shared by every input of that kind across the app, so a description typed on a Journal Entry
 * line suggests on a Bill line too. Stored in localStorage — per-machine, not synced, and never
 * blocks a save if it's unavailable (private browsing-style restrictions, quota, etc.). */
export function getSuggestions(fieldKey: string): string[] {
  const learned = readList(storageKey(fieldKey));
  // The city list starts out knowing the country's larger municipalities, so the first customer
  // in Mississauga is already a suggestion; what gets typed on this machine goes to the front.
  if (fieldKey === 'city') {
    const seen = new Set(learned.map((v) => v.toLowerCase()));
    return [...learned, ...CANADIAN_CITY_NAMES.filter((city) => !seen.has(city.toLowerCase()))];
  }
  return learned;
}

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

const CITY_PROVINCE_KEY = `${STORAGE_PREFIX}map:city-province`;

function readCityProvinceMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CITY_PROVINCE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Learns which province a city is in, from an address someone completed. */
export function rememberCityProvince(city: string, province: string): void {
  const key = city.trim().toLowerCase();
  const value = province.trim().toUpperCase();
  if (!key || !value) return;
  const map = readCityProvinceMap();
  if (map[key] === value) return;
  map[key] = value;
  try {
    localStorage.setItem(CITY_PROVINCE_KEY, JSON.stringify(map));
  } catch {
    // A convenience, never a reason to fail a save.
  }
}

/** The province this machine has learned for a city, or null. */
export function learnedProvinceForCity(city: string): string | null {
  return readCityProvinceMap()[city.trim().toLowerCase()] ?? null;
}

/** The province to put in an empty province field: learned for the city, else the built-in city
 * list, else the postal code. Null when nothing says. */
export function provinceToFill(city: string, postalCode: string): string | null {
  return suggestProvince(city, postalCode, learnedProvinceForCity);
}

/** Records a value as typed (most-recent-first, deduped case-insensitively, capped) so it appears
 * as a suggestion next time this field is used. Call from onBlur once the user is done typing —
 * empty/whitespace-only values are ignored. */
export function recordSuggestion(fieldKey: string, value: string): void {
  const trimmed = value.trim();
  if (!trimmed) return;
  const existing = readList(storageKey(fieldKey)); // learned values only, never the built-in seed list
  const deduped = existing.filter((v) => v.toLowerCase() !== trimmed.toLowerCase());
  const next = [trimmed, ...deduped].slice(0, MAX_SUGGESTIONS_PER_FIELD);
  try {
    localStorage.setItem(storageKey(fieldKey), JSON.stringify(next));
  } catch {
    // Suggestions are a convenience, never a reason to fail a save.
  }
}

/** The `id` a `<datalist>` for this field should use, and what an `<input list=...>` should
 * reference — kept as one helper so the two never drift apart. */
export function suggestionListId(fieldKey: string): string {
  return `suggest-${fieldKey}`;
}
