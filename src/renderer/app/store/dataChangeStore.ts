import { create } from 'zustand';

interface DataChangeState {
  /** Bumped on every data:changed event from the main process (any window's write, including this
   * one). useIpcQuery depends on this so list/report screens refresh automatically when another
   * mirrored window makes an entry — the two screens act like two tabs on the same live data. */
  version: number;
  bump: () => void;
}

export const useDataChangeStore = create<DataChangeState>((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
}));
