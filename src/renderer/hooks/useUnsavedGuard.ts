import { useCallback, useEffect, useRef } from 'react';
import { useUnsavedChangesStore, type SaveHandler } from '../app/store/unsavedChangesStore';

/** Lets a form register itself as "has unsaved changes" for the app-wide close guard, without the
 * form having to worry about stale closures — saveHandler is read through a ref, so `markDirty()`
 * always calls whatever the form's latest save logic is. Clears itself on unmount so navigating
 * away in-app (not the same as closing the window) doesn't leave a stale prompt armed. */
export function useUnsavedGuard(label: string, saveHandler: SaveHandler) {
  const saveHandlerRef = useRef(saveHandler);
  saveHandlerRef.current = saveHandler;

  const markDirty = useCallback(() => {
    useUnsavedChangesStore.getState().markDirty(label, () => saveHandlerRef.current());
  }, [label]);

  const markClean = useCallback(() => {
    const store = useUnsavedChangesStore.getState();
    if (store.label === label) store.markClean();
  }, [label]);

  useEffect(() => {
    return () => {
      const store = useUnsavedChangesStore.getState();
      if (store.label === label) store.markClean();
    };
  }, [label]);

  return { markDirty, markClean };
}
