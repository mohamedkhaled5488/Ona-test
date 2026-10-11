// The billing client the app uses. Until the RevenueCat SDK is added and
// configured (docs/billing-setup-checklist.md), there is no store: release
// builds say plans aren't available, and debug builds preview a mocked
// offering so the screen can be built and tested. Swapping in RevenueCat
// means implementing BillingClient with react-native-purchases here; no
// screen changes.
import { deviceRegion } from '../config/about';
import { mapOffering } from './offering';
import { sampleCurrencyFor, sampleOffering } from './mockOffering';
import type { BillingClient } from './types';

const unavailable: BillingClient = {
  available: false,
  getOffering: async () => null,
  purchase: async () => ({ kind: 'failed', message: "Purchases aren't available in this version yet." }),
  restore: async () => ({ kind: 'failed', message: "Purchases aren't available in this version yet." }),
};

// Debug builds only. Purchases never succeed here: access only ever comes
// from the server, so the preview can't fake a subscription.
const preview: BillingClient = {
  available: true,
  getOffering: async () => mapOffering(sampleOffering(sampleCurrencyFor(deviceRegion()))),
  purchase: async () => ({ kind: 'failed', message: 'This is a preview with sample prices. Purchases are switched off.' }),
  restore: async () => ({ kind: 'nothingToRestore' }),
};

export function getBillingClient(): BillingClient {
  return __DEV__ ? preview : unavailable;
}
