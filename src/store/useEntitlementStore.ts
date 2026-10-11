// The last known entitlement for each account, cached on the device so Ona
// knows the plan state while offline. A failed refresh keeps the cache; it
// never clears it, and it never affects local data.
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { EntitlementSnapshot, EntitlementState } from '../utils/entitlement';

export interface EntitlementCacheState {
  snapshots: Record<string, EntitlementSnapshot>; // by user id
  // Accounts this device has already asked the server to start a trial for.
  // The server keeps one trial per account regardless; this just avoids
  // asking again on every launch.
  trialRequested: Record<string, true>;
  // The last state seen per account, to notice "trial just ended" once.
  lastState: Record<string, EntitlementState>;
  loading: boolean; // not persisted
  lastError: string | null; // not persisted

  saveSnapshot: (snapshot: EntitlementSnapshot) => void;
  markTrialRequested: (userId: string) => void;
  setLastState: (userId: string, state: EntitlementState) => void;
  setLoading: (loading: boolean) => void;
  setError: (message: string | null) => void;
  forget: (userId: string) => void;
}

export function createEntitlementStore(storage: StateStorage) {
  return create<EntitlementCacheState>()(
    persist(
      (set) => ({
        snapshots: {},
        trialRequested: {},
        lastState: {},
        loading: false,
        lastError: null,

        saveSnapshot: (snapshot) => set((s) => ({ snapshots: { ...s.snapshots, [snapshot.userId]: snapshot }, lastError: null })),
        markTrialRequested: (userId) => set((s) => ({ trialRequested: { ...s.trialRequested, [userId]: true } })),
        setLastState: (userId, state) => set((s) => ({ lastState: { ...s.lastState, [userId]: state } })),
        setLoading: (loading) => set({ loading }),
        setError: (lastError) => set({ lastError }),
        forget: (userId) =>
          set((s) => {
            const { [userId]: _a, ...snapshots } = s.snapshots;
            const { [userId]: _b, ...trialRequested } = s.trialRequested;
            const { [userId]: _c, ...lastState } = s.lastState;
            return { snapshots, trialRequested, lastState };
          }),
      }),
      {
        name: 'ona.entitlement',
        version: 1,
        storage: createJSONStorage(() => storage),
        partialize: ({ snapshots, trialRequested, lastState }) => ({ snapshots, trialRequested, lastState }),
      }
    )
  );
}

export const useEntitlementStore = createEntitlementStore(AsyncStorage);
