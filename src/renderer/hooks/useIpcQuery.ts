import { useCallback, useEffect, useState } from 'react';
import type { Result } from '@shared/domain/types';
import { useDataChangeStore } from '../app/store/dataChangeStore';

interface QueryState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

interface QueryOptions {
  /** Set to false for a query whose result seeds editable form fields (e.g. Company Settings) —
   * auto-refetching on an unrelated write elsewhere would silently overwrite what the user is
   * mid-typing. Defaults to true, which is correct for the common case: read-only lists, dropdown
   * options, dashboards, and reports that should always show the latest data. */
  liveRefresh?: boolean;
}

/** Thin wrapper over an IPC call: re-runs on mount/dep change, never caches across screens. Also
 * re-runs whenever any window (including a mirror window on a second screen) writes data, so
 * list/report views stay live without the user having to navigate away and back. */
export function useIpcQuery<T>(fn: () => Promise<Result<T>>, deps: unknown[], options?: QueryOptions): QueryState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const liveRefresh = options?.liveRefresh ?? true;
  const dataVersion = useDataChangeStore((s) => s.version);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fn()
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setData(result.data);
        else setError(result.error);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // deps are provided by the caller; fn is expected to be stable enough for this use case
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, ...(liveRefresh ? [dataVersion] : [])]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data, error, loading, reload };
}
