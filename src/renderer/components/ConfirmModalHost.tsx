import { useConfirmStore, resolveConfirmDialog } from '../app/store/confirmStore';
import { Modal } from './Modal';
import { buttonClass } from './Button';

/** Rendered once at the app root — the shared dialog every confirmDialog() call opens. See
 * confirmStore.ts for why this replaces window.confirm() app-wide. */
export function ConfirmModalHost() {
  const open = useConfirmStore((s) => s.open);
  const message = useConfirmStore((s) => s.message);

  return (
    <Modal open={open} onClose={() => resolveConfirmDialog(false)} title="Confirm">
      <p className="whitespace-pre-line text-sm text-gray-700">{message}</p>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => resolveConfirmDialog(false)}
          className={buttonClass('secondary')}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => resolveConfirmDialog(true)}
          className={buttonClass('primary')}
        >
          OK
        </button>
      </div>
    </Modal>
  );
}
