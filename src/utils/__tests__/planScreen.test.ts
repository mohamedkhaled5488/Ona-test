// Plan & usage: plan cards built from the store's Offering, localized prices,
// the computed "Save X%", flags, fine print, state messages, and the
// delete-account warning. Plus a scan proving no price is hardcoded.
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []) }));

import { annualSavingsPercent, buildPlanCards, finePrint, mapOffering, monthlyEquivalent, type RcOffering } from '../../billing/offering';
import { SAMPLE_STORE_PRICES, sampleOffering } from '../../billing/mockOffering';
import { deleteAccountSubscriptionWarning, showsPlanList, stateCard } from '../../billing/planState';
import type { BillingPackage } from '../../billing/types';
import { computeEntitlement, type EntitlementState } from '../entitlement';
import { forcedSnapshot } from '../../hooks/useEntitlement';

const fs = require('fs') as { readFileSync: (p: string, e: string) => string; readdirSync: (p: string, o: { withFileTypes: true }) => { name: string; isDirectory: () => boolean }[] };
const path = require('path') as { join: (...p: string[]) => string; relative: (a: string, b: string) => string };

const ALL = { lifetimeEnabled: true, foundersEnabled: true };
const NONE = { lifetimeEnabled: false, foundersEnabled: false };

describe('localized prices come from the store, as given', () => {
  test.each(['USD', 'EUR', 'EGP', 'GBP'] as const)('%s', (currency) => {
    const offering = mapOffering(sampleOffering(currency))!;
    const { cards } = buildPlanCards(offering, ALL);
    const sample = SAMPLE_STORE_PRICES[currency];
    const byRole = Object.fromEntries(cards.map((c) => [c.pkg.role, c]));
    expect(byRole.annual.priceLine).toBe(`${sample.annual[1]} / year`);
    expect(byRole.monthly.priceLine).toBe(`${sample.monthly[1]} / month`);
    expect(byRole.lifetime.priceLine).toBe(sample.lifetime[1]);
    expect(byRole.founders.priceLine).toBe(`${sample.founders[1]} / year`);
    for (const c of cards) expect(c.pkg.currencyCode).toBe(currency);
    // The fine print quotes the same store string.
    expect(finePrint(byRole.annual.pkg)).toContain(sample.annual[1]);
  });

  test('a price changed in the store shows up with no code change', () => {
    const rc = sampleOffering('USD');
    rc.availablePackages[1].product = { ...rc.availablePackages[1].product, price: 29.99, priceString: '$29.99' };
    const annual = buildPlanCards(mapOffering(rc), NONE).cards.find((c) => c.pkg.role === 'annual')!;
    expect(annual.priceLine).toBe('$29.99 / year');
  });
});

describe('"Save X%"', () => {
  const pkg = (role: 'monthly' | 'annual', price: number, currencyCode = 'USD'): BillingPackage => ({
    role,
    packageId: role,
    productId: role,
    price,
    priceString: String(price),
    currencyCode,
    period: role === 'monthly' ? 'P1M' : 'P1Y',
  });

  test('computed from the real monthly and annual prices', () => {
    expect(annualSavingsPercent(pkg('monthly', 3.99), pkg('annual', 24.99))).toBe(47); // 1 - 24.99 / 47.88
    expect(annualSavingsPercent(pkg('monthly', 99.99, 'EGP'), pkg('annual', 599.99, 'EGP'))).toBe(49);
    expect(annualSavingsPercent(pkg('monthly', 10), pkg('annual', 100))).toBe(16); // never rounds up
  });

  test.each([
    ['no monthly plan', undefined, pkg('annual', 24.99)],
    ['no annual plan', pkg('monthly', 3.99), undefined],
    ['different currencies', pkg('monthly', 3.99, 'USD'), pkg('annual', 24.99, 'EUR')],
    ['annual costs as much as twelve months', pkg('monthly', 2), pkg('annual', 24)],
    ['annual costs more', pkg('monthly', 1), pkg('annual', 20)],
    ['a zero price', pkg('monthly', 0), pkg('annual', 24.99)],
  ])('hidden when it cannot be computed: %s', (_label, monthly, annual) => {
    expect(annualSavingsPercent(monthly as BillingPackage | undefined, annual as BillingPackage | undefined)).toBeNull();
  });

  test('the badge only claims a saving it can back up', () => {
    const rc = sampleOffering('USD', {});
    const withMonthly = buildPlanCards(mapOffering(rc), NONE).cards.find((c) => c.pkg.role === 'annual')!;
    expect(withMonthly.badge).toBe('Best value · Save 47%');
    rc.availablePackages = rc.availablePackages.filter((p) => p.packageType !== 'MONTHLY');
    const alone = buildPlanCards(mapOffering(rc), NONE).cards.find((c) => c.pkg.role === 'annual')!;
    expect(alone.badge).toBe('Best value');
  });

  test('monthly equivalent: the store string when given, otherwise the store price over twelve', () => {
    const annual = mapOffering(sampleOffering('USD', {}))!.packages.find((p) => p.role === 'annual')!;
    expect(monthlyEquivalent({ ...annual, pricePerMonthString: '$2.08' })).toBe('$2.08');
    expect(monthlyEquivalent(annual, 'en-US')).toBe('$2.08');
    expect(monthlyEquivalent({ ...annual, period: 'P1M' })).toBeNull();
  });
});

describe('plan list', () => {
  test('annual is preselected and highlighted', () => {
    const { cards, defaultRole } = buildPlanCards(mapOffering(sampleOffering('USD')), NONE);
    expect(defaultRole).toBe('annual');
    expect(cards.map((c) => c.pkg.role)).toEqual(['annual', 'monthly']);
    expect(cards.filter((c) => c.highlighted).map((c) => c.pkg.role)).toEqual(['annual']);
  });

  test('lifetime and founders appear only when their flag is on and the offering has them', () => {
    const full = mapOffering(sampleOffering('USD'));
    expect(buildPlanCards(full, NONE).cards.map((c) => c.pkg.role)).toEqual(['annual', 'monthly']);
    expect(buildPlanCards(full, { lifetimeEnabled: true, foundersEnabled: false }).cards.map((c) => c.pkg.role)).toEqual(['annual', 'monthly', 'lifetime']);
    expect(buildPlanCards(full, ALL).cards.map((c) => c.pkg.role)).toEqual(['founders', 'annual', 'monthly', 'lifetime']);
    // Flags on, but the store doesn't offer them: nothing to show.
    const bare = mapOffering(sampleOffering('USD', {}));
    expect(buildPlanCards(bare, ALL).cards.map((c) => c.pkg.role)).toEqual(['annual', 'monthly']);
  });

  test('founders card carries the promise, word for word', () => {
    const founders = buildPlanCards(mapOffering(sampleOffering('USD')), ALL).cards[0];
    expect(founders.note).toBe('Early supporter price. You keep this price while your subscription stays active.');
  });

  test('unknown packages are ignored, and no offering means no cards', () => {
    const rc: RcOffering = { identifier: 'default', availablePackages: [{ identifier: 'weird', packageType: 'CUSTOM', product: { identifier: 'x', price: 1, priceString: '$1', currencyCode: 'USD' } }] };
    expect(buildPlanCards(mapOffering(rc), ALL).cards).toEqual([]);
    expect(buildPlanCards(null, ALL)).toEqual({ cards: [], defaultRole: null });
  });

  test('fine print: price, period, auto-renewal, cancel anytime, access until the end', () => {
    const { cards } = buildPlanCards(mapOffering(sampleOffering('GBP')), ALL);
    const monthly = finePrint(cards.find((c) => c.pkg.role === 'monthly')!.pkg);
    expect(monthly).toContain('£3.49 per month');
    expect(monthly).toContain('renews automatically');
    expect(monthly).toContain('cancel any time in Google Play');
    expect(monthly).toContain('keep access until the end of the period');
    const lifetime = finePrint(cards.find((c) => c.pkg.role === 'lifetime')!.pkg);
    expect(lifetime).toContain('£69.99');
    expect(lifetime).toContain("doesn't renew");
  });
});

describe('plan states', () => {
  const T = Date.parse('2026-10-08T12:00:00Z');
  const states: EntitlementState[] = ['free', 'trial', 'trialEnded', 'subscribed', 'canceledActive', 'grace', 'onHold', 'expired', 'lifetime'];
  const e = (s: EntitlementState) => computeEntitlement(forcedSnapshot(s, T), T);

  test('every state has a message; only a payment problem uses a warning tone', () => {
    for (const s of states) {
      const card = stateCard(e(s));
      expect(card.title.length).toBeGreaterThan(0);
      expect(card.lines.length).toBeGreaterThan(0);
      expect(card.tone).toBe(s === 'grace' ? 'warn' : 'calm');
    }
    expect(stateCard(e('trial')).title).toBe('Trial, 12 days left');
    expect(stateCard(e('onHold')).actionLabel).toMatch(/payment/i);
  });

  test('no guilt or pressure copy anywhere', () => {
    const text = states.flatMap((s) => [stateCard(e(s)).title, ...stateCard(e(s)).lines]).join(' ');
    expect(text).not.toMatch(/don't give up|hurry|last chance|only \d+ left|act now|missing out/i);
  });

  test('ended states always reassure that nothing was deleted', () => {
    for (const s of ['trialEnded', 'expired', 'onHold'] as const) expect(stateCard(e(s)).lines.join(' ')).toMatch(/Nothing was deleted/);
  });

  test('the plan list shows only when buying could make sense', () => {
    expect(states.filter((s) => showsPlanList(e(s)))).toEqual(['free', 'trial', 'trialEnded', 'canceledActive', 'expired']);
  });

  test('deleting the account warns when a subscription could still charge', () => {
    for (const s of states) {
      const w = deleteAccountSubscriptionWarning(e(s));
      if (s === 'subscribed' || s === 'grace' || s === 'onHold') expect(w).toMatch(/doesn't cancel your subscription/);
      else expect(w).toBeNull();
    }
  });
});

describe('no hardcoded prices', () => {
  // Every app source file except the dev-only sample offering and tests.
  const root = path.join(process.cwd(), 'src');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, d.name);
      if (d.isDirectory()) {
        if (d.name !== '__tests__') walk(full);
      } else if (/\.(ts|tsx)$/.test(d.name) && !full.endsWith('mockOffering.ts')) files.push(full);
    }
  };
  walk(root);

  test('no price, currency amount or saving percentage is written into the app', () => {
    const offenders: string[] = [];
    const patterns = [/[$€£]\s?\d/, /\d+[.,]\d{2}\s?(?:€|USD|EUR|GBP|EGP)\b/, /\b(?:USD|EUR|GBP|EGP)\s?\d/, /Save \d+%/, /\b(?:3\.99|24\.99|17\.99|79\.00)\b/];
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      for (const re of patterns) if (re.test(text)) offenders.push(`${path.relative(root, f)}: ${re}`);
    }
    // Budget examples like "$800 on this trip" are the user's own money, not
    // Ona's prices; they're allowed by name.
    expect(offenders.filter((o) => !o.startsWith('screens\\BudgetScreen') && !o.startsWith('screens/BudgetScreen'))).toEqual([]);
  });
});
