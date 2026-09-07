import type { CategoryRule } from '../types';

/**
 * Suggests a category rule for a transaction description, case-insensitively matching every word
 * of the rule's pattern against the description independently — not one exact contiguous phrase.
 * A two-word pattern like "ONLINE TRANSFER" used to require the description to contain "online
 * transfer" as an unbroken phrase in that exact order; a real bank export saying "Transfer -
 * Online Banking" or "Online Banking Transfer to Savings" has the same words but not adjacent,
 * and silently never matched. Requiring each word to appear somewhere (any order, not necessarily
 * adjacent) is far more forgiving of real-world wording differences while still needing every
 * word present, so a single generic word can't misfire on its own.
 * When multiple rules match, prefers higher `priority`, then the longer (more specific) pattern.
 * Never guesses when nothing matches — callers should fall back to an "Other"/uncategorized state.
 */
export function suggestCategory(description: string, rules: CategoryRule[]): CategoryRule | null {
  const desc = description.toUpperCase();
  const matches = rules.filter((r) => {
    if (!r.isActive) return false;
    const words = r.pattern.trim().toUpperCase().split(/\s+/).filter((w) => w.length > 0);
    return words.length > 0 && words.every((w) => desc.includes(w));
  });
  if (matches.length === 0) return null;
  matches.sort((a, b) => b.priority - a.priority || b.pattern.length - a.pattern.length);
  return matches[0];
}
