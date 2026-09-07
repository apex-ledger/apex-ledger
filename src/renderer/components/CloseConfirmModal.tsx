import { useEffect, useState } from 'react';
import { useUnsavedChangesStore } from '../app/store/unsavedChangesStore';
import { Modal } from './Modal';
import { buttonClass } from './Button';

/** Rendered once at the app root. When the main process is about to close this window (X button,
 * or quitting the app), it asks first — if the currently open form has unsaved entry data, the
 * user gets a Save or Cancel choice instead of losing it silently. */
export function CloseConfirmModal() {
  const [responseChannel, setResponseChannel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return window.api.events.onRequestClose(({ responseChannel: channel }) => {
      const { isDirty } = useUnsavedChangesStore.getState();
      if (!isDirty) {
        window.api.window.respondClose(channel, 'close');
        return;
      }
      setError(null);
      setResponseChannel(channel);
    });
  }, []);

  function handleCancel() {
    if (responseChannel) window.api.window.respondClose(responseChannel, 'cancel');
    setResponseChannel(null);
  }

  async function handleSave() {
    const { saveHandler } = useUnsavedChangesStore.getState();
    if (!responseChannel || !saveHandler) return;
    setBusy(true);
    setError(null);
    const succeeded = await saveHandler();
    setBusy(false);
    if (!succeeded) {
      setError('Could not save — check the form for errors, then try again.');
      return;
    }
    useUnsavedChangesStore.getState().markClean();
    window.api.window.respondClose(responseChannel, 'close');
    setResponseChannel(null);
  }

  const label = useUnsavedChangesStore((s) => s.label) ?? 'entry';

  return (
    <Modal open={responseChannel !== null} onClose={handleCancel} title="Unsaved Changes">
      <p className="text-sm text-gray-700">
        You have an unsaved {label} on this screen. Save it before closing, or cancel and keep working?
      </p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={handleCancel}
          className={buttonClass('secondary')}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={handleSave}
          className={buttonClass('primary')}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  );
}
