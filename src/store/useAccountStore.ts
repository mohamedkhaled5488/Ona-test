// Sync and billing bookkeeping kept on the device. The trial and
// subscription are not here: the server owns them, and useEntitlementStore
// caches its answer. Not settings — those live in useSettingsStore. Signing
// out never touches this or any local data.
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { EntitlementState } from '../utils/entitlement';

interface AccountState {
  lastSyncedAt?: string;
  syncPaused: boolean;
  // When the plans sheet was last closed, for the 7-day quiet period.
  paywallDismissedAt?: number;
  // A purchase Google Play is still holding. Never grants access by itself.
  pendingPurchase: { productId: string; at: number } | null;
  // Trial / plan notices already dismissed (each shows once).
  dismissedNotices: string[];
  // Developer tools only: pretend to be in this state.
  devForcedEntitlement?: EntitlementState;

  setSyncPaused: (paused: boolean) => void;
  markSynced: (at: string) => void;
  markPaywallDismissed: (at: number) => void;
  setPendingPurchase: (pending: { productId: string; at: number } | null) => void;
  dismissNotice: (key: string) => void;
  setDevForcedEntitlement: (state: EntitlementState | undefined) => void;
}

export const useAccountStore = create<AccountState>()(
  persist(
    (set) => ({
      syncPaused: false,
      pendingPurchase: null,
      dismissedNotices: [],

      setSyncPaused: (syncPaused) => set({ syncPaused }),
      markSynced: (lastSyncedAt) => set({ lastSyncedAt }),
      markPaywallDismissed: (paywallDismissedAt) => set({ paywallDismissedAt }),
      setPendingPurchase: (pendingPurchase) => set({ pendingPurchase }),
      dismissNotice: (key) => set((s) => ({ dismissedNotices: s.dismissedNotices.includes(key) ? s.dismissedNotices : [...s.dismissedNotices, key] })),
      setDevForcedEntitlement: (devForcedEntitlement) => set({ devForcedEntitlement }),
    }),
    {
      name: 'ona.account',
      // v2: trial and subscription moved to the server (useEntitlementStore).
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      migrate: (persisted) => {
        const { lastSyncedAt, syncPaused } = (persisted ?? {}) as { lastSyncedAt?: string; syncPaused?: boolean };
        return { lastSyncedAt, syncPaused: !!syncPaused, pendingPurchase: null, dismissedNotices: [] } as unknown as AccountState;
      },
      partialize: ({ lastSyncedAt, syncPaused, paywallDismissedAt, pendingPurchase, dismissedNotices, devForcedEntitlement }) => ({
        lastSyncedAt,
        syncPaused,
        paywallDismissedAt,
        pendingPurchase,
        dismissedNotices,
        devForcedEntitlement,
      }),
    }
  )
);
