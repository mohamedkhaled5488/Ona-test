// The words and the one button for each plan state on Plan & usage. Plain
// language; only a payment problem uses a warning tone.
import type { Entitlement } from '../utils/entitlement';

export type StateAction = 'subscribe' | 'manage' | null;

export interface StateCardContent {
  title: string;
  lines: string[];
  tone: 'calm' | 'warn';
  action: StateAction;
  actionLabel?: string;
}

function day(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

export function stateCard(e: Entitlement): StateCardContent {
  switch (e.state) {
    case 'free':
      return { title: 'Free', lines: ['Every section works on this device, for free.', 'Sync across your devices is the paid part.'], tone: 'calm', action: 'subscribe' };
    case 'trial':
      return {
        title: `Trial, ${e.trialDaysLeft} ${e.trialDaysLeft === 1 ? 'day' : 'days'} left`,
        lines: [`Sync is on until ${day(e.trialEndsAt)}.`, 'When the trial ends, nothing is deleted. Sync just pauses.'],
        tone: 'calm',
        action: 'subscribe',
      };
    case 'trialEnded':
      return { title: 'Trial ended', lines: ['Nothing was deleted. Sync is paused.', 'Subscribe any time and syncing picks up where it left off.'], tone: 'calm', action: 'subscribe' };
    case 'subscribed':
      return { title: 'Subscribed', lines: [`Renews on ${day(e.renewsAt)}.`], tone: 'calm', action: 'manage', actionLabel: 'Manage subscription' };
    case 'canceledActive':
      return {
        title: 'Canceled, still active',
        lines: [`Sync stays on until ${day(e.endsAt)}, then pauses. Nothing is deleted.`],
        tone: 'calm',
        action: 'manage',
        actionLabel: 'Resubscribe in Google Play',
      };
    case 'grace':
      return {
        title: 'Payment problem',
        lines: ["Google Play couldn't take your last payment. Sync is still on while it retries.", 'Update your payment method to keep it that way.'],
        tone: 'warn',
        action: 'manage',
        actionLabel: 'Update payment method',
      };
    case 'onHold':
      return {
        title: 'On hold',
        lines: ['Sync is paused until the payment is sorted out. Nothing was deleted.', 'Update your payment method in Google Play and sync resumes by itself.'],
        tone: 'calm',
        action: 'manage',
        actionLabel: 'Fix payment in Google Play',
      };
    case 'expired':
      return e.refunded
        ? { title: 'Refunded', lines: ['Your purchase was refunded. Nothing was deleted. Sync is paused.', 'Subscribe again any time and syncing picks up where it left off.'], tone: 'calm', action: 'subscribe' }
        : { title: 'Subscription ended', lines: ['Nothing was deleted. Sync is paused.', 'Subscribe again any time and syncing picks up where it left off.'], tone: 'calm', action: 'subscribe' };
    case 'lifetime':
      return { title: 'Lifetime', lines: ['Sync is yours for good. Thank you for supporting Ona.'], tone: 'calm', action: null };
  }
}

// The plan list is shown whenever buying could make sense.
export function showsPlanList(e: Entitlement): boolean {
  return e.state === 'free' || e.state === 'trial' || e.state === 'trialEnded' || e.state === 'expired' || e.state === 'canceledActive';
}

// Deleting the account never cancels a store subscription. Shown before
// deletion whenever there's a subscription the user could still be charged for.
export function deleteAccountSubscriptionWarning(e: Entitlement): string | null {
  if (e.state === 'subscribed' || e.state === 'grace' || e.state === 'onHold') {
    return "Deleting your account doesn't cancel your subscription. Cancel it in Google Play first, or you may still be charged.";
  }
  return null;
}
