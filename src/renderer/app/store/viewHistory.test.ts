import { describe, expect, it } from 'vitest';
import {
  canGoBack,
  canGoForward,
  currentView,
  emptyHistory,
  goBack,
  goForward,
  pushView,
  startHistory,
  type HistoryState,
} from './viewHistory';

const same = (a: string, b: string) => a === b;

function trail(...views: string[]): HistoryState<string> {
  return views.reduce<HistoryState<string>>((state, view) => pushView(state, view, same), emptyHistory<string>());
}

describe('moving between screens', () => {
  it('remembers where you have been', () => {
    const history = trail('dashboard', 'invoices', 'customers');
    expect(currentView(history)).toBe('customers');
    expect(history.entries).toEqual(['dashboard', 'invoices', 'customers']);
  });

  it('goes back one screen at a time', () => {
    let history = trail('dashboard', 'invoices', 'customers');
    history = goBack(history);
    expect(currentView(history)).toBe('invoices');
    history = goBack(history);
    expect(currentView(history)).toBe('dashboard');
  });

  it('goes forward again after going back', () => {
    let history = trail('dashboard', 'invoices');
    history = goForward(goBack(history));
    expect(currentView(history)).toBe('invoices');
  });
});

describe('the ends of the trail', () => {
  it('cannot go back from the first screen', () => {
    const history = trail('dashboard');
    expect(canGoBack(history)).toBe(false);
    expect(goBack(history)).toEqual(history);
  });

  it('cannot go forward from the newest screen', () => {
    const history = trail('dashboard', 'invoices');
    expect(canGoForward(history)).toBe(false);
    expect(goForward(history)).toEqual(history);
  });

  it('handles an empty trail without breaking', () => {
    const history = emptyHistory<string>();
    expect(canGoBack(history)).toBe(false);
    expect(canGoForward(history)).toBe(false);
    expect(currentView(history)).toBeUndefined();
  });
});

describe('going back and then somewhere new', () => {
  it('discards what was ahead, the way a browser does', () => {
    // Keeping it would make "forward" jump to a screen the user had already abandoned and never
    // chose again — the one behaviour everybody has an instinct about, because every browser does
    // it this way.
    let history = trail('dashboard', 'invoices', 'customers');
    history = goBack(history); // at invoices
    history = pushView(history, 'reports', same);

    expect(history.entries).toEqual(['dashboard', 'invoices', 'reports']);
    expect(canGoForward(history)).toBe(false);
  });
});

describe('revisiting the screen you are already on', () => {
  it('is not recorded as a move', () => {
    // Clicking the same sidebar item twice would otherwise bury the real previous screen one step
    // further back with every click.
    const history = trail('dashboard', 'invoices');
    const again = pushView(history, 'invoices', same);

    expect(again).toEqual(history);
    expect(currentView(goBack(again))).toBe('dashboard');
  });

  it('still records a genuine return to an earlier screen', () => {
    // Going dashboard → invoices → dashboard is three moves, and back from the last one should
    // land on invoices.
    const history = trail('dashboard', 'invoices', 'dashboard');
    expect(history.entries).toEqual(['dashboard', 'invoices', 'dashboard']);
    expect(currentView(goBack(history))).toBe('invoices');
  });
});

describe('a very long session', () => {
  it('keeps the trail bounded', () => {
    let history = emptyHistory<string>();
    for (let i = 0; i < 200; i += 1) history = pushView(history, `screen-${i}`, same);

    expect(history.entries.length).toBeLessThanOrEqual(50);
    expect(currentView(history)).toBe('screen-199');
  });

  it('drops the oldest screens rather than the newest', () => {
    let history = emptyHistory<string>();
    for (let i = 0; i < 200; i += 1) history = pushView(history, `screen-${i}`, same);

    expect(history.entries).toContain('screen-199');
    expect(history.entries).not.toContain('screen-0');
  });

  it('leaves the index pointing at the current screen after trimming', () => {
    let history = emptyHistory<string>();
    for (let i = 0; i < 200; i += 1) history = pushView(history, `screen-${i}`, same);

    expect(history.index).toBe(history.entries.length - 1);
    expect(currentView(history)).toBe('screen-199');
  });
});

describe('starting from one screen', () => {
  it('begins with that screen and nowhere to go', () => {
    const history = startHistory('dashboard');
    expect(currentView(history)).toBe('dashboard');
    expect(canGoBack(history)).toBe(false);
    expect(canGoForward(history)).toBe(false);
  });
});

describe('comparing screens', () => {
  it('uses the caller comparison, not identity', () => {
    // Views are objects rebuilt on every click, so two visits to the same screen are never the
    // same object. Comparing by reference would record a move every single time.
    type View = { kind: string; id?: number };
    const sameView = (a: View, b: View) => a.kind === b.kind && a.id === b.id;

    let history = startHistory<View>({ kind: 'invoices' });
    history = pushView(history, { kind: 'invoices' }, sameView);
    expect(history.entries).toHaveLength(1);

    history = pushView(history, { kind: 'invoiceEditor', id: 4 }, sameView);
    expect(history.entries).toHaveLength(2);
  });

  it('treats the same screen with a different record as a move', () => {
    type View = { kind: string; id?: number };
    const sameView = (a: View, b: View) => a.kind === b.kind && a.id === b.id;

    let history = startHistory<View>({ kind: 'invoiceEditor', id: 1 });
    history = pushView(history, { kind: 'invoiceEditor', id: 2 }, sameView);

    expect(history.entries).toHaveLength(2);
    expect(currentView(goBack(history))).toEqual({ kind: 'invoiceEditor', id: 1 });
  });
});
