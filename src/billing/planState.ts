// The words and the one button for each plan state on Plan & usage. Plain
// language; only a payment problem uses a warning tone.
import type { Entitlement } from '../utils/entitlement';
import { ESSENTIALS_NAME, PLUS_NAME, STATE_COPY, TRIAL_NAME } from '../config/plans';

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

// Titles are the one sentence per mode (config/plans.ts STATE_COPY); the
// lines say what's specific to this state.
export function stateCard(e: Entitlement): StateCardContent {
  const essentials = STATE_COPY.essentials;
  const plus = STATE_COPY.plus;
  switch (e.state) {
    case 'free':
      return { title: essentials, lines: ['Every section works on this phone.', `${PLUS_NAME} adds sync across your devices and deeper insight.`], tone: 'calm', action: 'subscribe' };
    case 'trial':
      return {
        title: STATE_COPY.trial(e.trialDaysLeft ?? 0),
        lines: [`Sync is on until ${day(e.trialEndsAt)}.`, `After that, Ona carries on in ${ESSENTIALS_NAME}. Nothing is deleted.`],
        tone: 'calm',
        action: 'subscribe',
      };
    case 'trialEnded':
      return { title: essentials, lines: [`Your ${TRIAL_NAME} is over. Nothing was deleted, and sync is paused.`, `Choose ${PLUS_NAME} any time and syncing picks up where it left off.`], tone: 'calm', action: 'subscribe' };
    case 'subscribed':
      return { title: plus, lines: [`Renews on ${day(e.renewsAt)}.`], tone: 'calm', action: 'manage', actionLabel: 'Manage subscription' };
    case 'canceledActive':
      return {
        title: plus,
        lines: [`Canceled: ${PLUS_NAME} stays on until ${day(e.endsAt)}, then Ona carries on in ${ESSENTIALS_NAME}. Nothing is deleted.`],
        tone: 'calm',
        action: 'manage',
        actionLabel: 'Resubscribe in Google Play',
      };
    case 'grace':
      return {
        title: plus,
        lines: ["Google Play couldn't take your last payment. Sync is still on while it retries.", 'Update your payment method to keep it that way.'],
        tone: 'warn',
        action: 'manage',
        actionLabel: 'Update payment method',
      };
    case 'onHold':
      return {
        title: essentials,
        lines: ['Sync is paused until the payment is sorted out. Nothing was deleted.', 'Update your payment method in Google Play and sync resumes by itself.'],
        tone: 'calm',
        action: 'manage',
        actionLabel: 'Fix payment in Google Play',
      };
    case 'expired':
      return e.refunded
        ? { title: essentials, lines: ['Your purchase was refunded. Nothing was deleted, and sync is paused.', `Choose ${PLUS_NAME} again any time and syncing picks up where it left off.`], tone: 'calm', action: 'subscribe' }
        : { title: essentials, lines: ['Your subscription ended. Nothing was deleted, and sync is paused.', `Choose ${PLUS_NAME} again any time and syncing picks up where it left off.`], tone: 'calm', action: 'subscribe' };
    case 'lifetime':
      return { title: plus, lines: ['Yours for good. Thank you for supporting Ona.'], tone: 'calm', action: null };
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
