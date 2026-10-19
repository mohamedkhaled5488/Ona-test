// Shared bits for the integration tests (not a test file itself).
import { useDailyPlanningStore, resolveTaskDone } from '../../store/useDailyPlanningStore';
import { useFeelingsStore } from '../../store/useFeelingsStore';
import { buckets, completionInsight, feelGoodInsight, feelingsInsight, occurrences, tagInsight } from '../planningInsights';

// Every Daily Planning insight over the last 30 days, as the Insights screen builds them.
export function planningInsightsAll() {
  const { tasks, tags } = useDailyPlanningStore.getState();
  const r = { start: '2026-09-19', end: '2026-10-18' };
  const occ = occurrences(tasks, r, resolveTaskDone, useFeelingsStore.getState().entries);
  return {
    completion: completionInsight(occ, buckets(r, 'week', 1)),
    tags: tagInsight(occ, tasks, tags),
    feelings: feelingsInsight(occ, tags),
    feelGood: feelGoodInsight(occ, tags),
  };
}
