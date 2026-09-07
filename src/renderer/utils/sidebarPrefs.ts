import { COLOR_SCHEMES, type ColorSchemeId } from '../theme';

/** Sidebar customization — per-item order (within its own section) and an optional color
 * override — persisted the same way as font size / color scheme (see fontSize.ts, theme.ts):
 * plain localStorage, since this is a pure device-local UI preference, not company data. Reuses
 * the same 5 color schemes as the app-wide color-scheme picker rather than a separate palette, so
 * "orange" always means the same orange everywhere in the app. */

export type { ColorSchemeId };
export { COLOR_SCHEMES };

export type SectionKey = 'main' | 'bookkeeping' | 'accounting';

interface SidebarPrefs {
  layoutVersion: number;
  order: Partial<Record<SectionKey, string[]>>;
  colors: Record<string, ColorSchemeId>;
  /** Labels of nav items hidden from the sidebar entirely (still reachable via the "+ New" menu,
   * Settings menu, or Quick Search — hiding is a declutter preference, not a permission). */
  hidden: string[];
}

const STORAGE_KEY = 'northLedger.sidebarPrefs';
// Version 2 replaces the long flat rail with QuickBooks-style work-area groups. Old top-level
// order/hidden preferences name rows that are now children, so applying them would scramble the
// new layout. Colour choices remain safe to carry forward.
const CURRENT_LAYOUT_VERSION = 2;

function loadPrefs(): SidebarPrefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { layoutVersion: CURRENT_LAYOUT_VERSION, order: {}, colors: {}, hidden: [] };
    const parsed = JSON.parse(raw);
    if (parsed.layoutVersion !== CURRENT_LAYOUT_VERSION) {
      return { layoutVersion: CURRENT_LAYOUT_VERSION, order: {}, colors: parsed.colors ?? {}, hidden: [] };
    }
    return { layoutVersion: CURRENT_LAYOUT_VERSION, order: parsed.order ?? {}, colors: parsed.colors ?? {}, hidden: parsed.hidden ?? [] };
  } catch {
    return { layoutVersion: CURRENT_LAYOUT_VERSION, order: {}, colors: {}, hidden: [] };
  }
}

function savePrefs(prefs: SidebarPrefs): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

/** Applies any stored custom order to a section's default item list — items not mentioned in the
 * stored order keep their default relative position at the end, and stored labels that no longer
 * exist (e.g. after an app update removed a nav item) are silently dropped. */
export function applyStoredOrder<T extends { label: string }>(section: SectionKey, defaultItems: T[]): T[] {
  const stored = loadPrefs().order[section];
  if (!stored || stored.length === 0) return defaultItems;
  const byLabel = new Map(defaultItems.map((item) => [item.label, item]));
  const ordered: T[] = [];
  for (const label of stored) {
    const item = byLabel.get(label);
    if (item) {
      ordered.push(item);
      byLabel.delete(label);
    }
  }
  return [...ordered, ...byLabel.values()];
}

export function storeSectionOrder(section: SectionKey, labelsInOrder: string[]): void {
  const prefs = loadPrefs();
  prefs.order[section] = labelsInOrder;
  savePrefs(prefs);
}

export function loadColorOverrides(): Record<string, ColorSchemeId> {
  return loadPrefs().colors;
}

export function storeColorOverride(itemLabel: string, colorId: ColorSchemeId | null): void {
  const prefs = loadPrefs();
  if (colorId === null) delete prefs.colors[itemLabel];
  else prefs.colors[itemLabel] = colorId;
  savePrefs(prefs);
}

export function loadHiddenItems(): Set<string> {
  return new Set(loadPrefs().hidden);
}

export function setItemHidden(itemLabel: string, hidden: boolean): void {
  const prefs = loadPrefs();
  const set = new Set(prefs.hidden);
  if (hidden) set.add(itemLabel);
  else set.delete(itemLabel);
  prefs.hidden = [...set];
  savePrefs(prefs);
}

export function resetSidebarPrefs(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}
