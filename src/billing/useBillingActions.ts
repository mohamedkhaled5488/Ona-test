// Subscribe / restore wired to the real stores and server.
import { useMemo } from 'react';
import { deviceRegion } from '../config/about';
import { useAccountStore } from '../store/useAccountStore';
import { useAuthStore } from '../store/useAuthStore';
import { useEntitlementStore } from '../store/useEntitlementStore';
import { computeEntitlement } from '../utils/entitlement';
import { refreshEntitlement } from '../utils/entitlementSync';
import { supabaseEntitlementServer } from '../utils/entitlementBootstrap';
import { track } from '../utils/analytics';
import { getBillingClient } from './billingClient';
import { runPurchase, runRestore, type FlowDeps } from './purchaseFlow';
import type { BillingPackage } from './types';

export function billingDeps(): FlowDeps {
  const userId = () => useAuthStore.getState().session?.user.id;
  return {
    client: getBillingClient(),
    track,
    refreshEntitlement: async () => {
      const id = userId();
      if (id) await refreshEntitlement(id, supabaseEntitlementServer);
    },
    hasAccess: () => {
      const id = userId();
      return !!id && computeEntitlement(useEntitlementStore.getState().snapshots[id], Date.now()).syncAccess;
    },
    setPending: (p) => useAccountStore.getState().setPendingPurchase(p),
    country: deviceRegion(),
    now: Date.now,
  };
}

export function useBillingActions() {
  return useMemo(
    () => ({
      purchase: (pkg: BillingPackage) => runPurchase(pkg, billingDeps()),
      restore: () => runRestore(billingDeps()),
      selectPlan: (pkg: BillingPackage) => track('plan_selected', { planId: pkg.role, country: deviceRegion() }),
    }),
    []
  );
}
