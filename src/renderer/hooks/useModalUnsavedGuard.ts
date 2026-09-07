import { useEffect, useRef } from 'react';
import { useUnsavedGuard } from './useUnsavedGuard';
import type { SaveHandler } from '../app/store/unsavedChangesStore';

/** Same idea as useUnsavedGuard, sized for the app's many "open/onClose + reset-on-open effect"
 * form modals (Add Employee, New Bill, Add Client, …): watchedValues should list every editable
 * field, and the hook ignores the one change-batch that happens right when the modal's own
 * reset-on-open effect populates those fields, so only the user's own edits count as dirty. */
export function useModalUnsavedGuard(label: string, open: boolean, watchedValues: unknown[], saveHandler: SaveHandler) {
  const { markDirty, markClean } = useUnsavedGuard(label, saveHandler);
  const wasOpenRef = useRef(false);
  const skipNextRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) skipNextRef.current = true;
    wasOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (skipNextRef.current) {
      skipNextRef.current = false;
      return;
    }
    markDirty();
    // watchedValues is caller-provided and intentionally spread as the dep list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, watchedValues);

  return { markClean };
}
