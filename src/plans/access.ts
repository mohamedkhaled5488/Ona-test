// What Free and Plus allow, read from config/plans.ts. Plus = sync access
// (the trial, a subscription, grace, paid time left after canceling, or
// lifetime). Limits are only ever on creating more or going deeper: nothing
// here hides, locks or deletes anything that already exists.
import { useEntitlement } from '../hooks/useEntitlement';
import { useDataSpace } from '../hooks/useDataSpace';
import { computeEntitlement } from '../utils/entitlement';
import { useEntitlementStore } from '../store/useEntitlementStore';
import { useAuthStore } from '../store/useAuthStore';
import { usePlanStore } from '../store/usePlanStore';
import { useHabitsStore } from '../store/useHabitsStore';
import { useSkillsStore } from '../store/useSkillsStore';
import { useReadingListStore } from '../store/useReadingListStore';
import { useBudgetStore } from '../store/useBudgetStore';
import { useDailyPlanningStore } from '../store/useDailyPlanningStore';
import { isDemo } from '../utils/dataSpace';
import { addDaysISO, todayISO } from '../utils/date';
import { weekStartFor } from '../utils/feelingsStats';
import { useSettingsStore } from '../store/useSettingsStore';
import { FREE_CAPS, type CapId } from '../config/plans';

// The demo shows everything Ona can do (buying stays off there).
export function usePlus(): boolean {
  const demo = useDataSpace() === 'demo';
  const { syncAccess } = useEntitlement();
  return demo || syncAccess;
}

export function isPlusNow(now: number = Date.now()): boolean {
  if (isDemo()) return true;
  const userId = useAuthStore.getState().session?.user.id;
  if (!userId) return false;
  return computeEntitlement(useEntitlementStore.getState().snapshots[userId], now).syncAccess;
}

export type CountCap = Exclude<CapId, 'dietWeeksAhead'>;

// How many of each you have now (archived and finished ones don't count).
export function usedNow(cap: CountCap): number {
  switch (cap) {
    case 'activePlans':
      return usePlanStore.getState().plans.filter((p) => p.status === 'active').length;
    case 'buildHabits':
      return useHabitsStore.getState().habits.filter((h) => !h.archivedAt && h.graduationChoice !== 'formed').length;
    case 'skills':
      return useSkillsStore.getState().skills.filter((s) => !s.archivedAt).length;
    case 'activeBooks':
      return useReadingListStore.getState().entries.filter((e) => e.status !== 'finished').length;
    case 'budgets':
      return useBudgetStore.getState().budgets.length;
    case 'taskTemplates':
      return useDailyPlanningStore.getState().taskTemplates.length;
  }
}

// Whether one more can be created. Over the cap (e.g. after a trial), what
// exists stays fully usable; only adding another waits for Plus.
export function canCreate(cap: CountCap, plus: boolean = isPlusNow()): boolean {
  return plus || usedNow(cap) < FREE_CAPS[cap];
}

// Diet on Free: plan up to the end of next week. Past weeks stay visible and
// editable; this only limits how far ahead a meal can be planned.
export function lastPlannableDate(today: string = todayISO()): string {
  const weekStart = weekStartFor(today, useSettingsStore.getState().weekStartsOn);
  return addDaysISO(weekStart, 7 * (FREE_CAPS.dietWeeksAhead + 1) - 1);
}
export function canPlanMealOn(date: string, plus: boolean = isPlusNow(), today: string = todayISO()): boolean {
  return plus || date <= lastPlannableDate(today);
}
