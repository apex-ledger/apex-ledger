/** Back and forward through screens, the way a browser does it.
 *
 * Kept as plain data with no store around it, because the awkward parts are all in the bookkeeping:
 * going back then somewhere new has to discard what was ahead, revisiting the same screen must not
 * stack duplicates, and the trail cannot grow without limit over a long session. Those are much
 * easier to get right — and to prove right — outside a component.
 */

export interface HistoryState<T> {
  /** Screens visited, oldest first. */
  entries: T[];
  /** Where in `entries` the current screen sits. -1 only when the trail is empty. */
  index: number;
}

/** How many screens back you can go.
 *
 * Long enough to cover any real session of clicking around, short enough that the trail cannot grow
 * without bound while the app is left open for a week. */
const MAX_ENTRIES = 50;

export function emptyHistory<T>(): HistoryState<T> {
  return { entries: [], index: -1 };
}

export function startHistory<T>(view: T): HistoryState<T> {
  return { entries: [view], index: 0 };
}

/**
 * Records a move to a new screen.
 *
 * Anything ahead of the current position is discarded, exactly as a browser does: once you go back
 * and then somewhere new, the trail you had abandoned is no longer reachable, and keeping it would
 * make "forward" jump somewhere the user never chose.
 */
export function pushView<T>(state: HistoryState<T>, view: T, isSame: (a: T, b: T) => boolean): HistoryState<T> {
  const current = state.entries[state.index];

  // Re-selecting the screen you are already on is not a move. Without this, clicking the same
  // sidebar item twice buries the real previous screen one step further back each time.
  if (current !== undefined && isSame(current, view)) return state;

  const kept = state.entries.slice(0, state.index + 1);
  const entries = [...kept, view];

  // Trimmed from the front, so the oldest screen is the one lost rather than the newest.
  const overflow = Math.max(0, entries.length - MAX_ENTRIES);
  const trimmed = entries.slice(overflow);

  return { entries: trimmed, index: trimmed.length - 1 };
}

export function canGoBack<T>(state: HistoryState<T>): boolean {
  return state.index > 0;
}

export function canGoForward<T>(state: HistoryState<T>): boolean {
  return state.index >= 0 && state.index < state.entries.length - 1;
}

/** Steps back one screen, or returns the state untouched when there is nowhere to go. */
export function goBack<T>(state: HistoryState<T>): HistoryState<T> {
  return canGoBack(state) ? { ...state, index: state.index - 1 } : state;
}

export function goForward<T>(state: HistoryState<T>): HistoryState<T> {
  return canGoForward(state) ? { ...state, index: state.index + 1 } : state;
}

/** The screen currently shown, or undefined on an empty trail. */
export function currentView<T>(state: HistoryState<T>): T | undefined {
  return state.entries[state.index];
}
