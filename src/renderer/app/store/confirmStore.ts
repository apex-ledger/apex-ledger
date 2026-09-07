import { create } from 'zustand';

interface ConfirmState {
  open: boolean;
  message: string;
  resolve: ((value: boolean) => void) | null;
}

/** Backs a single app-wide in-app confirm dialog (see ConfirmModalHost), replacing every
 * window.confirm() call in the renderer. Electron's native confirm() dialog reliably leaves the
 * window's click hit-testing stuck after it closes — the next click on the page silently does
 * nothing until the user clicks somewhere else first — so an in-app React modal is used instead;
 * it never touches the native dialog and can't trigger that focus loss. */
export const useConfirmStore = create<ConfirmState>(() => ({
  open: false,
  message: '',
  resolve: null,
}));

export function confirmDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirmStore.setState({ open: true, message, resolve });
  });
}

export function resolveConfirmDialog(value: boolean) {
  const { resolve } = useConfirmStore.getState();
  useConfirmStore.setState({ open: false, message: '', resolve: null });
  resolve?.(value);
}
