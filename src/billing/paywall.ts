// When Ona may show the plans, and the few gentle notices about the trial.
// No dark patterns: the paywall only appears when the user reaches for a paid
// action or opens it themselves, never at launch or on opening a section,
// and never again within a week of being dismissed unless the user asks.
import { ESSENTIALS_NAME, PLUS_NAME, STATE_COPY, TRIAL_NAME } from '../config/plans';
import type { Entitlement } from '../utils/entitlement';

export const PAYWALL_QUIET_DAYS = 7;
const DAY = 86_400_000;

export type PaywallTrigger =
  | 'userOpened' // tapped "See plans" / opened Plan & usage
  | 'paidAction'; // tried something paid, like "Sync now" without access

export function mayShowPaywall(trigger: PaywallTrigger, lastDismissedAt: number | undefined, now: number): boolean {
  if (trigger === 'userOpened') return true;
  if (lastDismissedAt === undefined) return true;
  return now - lastDismissedAt >= PAYWALL_QUIET_DAYS * DAY;
}

// --- Trial notices: one three days before the end, one on the last day,
// and one calm note once it (or a subscription) has ended. Nothing else.
export type NoticeKind = 'trialThreeDays' | 'trialLastDay' | 'ended';

export interface Notice {
  kind: NoticeKind;
  key: string; // remembered once dismissed, so each notice shows once
  title: string;
  body: string;
}

export function dueNotice(e: Entitlement, dismissed: string[]): Notice | null {
  let notice: Notice | null = null;
  if (e.state === 'trial' && e.trialDaysLeft !== null && e.trialEndsAt) {
    if (e.trialDaysLeft === 1) {
      notice = {
        kind: 'trialLastDay',
        key: `trialLastDay:${e.trialEndsAt}`,
        title: `${TRIAL_NAME}: last day`,
        body: `From tomorrow, Ona carries on in ${ESSENTIALS_NAME}. Everything stays on this phone, and nothing is deleted. Choose ${PLUS_NAME} any time for sync and deeper insight.`,
      };
    } else if (e.trialDaysLeft <= 3) {
      notice = {
        kind: 'trialThreeDays',
        key: `trialThreeDays:${e.trialEndsAt}`,
        title: STATE_COPY.trial(e.trialDaysLeft),
        body: `When it ends, Ona carries on in ${ESSENTIALS_NAME}. Everything stays on this phone, and nothing is deleted.`,
      };
    }
  } else if ((e.state === 'trialEnded' || e.state === 'expired') && !e.syncAccess) {
    const what = e.state === 'trialEnded' ? `Your ${TRIAL_NAME} is over` : 'Your subscription ended';
    notice = {
      kind: 'ended',
      key: `ended:${e.state}:${e.trialEndsAt ?? e.endsAt ?? ''}`,
      title: STATE_COPY.essentials,
      body: `${what}. Sync is paused, everything is still here, and nothing was deleted.`,
    };
  }
  return notice && !dismissed.includes(notice.key) ? notice : null;
}

// --- Billing outcomes: a defined message for each, nothing alarming.
export type PurchaseOutcome = 'purchased' | 'pending' | 'canceled' | 'failed';

export function purchaseMessage(outcome: PurchaseOutcome, failure?: string): string | null {
  switch (outcome) {
    case 'purchased':
      return 'Thank you. Sync will start in a moment.';
    case 'pending':
      return "Your purchase is waiting on Google Play. Sync starts once it goes through. You won't be charged twice.";
    case 'canceled':
      return null; // the user closed the store sheet: say nothing
    case 'failed':
      return failure ?? "The purchase didn't go through, and you weren't charged. You can try again any time.";
  }
}

export function restoreMessage(outcome: 'restored' | 'nothingToRestore' | 'failed', hasAccess: boolean, failure?: string): string {
  if (outcome === 'restored') return hasAccess ? 'Your purchase is restored. Sync is on.' : 'Restored. It can take a moment for sync to switch on.';
  if (outcome === 'nothingToRestore') return 'No purchases to restore on this Google account.';
  return failure ?? "Couldn't reach Google Play. Try again in a moment.";
}
