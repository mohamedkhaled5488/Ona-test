// Wires the entitlement cache to the real account server (Supabase) and keeps
// it fresh: on sign-in, and whenever Ona comes back to the foreground (which
// is also when a lost connection usually comes back).
import { AppState } from 'react-native';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import type { RawEntitlement } from './entitlement';
import { refreshEntitlement, type EntitlementServer } from './entitlementSync';
import { computeEntitlement } from './entitlement';
import { useEntitlementStore } from '../store/useEntitlementStore';
import { useAccountStore } from '../store/useAccountStore';

export const supabaseEntitlementServer: EntitlementServer = {
  startTrial: async () => {
    const { data, error } = await supabase.rpc('start_trial');
    if (error) throw new Error(error.message);
    return data as RawEntitlement;
  },
  getEntitlement: async () => {
    const { data, error } = await supabase.rpc('get_entitlement');
    if (error) throw new Error(error.message);
    return data as RawEntitlement;
  },
};

function refreshNow() {
  const userId = useAuthStore.getState().session?.user.id;
  if (!userId || !isSupabaseConfigured || useSettingsStore.getState().devSimulateOffline) return;
  void refreshEntitlement(userId, supabaseEntitlementServer).then(() => {
    // A purchase Play was holding has gone through once the server says so.
    const snapshot = useEntitlementStore.getState().snapshots[userId];
    if (useAccountStore.getState().pendingPurchase && computeEntitlement(snapshot, Date.now()).syncAccess) {
      useAccountStore.getState().setPendingPurchase(null);
    }
  });
}

// Call once at startup.
export function startEntitlementSync(): () => void {
  refreshNow();
  const unsubAuth = useAuthStore.subscribe((s, prev) => {
    if (s.session?.user.id !== prev.session?.user.id) refreshNow();
  });
  const sub = AppState.addEventListener('change', (state) => state === 'active' && refreshNow());
  return () => {
    unsubAuth();
    sub.remove();
  };
}
