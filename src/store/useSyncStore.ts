// Sync bookkeeping on this phone: which account the data belongs to, where the
// last pull stopped, and fingerprints of what the server has. Plus the
// current status for the Account screen.
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EMPTY_SYNC_STATE, type SyncState } from '../sync/engine';

export type SyncStatus = 'idle' | 'syncing' | 'error';

interface SyncStoreState extends SyncState {
  status: SyncStatus; // not persisted
  lastError: string | null; // not persisted
  setSyncState: (s: SyncState) => void;
  setStatus: (status: SyncStatus, error?: string | null) => void;
  // Forget what the server has (the next sync compares everything afresh).
  reset: (keepOwner?: boolean) => void;
}

export const useSyncStore = create<SyncStoreState>()(
  persist(
    (set, get) => ({
      ...EMPTY_SYNC_STATE,
      status: 'idle',
      lastError: null,
      setSyncState: (s) => set({ owner: s.owner, cursor: s.cursor, fingerprints: s.fingerprints }),
      setStatus: (status, error = null) => set({ status, lastError: error }),
      reset: (keepOwner = false) => set({ ...EMPTY_SYNC_STATE, owner: keepOwner ? get().owner : null }),
    }),
    {
      name: 'ona.sync',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ owner, cursor, fingerprints }) => ({ owner, cursor, fingerprints }),
    }
  )
);
