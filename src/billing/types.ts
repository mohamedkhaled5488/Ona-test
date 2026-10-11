// Billing as the app sees it. Shaped after RevenueCat's Offering/Package/
// StoreProduct, trimmed to what the Plan & usage screen needs. Every price
// here comes from the store — the app never has a price of its own.

// The role a package plays in Ona's plan list.
export type PlanRole = 'monthly' | 'annual' | 'lifetime' | 'founders';

export interface BillingPackage {
  role: PlanRole;
  packageId: string; // RevenueCat package identifier, e.g. "$rc_annual"
  productId: string; // store product id, e.g. "ona_sync:annual"
  priceString: string; // localized by the store, shown exactly as given
  price: number; // numeric price in the store currency (for computing savings)
  currencyCode: string; // ISO 4217
  period: 'P1M' | 'P1Y' | null; // null = one-time purchase
  pricePerMonthString?: string; // the store's own monthly equivalent, when given
}

export interface BillingOffering {
  identifier: string; // "default"
  packages: BillingPackage[];
}

// What happens when the user taps Subscribe. Only 'purchased' can grant
// access, and even then the server (via the webhook) is the source of truth.
export type PurchaseResult =
  | { kind: 'purchased' }
  | { kind: 'pending' } // Play can hold a purchase pending (e.g. cash payment)
  | { kind: 'canceled' } // the user closed the store sheet: say nothing alarming
  | { kind: 'failed'; message: string };

export type RestoreResult = { kind: 'restored' } | { kind: 'nothingToRestore' } | { kind: 'failed'; message: string };

export interface BillingClient {
  available: boolean; // false until a store SDK is configured for this build
  getOffering: () => Promise<BillingOffering | null>;
  purchase: (pkg: BillingPackage) => Promise<PurchaseResult>;
  restore: () => Promise<RestoreResult>;
  redeemCode?: () => Promise<void>;
}
