import { useState } from 'react';
import { useUiStore } from '../app/store/uiStore';
import { useUnsavedChangesStore } from '../app/store/unsavedChangesStore';
import { Modal } from './Modal';
import { buttonClass } from './Button';

/** Rendered once at the app root, alongside CloseConfirmModal. That component only guards actual
 * window-close — clicking a sidebar/menu link to switch pages went completely unguarded, silently
 * discarding whatever was mid-entry on the current screen (e.g. an in-progress Journal Entry, or
 * Bank Import's parsed rows) the instant the page unmounted. uiStore's setView now routes here
 * instead of switching immediately whenever the current screen is dirty. */
export function NavigationConfirmModal() {
  const pendingView = useUiStore((s) => s.pendingView);
  const confirmNavigation = useUiStore((s) => s.confirmNavigation);
  const cancelNavigation = useUiStore((s) => s.cancelNavigation);
  const label = useUnsavedChangesStore((s) => s.label) ?? 'entry';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleCancel() {
    setError(null);
    cancelNavigation();
  }

  async function handleSaveAndLeave() {
    const { saveHandler, markClean } = useUnsavedChangesStore.getState();
    setBusy(true);
    setError(null);
    const result = saveHandler ? await saveHandler() : true;
    setBusy(false);
    if (result !== true) {
      setError(typeof result === 'string' ? result : 'Could not save — check the form for errors, then try again.');
      return;
    }
    markClean();
    confirmNavigation();
  }

  function handleDiscardAndLeave() {
    useUnsavedChangesStore.getState().markClean();
    confirmNavigation();
  }

  return (
    <Modal open={pendingView !== null} onClose={handleCancel} title="Unsaved Changes">
      <p className="text-sm text-gray-700">You have an unsaved {label} on this screen. Save it before leaving, discard it, or stay here?</p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={handleCancel}
          className={buttonClass('secondary')}
        >
          Stay Here
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={handleDiscardAndLeave}
          className={buttonClass('danger')}
        >
          Discard &amp; Leave
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={handleSaveAndLeave}
          className={buttonClass('primary')}
        >
          {busy ? 'Saving…' : 'Save & Leave'}
        </button>
      </div>
    </Modal>
  );
}
