// Whether the plans sheet is open. Opening goes through the paywall rules:
// a paid action can't bring it back within a week of the user closing it;
// the user asking for it always works.
import { create } from 'zustand';
import { mayShowPaywall, type PaywallTrigger } from '../billing/paywall';
import { useAccountStore } from './useAccountStore';
import { track } from '../utils/analytics';
import { deviceRegion } from '../config/about';
import { isDemo } from '../utils/dataSpace';

interface PaywallState {
  visible: boolean;
  // Returns whether the sheet opened.
  open: (trigger: PaywallTrigger, now?: number) => boolean;
  close: (now?: number) => void;
}

export const usePaywallStore = create<PaywallState>((set, get) => ({
  visible: false,
  open: (trigger, now = Date.now()) => {
    if (isDemo()) return false; // purchases are real, so no paywall in Demo mode
    if (get().visible) return true;
    if (!mayShowPaywall(trigger, useAccountStore.getState().paywallDismissedAt, now)) return false;
    set({ visible: true });
    track('paywall_viewed', { country: deviceRegion() });
    return true;
  },
  close: (now = Date.now()) => {
    if (!get().visible) return;
    set({ visible: false });
    useAccountStore.getState().markPaywallDismissed(now);
  },
}));
