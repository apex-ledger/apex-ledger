import { create } from 'zustand';

// A resolved string means "failed, and here's why" — shown verbatim in the Unsaved Changes
// prompt instead of its generic fallback message, so a save failure (e.g. a still-missing
// required field) tells the user what to fix rather than just "check the form for errors."
export type SaveHandler = () => Promise<boolean | string>;

interface UnsavedChangesState {
  isDirty: boolean;
  saveHandler: SaveHandler | null;
  /** Called by whichever entry form currently has unsaved fields; label shows in the close prompt
   * (e.g. "Journal Entry", "Quick Entry") so the user knows what they'd be saving or discarding. */
  label: string | null;
  markDirty: (label: string, saveHandler: SaveHandler) => void;
  markClean: () => void;
}

export const useUnsavedChangesStore = create<UnsavedChangesState>((set) => ({
  isDirty: false,
  saveHandler: null,
  label: null,
  markDirty: (label, saveHandler) => set({ isDirty: true, label, saveHandler }),
  markClean: () => set({ isDirty: false, label: null, saveHandler: null }),
}));
