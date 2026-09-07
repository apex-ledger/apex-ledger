import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

/** Test setup for the renderer.
 *
 * The renderer talks to the main process through `window.api`, which is injected by Electron's
 * preload script and simply does not exist under jsdom. Every screen would throw on its first data
 * call without a stand-in. That absence is precisely why this app had no component tests and why
 * three UI defects reached the user before anyone noticed them.
 *
 * The stub answers every call with an empty success by default, so a component renders its empty
 * state rather than exploding. A test that cares about real data overrides the specific call it
 * needs with `mockApi`, and only that one.
 */

/** This file is the setup for EVERY test, not only the renderer ones — vitest has no per-glob
 * setup. The domain and main-process tests run in plain node where `window` does not exist, so
 * everything below has to be a no-op there rather than throwing on import and taking 700 passing
 * tests down with it. */
const isDom = typeof globalThis.window !== 'undefined';

afterEach(() => {
  if (isDom) cleanup();
  vi.restoreAllMocks();
});

/** An IPC call that succeeded with nothing in it. Matches the Result shape the preload returns. */
const emptyOk = () => Promise.resolve({ ok: true as const, data: [] as never });

/** Builds an object that answers ANY property access with a function returning empty success.
 *
 * A hand-written stub of the real API would need updating every time a handler is added, and would
 * be wrong the moment somebody forgot. This cannot fall out of date. */
function permissiveNamespace(): unknown {
  return new Proxy(
    {},
    {
      get(target, property) {
        if (property === 'then') return undefined; // never look like a promise
        if (!(property in target)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (target as any)[property] = vi.fn(emptyOk);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (target as any)[property];
      },
    },
  );
}

function permissiveApi(): unknown {
  return new Proxy(
    {},
    {
      get(target, property) {
        if (property === 'then') return undefined;
        if (!(property in target)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (target as any)[property] = permissiveNamespace();
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (target as any)[property];
      },
    },
  );
}

if (isDom) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window.api = permissiveApi();
}

/** Replaces one IPC call for one test: `mockApi('accounts', 'list', [ ... ])`.
 *
 * Takes the data, not a Result, because every test would otherwise repeat the `{ ok: true }`
 * wrapper and one of them would eventually get it wrong. Pass `{ ok: false, error }` explicitly to
 * test a failure path. */
export function mockApi(namespace: string, method: string, data: unknown): void {
  if (!isDom) throw new Error('mockApi is only usable in a jsdom test.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = (globalThis as any).window.api;
  const result =
    data && typeof data === 'object' && 'ok' in (data as object) ? data : { ok: true as const, data };
  api[namespace][method] = vi.fn(() => Promise.resolve(result));
}

/** jsdom implements neither of these, and a component that calls one would fail for a reason that
 * has nothing to do with what is being tested. */
if (isDom) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window.scrollTo = vi.fn();
  if (!('clipboard' in navigator)) {
    // configurable, so a test can spy on or replace it. Without that, any test that wants to read
    // what was copied fails with "Cannot redefine property".
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(() => Promise.resolve()) },
      configurable: true,
      writable: true,
    });
  }
}
