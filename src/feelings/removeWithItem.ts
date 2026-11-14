// When something a feeling was noted with is deleted (a Quit or Build habit,
// a skill, a task, a book, a study session, a reflection), the feelings noted
// with it go too: everywhere in Ona (the Feelings log, its graph, Patterns,
// Analysis, Recap), and on other phones through sync. Owner, 2026-11-14 ("when
// I delete something it should be deleted in the app"), replacing the earlier
// "feelings stay in your Feelings log". The journal already worked this way
// (feelings/fromSections.ts removeJournalFeeling). Where a delete has Undo,
// the screen restores the Feelings log it took a snapshot of.
import { useFeelingsStore } from '../store/useFeelingsStore';
import type { FeelingSource } from '../types/sections';
import { useQuitHabitsStore } from '../store/useQuitHabitsStore';
import { useHabitsStore } from '../store/useHabitsStore';
import { useSkillsStore } from '../store/useSkillsStore';
import { useStudyStore } from '../store/useStudyStore';
import { useReadingListStore } from '../store/useReadingListStore';
import { useReflectionStore } from '../store/useReflectionStore';
import { useDailyPlanningStore } from '../store/useDailyPlanningStore';

// Removes the feelings whose source is this item (on these days only, when
// given: a repeating task's day). Returns how many went.
export function removeFeelingsOf(kind: FeelingSource['kind'], refId: string, onDay?: (date: string) => boolean): number {
  const { entries } = useFeelingsStore.getState();
  const goes = (e: (typeof entries)[number]) => e.source?.kind === kind && e.source.refId === refId && (!onDay || onDay(e.source.date ?? e.date));
  const n = entries.filter(goes).length;
  if (n) useFeelingsStore.setState({ entries: entries.filter((e) => !goes(e)) });
  return n;
}

// For a screen's Undo: the Feelings log as it was, put back.
export function feelingsSnapshot(): () => void {
  const before = useFeelingsStore.getState().entries;
  return () => useFeelingsStore.getState().restoreEntries(before);
}

// Feelings whose item was deleted before deletes took feelings with them
// (or on another phone, before it synced): removed too. Only when this
// phone's data is complete: at start on a phone that doesn't sync, and right
// after a sync has finished (never mid-restore, when an item may not have
// arrived yet). The journal's are handled by its own link
// (feelings/fromSections.ts).
export function removeOrphanFeelings(): number {
  const exists: Partial<Record<FeelingSource['kind'], Set<string>>> = {
    quitHabit: new Set(useQuitHabitsStore.getState().habits.map((h) => h.id)),
    habit: new Set(useHabitsStore.getState().habits.map((h) => h.id)),
    skill: new Set(useSkillsStore.getState().skills.map((s) => s.id)),
    study: new Set(useStudyStore.getState().sessions.map((s) => s.id)),
    book: new Set(useReadingListStore.getState().entries.map((e) => e.id)),
    reflect: new Set(useReflectionStore.getState().sessions.map((s) => s.id)),
    task: new Set(useDailyPlanningStore.getState().tasks.map((t) => t.id)),
  };
  const { entries } = useFeelingsStore.getState();
  const orphan = (e: (typeof entries)[number]) => {
    const ids = e.source ? exists[e.source.kind] : undefined;
    return !!ids && !!e.source!.refId && !ids.has(e.source!.refId);
  };
  const n = entries.filter(orphan).length;
  if (n) useFeelingsStore.setState({ entries: entries.filter((e) => !orphan(e)) });
  return n;
}
