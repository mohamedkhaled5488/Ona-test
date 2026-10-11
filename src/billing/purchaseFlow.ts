// Subscribe and restore, end to end. The store result never grants sync on
// its own: after a purchase or restore the app asks the server again (the
// RevenueCat webhook is the source of truth), and only that answer counts.
import type { BillingClient, BillingPackage } from './types';
import { purchaseMessage, restoreMessage } from './paywall';
import { isDemo } from '../utils/dataSpace';

export interface FlowDeps {
  client: BillingClient;
  track: (name: string, props?: Record<string, unknown>) => void;
  refreshEntitlement: () => Promise<unknown>; // re-ask the server
  hasAccess: () => boolean; // after refreshing
  setPending: (pending: { productId: string; at: number } | null) => void;
  country: string | undefined;
  now: () => number;
}

export const DEMO_PURCHASE_MESSAGE = "Purchases are real, so they're turned off in Demo mode. Exit the demo to subscribe.";

export async function runPurchase(pkg: BillingPackage, deps: FlowDeps): Promise<{ message: string | null; outcome: string }> {
  if (isDemo()) return { message: DEMO_PURCHASE_MESSAGE, outcome: 'demo' };
  const props = { planId: pkg.role, country: deps.country };
  deps.track('purchase_started', props);
  let result;
  try {
    result = await deps.client.purchase(pkg);
  } catch (e) {
    result = { kind: 'failed' as const, message: e instanceof Error ? e.message : String(e) };
  }
  switch (result.kind) {
    case 'purchased':
      deps.track('purchase_completed', props);
      deps.setPending(null);
      await deps.refreshEntitlement();
      return { outcome: 'purchased', message: purchaseMessage('purchased') };
    case 'pending':
      // Play can hold a purchase (e.g. paid in cash at a shop). No access yet.
      deps.setPending({ productId: pkg.productId, at: deps.now() });
      return { outcome: 'pending', message: purchaseMessage('pending') };
    case 'canceled':
      deps.track('purchase_canceled', props);
      return { outcome: 'canceled', message: purchaseMessage('canceled') };
    case 'failed':
      return { outcome: 'failed', message: purchaseMessage('failed', result.message) };
  }
}

export async function runRestore(deps: FlowDeps): Promise<string> {
  if (isDemo()) return DEMO_PURCHASE_MESSAGE;
  deps.track('restore_clicked', { country: deps.country });
  let result;
  try {
    result = await deps.client.restore();
  } catch (e) {
    result = { kind: 'failed' as const, message: e instanceof Error ? e.message : String(e) };
  }
  if (result.kind === 'restored') {
    await deps.refreshEntitlement();
    return restoreMessage('restored', deps.hasAccess());
  }
  return restoreMessage(result.kind, false, result.kind === 'failed' ? result.message : undefined);
}
