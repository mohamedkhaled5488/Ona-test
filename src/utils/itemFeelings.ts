// Feelings noted after a habit, a practice session or a Quit moment. There is
// one record, in the main Feelings log, carrying a source; the habit/skill
// pages find it by that source, so there's never a second copy. Quit moments
// keep a link both ways (their urge/slip entry stays in the Quit journey).
import type { FeelingCheckIn, FeelingSource, FeelingZone } from '../types/sections';
import type { FeelingAsk } from '../store/useSettingsStore';
import { useFeelingsStore } from '../store/useFeelingsStore';
import { useHabitsStore } from '../store/useHabitsStore';
import { useSkillsStore } from '../store/useSkillsStore';
import { useQuitHabitsStore } from '../store/useQuitHabitsStore';
import { addDaysISO } from './date';
import { mirrorJournalFeelingEdit, quitMomentFeelingId } from '../feelings/fromSections';

export type ItemKind = 'habit' | 'skill' | 'quitHabit';

// "Ask sometimes": only when nothing was noted for this item in this many days.
export const SOMETIMES_GAP_DAYS = 3;

export function shouldAskItemFeeling(mode: FeelingAsk, entries: FeelingCheckIn[], kind: ItemKind, refId: string, today: string): boolean {
  if (mode === 'always') return true;
  if (mode === 'never') return false;
  const since = addDaysISO(today, -(SOMETIMES_GAP_DAYS - 1));
  return !entries.some((e) => e.source?.kind === kind && e.source.refId === refId && e.date >= since);
}

export function itemName(kind: ItemKind, refId: string): string | undefined {
  if (kind === 'habit') return useHabitsStore.getState().habits.find((h) => h.id === refId)?.name;
  if (kind === 'skill') return useSkillsStore.getState().skills.find((s) => s.id === refId)?.name;
  return useQuitHabitsStore.getState().habits.find((h) => h.id === refId)?.name;
}

export interface ItemFeelingInput {
  source: FeelingSource; // kind habit | skill | quitHabit; quitHabit may carry linkId
  zone: FeelingZone;
  feelingIds?: string[];
  intensities?: Partial<Record<string, 1 | 2 | 3 | 4 | 5>>;
  reasonTags?: string[];
  note?: string;
}

// Writes the feeling to the Feelings log, with the item's name as a tag, and
// links a Quit moment to it. Returns the Feelings log entry's id.
export function logItemFeeling(input: ItemFeelingInput): string {
  const feelings = useFeelingsStore.getState();
  const name = itemName(input.source.kind as ItemKind, input.source.refId);
  const tags = [...new Set([...(name ? [name] : []), ...(input.reasonTags ?? [])])];
  const note = input.note?.trim() || undefined;
  const id = feelings.addEntry(input.zone, input.feelingIds ?? [], input.intensities, tags.length ? tags : undefined, input.source);
  if (note) feelings.setEntryNote(id, note);
  if (input.source.kind === 'quitHabit') {
    const quit = useQuitHabitsStore.getState();
    // A slip or a plain check-in gets its Quit entry now; an urge already has one.
    const linkId = input.source.linkId ?? (input.source.trackId ? quit.addFeelingEntry(input.source.trackId, undefined, undefined, undefined, !!input.source.slip) : undefined);
    if (linkId) quit.setEntryFeeling(linkId, { feelingEntryId: id, zone: input.zone, feelingId: input.feelingIds?.[0], note });
  }
  return id;
}

// After a Feelings log edit: keep a linked Quit moment showing the same feeling.
export function mirrorFeelingEdit(entryId: string): void {
  const entry = useFeelingsStore.getState().entries.find((e) => e.id === entryId);
  if (entry?.source?.kind === 'journal') return mirrorJournalFeelingEdit(entry);
  if (entry?.source?.kind !== 'quitHabit') return;
  const quit = useQuitHabitsStore.getState();
  const linked = quit.feelingEntries.find((q) => quitMomentFeelingId(q) === entryId);
  if (linked) quit.setEntryFeeling(linked.id, { feelingEntryId: entryId, zone: entry.zone, feelingId: entry.feelingIds[0], note: entry.note ?? '' });
}

// After a Feelings log delete: the urge or slip stays in the Quit journey,
// only its feeling goes.
export function unlinkDeletedFeeling(entryId: string): void {
  const quit = useQuitHabitsStore.getState();
  const linked = quit.feelingEntries.find((q) => quitMomentFeelingId(q) === entryId);
  if (linked) quit.setEntryFeeling(linked.id, undefined);
}

// Deleting a Quit moment from its journey also removes its feeling from the log.
export function deleteQuitMoment(quitEntryId: string): void {
  const quit = useQuitHabitsStore.getState();
  const entry = quit.feelingEntries.find((q) => q.id === quitEntryId);
  const feelingId = entry && quitMomentFeelingId(entry);
  if (feelingId) useFeelingsStore.getState().deleteEntry(feelingId);
  quit.deleteFeelingEntry(quitEntryId);
}
