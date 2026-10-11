// Which locks are open right now. Never persisted: every cold start begins
// locked, and leaving Ona for longer than the grace period locks again.
import { create } from 'zustand';
import type { LockScope } from '../utils/pinLock';

export const RELOCK_AFTER_MS = 30_000;

interface LockState {
  unlocked: Record<LockScope, boolean>;
  backgroundedAt?: number;
  unlock: (scope: LockScope) => void;
  lockAll: () => void;
  markBackgrounded: (at: number) => void;
  // Called when Ona comes back to the foreground.
  markForegrounded: (at: number) => void;
}

export const useLockStore = create<LockState>((set, get) => ({
  unlocked: { app: false, journal: false },
  unlock: (scope) => set((s) => ({ unlocked: { ...s.unlocked, [scope]: true } })),
  lockAll: () => set({ unlocked: { app: false, journal: false } }),
  markBackgrounded: (at) => set({ backgroundedAt: at }),
  markForegrounded: (at) => {
    const away = get().backgroundedAt;
    if (away !== undefined && at - away >= RELOCK_AFTER_MS) get().lockAll();
    set({ backgroundedAt: undefined });
  },
}));
