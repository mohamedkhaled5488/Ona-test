import { useEffect, useState } from 'react';
import { getBillingClient } from './billingClient';
import type { BillingOffering } from './types';

export interface OfferingState {
  loading: boolean;
  offering: BillingOffering | null;
  available: boolean; // a store is configured for this build
  error: string | null;
}

// The current Offering, read live from the store every time the plan list is
// opened, so a price change in Play Console / RevenueCat shows without a new build.
export function useOffering(): OfferingState {
  const [state, setState] = useState<OfferingState>({ loading: true, offering: null, available: getBillingClient().available, error: null });
  useEffect(() => {
    let alive = true;
    const client = getBillingClient();
    client
      .getOffering()
      .then((offering) => alive && setState({ loading: false, offering, available: client.available, error: null }))
      .catch((e) => alive && setState({ loading: false, offering: null, available: client.available, error: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
