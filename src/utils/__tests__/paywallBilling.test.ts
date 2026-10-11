// Paywall timing, trial notices, and every billing outcome: what the user is
// told, what's tracked, and that nothing but the server grants access.
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []) }));

import { PAYWALL_QUIET_DAYS, dueNotice, mayShowPaywall, purchaseMessage, restoreMessage } from '../../billing/paywall';
import { runPurchase, runRestore, type FlowDeps } from '../../billing/purchaseFlow';
import { stateCard } from '../../billing/planState';
import type { BillingClient, BillingPackage, PurchaseResult, RestoreResult } from '../../billing/types';
import { computeEntitlement, type EntitlementSnapshot } from '../entitlement';
import { forcedSnapshot } from '../../hooks/useEntitlement';
import { usePaywallStore } from '../../store/usePaywallStore';
import { useAccountStore } from '../../store/useAccountStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { setAnalyticsTransport, type OutgoingEvent } from '../analytics';

const DAY = 86_400_000;
const T = Date.parse('2026-10-08T12:00:00Z');

describe('paywall timing', () => {
  test('a paid action may show it, but not within 7 days of a dismissal', () => {
    expect(mayShowPaywall('paidAction', undefined, T)).toBe(true);
    expect(mayShowPaywall('paidAction', T - DAY, T)).toBe(false);
    expect(mayShowPaywall('paidAction', T - (PAYWALL_QUIET_DAYS * DAY - 1), T)).toBe(false);
    expect(mayShowPaywall('paidAction', T - PAYWALL_QUIET_DAYS * DAY, T)).toBe(true);
  });

  test('the user asking for it always works', () => {
    expect(mayShowPaywall('userOpened', T - 60_000, T)).toBe(true);
  });

  test('closed at launch; dismissing starts the quiet week', () => {
    const sent: OutgoingEvent[] = [];
    useSettingsStore.getState().setConsent({ analytics: true });
    setAnalyticsTransport((e) => sent.push(e));
    useAccountStore.setState({ paywallDismissedAt: undefined });

    expect(usePaywallStore.getState().visible).toBe(false); // nothing opens it on start-up
    expect(usePaywallStore.getState().open('paidAction', T)).toBe(true);
    expect(sent.map((e) => e.name)).toEqual(['paywall_viewed']);
    usePaywallStore.getState().close(T);
    expect(useAccountStore.getState().paywallDismissedAt).toBe(T);

    expect(usePaywallStore.getState().open('paidAction', T + 3 * DAY)).toBe(false);
    expect(usePaywallStore.getState().visible).toBe(false);
    expect(usePaywallStore.getState().open('userOpened', T + 3 * DAY)).toBe(true);
    usePaywallStore.getState().close(T + 3 * DAY);
    expect(usePaywallStore.getState().open('paidAction', T + 11 * DAY)).toBe(true);
    usePaywallStore.getState().close(T + 11 * DAY);
    setAnalyticsTransport(null);
  });
});

describe('trial notices', () => {
  const trial = (daysLeft: number) => {
    const s: EntitlementSnapshot = { ...forcedSnapshot('free', T), trial: { startedAt: new Date(T - 30 * DAY).toISOString(), endsAt: new Date(T + daysLeft * DAY - 1000).toISOString() } };
    return computeEntitlement(s, T);
  };

  test.each([
    [10, null],
    [4, null],
    [3, 'trialThreeDays'],
    [2, 'trialThreeDays'],
    [1, 'trialLastDay'],
  ])('%i days left → %s', (days, kind) => {
    expect(dueNotice(trial(days), [])?.kind ?? null).toBe(kind);
  });

  test('each notice shows once', () => {
    const e = trial(3);
    const n = dueNotice(e, [])!;
    expect(dueNotice(e, [n.key])).toBeNull();
    // The last-day notice is separate.
    expect(dueNotice(trial(1), [n.key])?.kind).toBe('trialLastDay');
  });

  test('after it ends: one calm note, then nothing', () => {
    const ended = computeEntitlement(forcedSnapshot('trialEnded', T), T);
    const n = dueNotice(ended, [])!;
    expect(n.kind).toBe('ended');
    expect(n.body).toMatch(/nothing was deleted/i);
    expect(dueNotice(ended, [n.key])).toBeNull();
  });

  test('no notices while subscribed or for lifetime', () => {
    for (const s of ['subscribed', 'lifetime', 'canceledActive', 'free'] as const) expect(dueNotice(computeEntitlement(forcedSnapshot(s, T), T), [])).toBeNull();
  });
});

const annual: BillingPackage = { role: 'annual', packageId: '$rc_annual', productId: 'ona_sync:annual', price: 24.99, priceString: '$24.99', currencyCode: 'USD', period: 'P1Y' };

function deps(purchase: PurchaseResult | Error, restore: RestoreResult = { kind: 'nothingToRestore' }, serverGrantsAccess = false) {
  const events: { name: string; props?: Record<string, unknown> }[] = [];
  let pending: unknown = 'unset';
  let refreshed = 0;
  let access = false;
  const client: BillingClient = {
    available: true,
    getOffering: async () => null,
    purchase: async () => {
      if (purchase instanceof Error) throw purchase;
      return purchase;
    },
    restore: async () => restore,
  };
  const d: FlowDeps = {
    client,
    track: (name, props) => events.push({ name, props }),
    refreshEntitlement: async () => {
      refreshed += 1;
      access = serverGrantsAccess;
    },
    hasAccess: () => access,
    setPending: (p) => (pending = p),
    country: 'EG',
    now: () => T,
  };
  return { d, events, get pending() { return pending; }, get refreshed() { return refreshed; } };
}

describe('purchase outcomes', () => {
  test('purchased: tracked, then the server is asked again', async () => {
    const x = deps({ kind: 'purchased' }, undefined, true);
    const r = await runPurchase(annual, x.d);
    expect(r).toEqual({ outcome: 'purchased', message: 'Thank you. Sync will start in a moment.' });
    expect(x.events.map((e) => e.name)).toEqual(['purchase_started', 'purchase_completed']);
    expect(x.events[0].props).toEqual({ planId: 'annual', country: 'EG' });
    expect(x.refreshed).toBe(1);
    expect(x.pending).toBeNull();
  });

  test('pending: remembered, explained, and no access granted', async () => {
    const x = deps({ kind: 'pending' });
    const r = await runPurchase(annual, x.d);
    expect(r.outcome).toBe('pending');
    expect(r.message).toMatch(/waiting on Google Play/);
    expect(x.pending).toEqual({ productId: 'ona_sync:annual', at: T });
    expect(x.refreshed).toBe(0);
    // Access only ever comes from the server: still none.
    expect(computeEntitlement(forcedSnapshot('free', T), T).syncAccess).toBe(false);
  });

  test('canceled by the user: tracked, and nothing is said', async () => {
    const x = deps({ kind: 'canceled' });
    const r = await runPurchase(annual, x.d);
    expect(r).toEqual({ outcome: 'canceled', message: null });
    expect(x.events.map((e) => e.name)).toEqual(['purchase_started', 'purchase_canceled']);
    expect(x.refreshed).toBe(0);
  });

  test('failed (or the store threw): a calm message, never an alarm', async () => {
    for (const failure of [{ kind: 'failed' as const, message: 'Card declined' }, new Error('Billing unavailable')]) {
      const x = deps(failure);
      const r = await runPurchase(annual, x.d);
      expect(r.outcome).toBe('failed');
      expect(r.message).toBeTruthy();
      expect(x.refreshed).toBe(0);
    }
    expect(purchaseMessage('failed')).toMatch(/weren't charged/);
  });
});

describe('restore', () => {
  test('restored on a new device: the server is asked, and the message reflects access', async () => {
    const x = deps({ kind: 'canceled' }, { kind: 'restored' }, true);
    expect(await runRestore(x.d)).toBe('Your purchase is restored. Sync is on.');
    expect(x.refreshed).toBe(1);
    expect(x.events.map((e) => e.name)).toEqual(['restore_clicked']);
  });

  test('restored but the server has not caught up yet', async () => {
    const x = deps({ kind: 'canceled' }, { kind: 'restored' }, false);
    expect(await runRestore(x.d)).toMatch(/can take a moment/);
  });

  test('nothing to restore, or the store is unreachable', async () => {
    expect(await runRestore(deps({ kind: 'canceled' }, { kind: 'nothingToRestore' }).d)).toBe('No purchases to restore on this Google account.');
    expect(restoreMessage('failed', false)).toMatch(/Try again/);
  });
});

describe('billing states each have a defined message', () => {
  test('refunded reads differently from a normal end', () => {
    const refundedSnap: EntitlementSnapshot = { ...forcedSnapshot('free', T), subscription: { status: 'refunded', expiresAt: null, isLifetime: false, willRenew: false } };
    const refunded = computeEntitlement(refundedSnap, T);
    expect(refunded).toMatchObject({ state: 'expired', refunded: true, syncAccess: false });
    expect(stateCard(refunded).title).toBe('Refunded');
    expect(stateCard(computeEntitlement(forcedSnapshot('expired', T), T)).title).toBe('Subscription ended');
  });

  test('grace keeps access with a soft payment note; on hold explains the fix', () => {
    const grace = computeEntitlement(forcedSnapshot('grace', T), T);
    expect(grace.syncAccess).toBe(true);
    expect(stateCard(grace).actionLabel).toBe('Update payment method');
    const hold = computeEntitlement(forcedSnapshot('onHold', T), T);
    expect(hold.syncAccess).toBe(false);
    expect(stateCard(hold).lines.join(' ')).toMatch(/Update your payment method in Google Play/);
  });

  test('expiry then resubscribing resumes sync, with local data untouched throughout', () => {
    const { usePlanStore } = require('../../store/usePlanStore');
    const plans = usePlanStore.getState().plans;
    expect(computeEntitlement(forcedSnapshot('expired', T), T).syncAccess).toBe(false);
    expect(computeEntitlement(forcedSnapshot('subscribed', T), T).syncAccess).toBe(true);
    expect(usePlanStore.getState().plans).toBe(plans);
  });
});
