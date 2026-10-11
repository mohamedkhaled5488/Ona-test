// DEVELOPMENT AND TESTS ONLY. Stand-ins for what the store returns, so the
// Plan & usage screen can be built and tested before RevenueCat is connected.
// These are not Ona's prices: real prices only ever come from the store
// (Play Console / RevenueCat), per country. Never imported by release code.
import type { RcOffering, RcPackage } from './offering';

type Sample = { monthly: [number, string]; annual: [number, string]; lifetime: [number, string]; founders: [number, string] };

// What the store might answer in a few currencies (formatted the way Google
// Play formats them for that locale).
export const SAMPLE_STORE_PRICES: Record<'USD' | 'EUR' | 'EGP' | 'GBP', Sample> = {
  USD: { monthly: [3.99, '$3.99'], annual: [24.99, '$24.99'], lifetime: [79, '$79.00'], founders: [17.99, '$17.99'] },
  EUR: { monthly: [3.99, '3,99 €'], annual: [24.99, '24,99 €'], lifetime: [79, '79,00 €'], founders: [17.99, '17,99 €'] },
  EGP: { monthly: [99.99, 'EGP 99.99'], annual: [599.99, 'EGP 599.99'], lifetime: [1999.99, 'EGP 1,999.99'], founders: [449.99, 'EGP 449.99'] },
  GBP: { monthly: [3.49, '£3.49'], annual: [21.99, '£21.99'], lifetime: [69.99, '£69.99'], founders: [15.99, '£15.99'] },
};

export function sampleOffering(currency: keyof typeof SAMPLE_STORE_PRICES = 'USD', include: { lifetime?: boolean; founders?: boolean } = { lifetime: true, founders: true }): RcOffering {
  const p = SAMPLE_STORE_PRICES[currency];
  const pkg = (identifier: string, packageType: string, productId: string, [price, priceString]: [number, string], period: string | null): RcPackage => ({
    identifier,
    packageType,
    product: { identifier: productId, price, priceString, currencyCode: currency, subscriptionPeriod: period },
  });
  const packages = [pkg('$rc_monthly', 'MONTHLY', 'ona_sync:monthly', p.monthly, 'P1M'), pkg('$rc_annual', 'ANNUAL', 'ona_sync:annual', p.annual, 'P1Y')];
  if (include.lifetime) packages.push(pkg('$rc_lifetime', 'LIFETIME', 'ona_lifetime', p.lifetime, null));
  if (include.founders) packages.push(pkg('annual_founders', 'CUSTOM', 'ona_sync:annual_founders', p.founders, 'P1Y'));
  return { identifier: 'default', availablePackages: packages };
}

// Which sample currency to preview with, from the device region.
export function sampleCurrencyFor(region: string | undefined): keyof typeof SAMPLE_STORE_PRICES {
  if (region === 'EG') return 'EGP';
  if (region === 'GB') return 'GBP';
  if (region && ['DE', 'FR', 'ES', 'IT', 'NL', 'IE', 'BE', 'AT', 'PT', 'FI', 'GR'].includes(region)) return 'EUR';
  return 'USD';
}
