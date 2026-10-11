// Turning a RevenueCat Offering into Ona's plan cards. Pure functions, so
// every rule (what's shown, what's preselected, the "Save X%" badge, the fine
// print) is tested without a store.
import type { BillingOffering, BillingPackage, PlanRole } from './types';

// --- From RevenueCat ---------------------------------------------------------
// The subset of react-native-purchases' PurchasesOffering we read.
export interface RcProduct {
  identifier: string;
  priceString: string;
  price: number;
  currencyCode: string;
  subscriptionPeriod?: string | null; // ISO 8601, e.g. "P1M", "P1Y"
  pricePerMonthString?: string | null;
}
export interface RcPackage {
  identifier: string;
  packageType: 'MONTHLY' | 'ANNUAL' | 'LIFETIME' | 'CUSTOM' | string;
  product: RcProduct;
}
export interface RcOffering {
  identifier: string;
  availablePackages: RcPackage[];
}

// Package ids from the dashboard (docs/billing-setup-checklist.md).
export const FOUNDERS_PACKAGE_ID = 'annual_founders';

function roleOf(pkg: RcPackage): PlanRole | null {
  if (pkg.identifier === FOUNDERS_PACKAGE_ID) return 'founders';
  if (pkg.packageType === 'MONTHLY') return 'monthly';
  if (pkg.packageType === 'ANNUAL') return 'annual';
  if (pkg.packageType === 'LIFETIME') return 'lifetime';
  return null;
}

function periodOf(p: RcProduct): BillingPackage['period'] {
  if (p.subscriptionPeriod === 'P1M') return 'P1M';
  if (p.subscriptionPeriod === 'P1Y' || p.subscriptionPeriod === 'P12M') return 'P1Y';
  return null;
}

export function mapOffering(rc: RcOffering | null | undefined): BillingOffering | null {
  if (!rc) return null;
  const packages: BillingPackage[] = [];
  for (const pkg of rc.availablePackages) {
    const role = roleOf(pkg);
    if (!role) continue;
    packages.push({
      role,
      packageId: pkg.identifier,
      productId: pkg.product.identifier,
      priceString: pkg.product.priceString,
      price: pkg.product.price,
      currencyCode: pkg.product.currencyCode,
      period: role === 'lifetime' ? null : periodOf(pkg.product),
      pricePerMonthString: pkg.product.pricePerMonthString ?? undefined,
    });
  }
  return { identifier: rc.identifier, packages };
}

// --- Pricing maths -----------------------------------------------------------

// "Save X%" for annual against twelve months of monthly, from the user's own
// store prices. null whenever it can't be computed honestly: a missing price,
// different currencies, or no real saving.
export function annualSavingsPercent(monthly: BillingPackage | undefined, annual: BillingPackage | undefined): number | null {
  if (!monthly || !annual) return null;
  if (monthly.currencyCode !== annual.currencyCode) return null;
  if (!(monthly.price > 0) || !(annual.price > 0)) return null;
  const percent = Math.floor((1 - annual.price / (monthly.price * 12)) * 100);
  return percent >= 1 ? percent : null;
}

// The annual price per month, in small text under the annual card. Uses the
// store's own string when it gives one; otherwise formats the store price
// divided by twelve in the store's currency.
export function monthlyEquivalent(annual: BillingPackage | undefined, locale?: string): string | null {
  if (!annual || annual.period !== 'P1Y' || !(annual.price > 0)) return null;
  if (annual.pricePerMonthString) return annual.pricePerMonthString;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: annual.currencyCode }).format(Math.floor((annual.price / 12) * 100) / 100);
  } catch {
    return null;
  }
}

// --- Plan cards --------------------------------------------------------------
export interface PlanFlags {
  lifetimeEnabled: boolean;
  foundersEnabled: boolean;
}

export interface PlanCard {
  pkg: BillingPackage;
  title: string;
  priceLine: string; // the store price string plus its period
  note?: string; // small text: monthly equivalent, founders promise, one-time
  badge?: string; // "Best value", plus a computed saving when there is one
  highlighted: boolean;
}

const PERIOD_WORD = { P1M: 'month', P1Y: 'year' } as const;

// Order: founders (when offered), annual, monthly, lifetime.
export function buildPlanCards(offering: BillingOffering | null, flags: PlanFlags, locale?: string): { cards: PlanCard[]; defaultRole: PlanRole | null } {
  if (!offering) return { cards: [], defaultRole: null };
  const find = (role: PlanRole) => offering.packages.find((p) => p.role === role);
  const monthly = find('monthly');
  const annual = find('annual');
  const lifetime = flags.lifetimeEnabled ? find('lifetime') : undefined;
  const founders = flags.foundersEnabled ? find('founders') : undefined;
  const save = annualSavingsPercent(monthly, annual);
  const perMonth = monthlyEquivalent(annual, locale);

  const cards: PlanCard[] = [];
  if (founders) {
    cards.push({
      pkg: founders,
      title: 'Founders annual',
      priceLine: founders.period ? `${founders.priceString} / ${PERIOD_WORD[founders.period]}` : founders.priceString,
      note: 'Early supporter price. You keep this price while your subscription stays active.',
      highlighted: false,
    });
  }
  if (annual) {
    cards.push({
      pkg: annual,
      title: 'Annual',
      priceLine: `${annual.priceString} / year`,
      note: perMonth ? `About ${perMonth} a month` : undefined,
      badge: save !== null ? `Best value · Save ${save}%` : 'Best value',
      highlighted: true,
    });
  }
  if (monthly) cards.push({ pkg: monthly, title: 'Monthly', priceLine: `${monthly.priceString} / month`, highlighted: false });
  if (lifetime) cards.push({ pkg: lifetime, title: 'Lifetime', priceLine: lifetime.priceString, note: 'Pay once. No renewals.', highlighted: false });

  const defaultRole: PlanRole | null = annual ? 'annual' : cards[0]?.pkg.role ?? null;
  return { cards, defaultRole };
}

// Always shown right under the buttons.
export function finePrint(pkg: BillingPackage | undefined): string {
  if (!pkg) return '';
  if (!pkg.period) {
    return `${pkg.priceString}, charged once through Google Play. It doesn't renew.`;
  }
  const every = pkg.period === 'P1M' ? 'month' : 'year';
  return (
    `${pkg.priceString} per ${every}, charged through Google Play. ` +
    `It renews automatically every ${every} until you cancel. ` +
    `You can cancel any time in Google Play, and you keep access until the end of the period you've paid for.`
  );
}
