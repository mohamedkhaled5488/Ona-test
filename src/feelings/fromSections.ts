// Every feeling a person notes, in any section, is in the one Feelings log,
// so the Feelings section, its Analysis and Recap see all of them (owner,
// 2026-10-27; this replaces the earlier "Quit: from now on, no backfill").
//
// Two sections keep a feeling of their own as well:
// - Journaling: each entry's colour, and its specific feeling. It goes into
//   the Feelings log when the person chose it; a new entry starts on Calm and
//   an idea moved from Catch a Thought gets the neutral colour, so those
//   aren't feelings anyone noted. Entries saved before this was recorded
//   count as chosen when they have a specific feeling or a colour other
//   than those two defaults.
// - Quit: urges and slips noted with a feeling before they were linked to the
//   Feelings log.
//
// A feeling brought in this way has an id made from its source's id, so
// running this again (or on another phone before the two sync) never makes
// a second copy. A feeling deleted from the Feelings log isn't brought back:
// the journal entry is marked, and a Quit moment loses its feeling.
import type { FeelingCheckIn, JournalEntry, QuitFeelingEntry } from '../types/sections';
import { useFeelingsStore } from '../store/useFeelingsStore';
import { useJournalStore } from '../store/useJournalStore';
import { useQuitHabitsStore } from '../store/useQuitHabitsStore';
import { feelings as wheel } from '../data/feelingsWheel';
import { localDateOf } from '../quit/journey';
import { todayISO } from '../utils/date';

export const journalFeelingId = (journalEntryId: string) => `feeling-journal-${journalEntryId}`;
export const quitFeelingId = (quitEntryId: string) => `feeling-quit-${quitEntryId}`;

// Did the person choose this entry's feeling? (See the header.)
export function journalFeelingChosen(e: JournalEntry): boolean {
  if (e.feelingRemoved) return false;
  if (e.feelingChosen !== undefined) return e.feelingChosen;
  return !!e.preciseFeelingId || (e.zone !== 'calm' && e.zone !== 'okay');
}

// A journal entry has no time of day: midday on its date (or now, if that's
// earlier), only so the log keeps its order.
function journalTime(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Math.min(new Date(y, m - 1, d, 12).getTime(), Date.now())).toISOString();
}

// After a journal entry is saved (or brought back by undo): its feeling in
// the Feelings log follows it. A feeling edited in the Feelings log keeps
// what was added there (intensity, tags, note).
export function syncJournalFeeling(journalEntryId: string): void {
  const entry = useJournalStore.getState().entries.find((e) => e.id === journalEntryId);
  if (!entry || !journalFeelingChosen(entry)) return;
  const feelings = useFeelingsStore.getState();
  const id = journalFeelingId(entry.id);
  const existing = feelings.entries.find((e) => e.id === id);
  const feelingIds = entry.preciseFeelingId ? [entry.preciseFeelingId] : [];
  if (existing && existing.zone === entry.zone && existing.date === entry.date && existing.feelingIds.join() === feelingIds.join()) return;
  feelings.putEntry({
    ...(existing ?? {}),
    id,
    zone: entry.zone,
    feelingIds,
    intensities: existing && existing.feelingIds.join() === feelingIds.join() ? existing.intensities : undefined,
    date: entry.date,
    createdAt: existing?.createdAt ?? (entry.date === todayISO() ? new Date().toISOString() : journalTime(entry.date)),
    source: { kind: 'journal', refId: entry.id },
  } as FeelingCheckIn);
}

// Deleting a journal entry removes its feeling too.
export function removeJournalFeeling(journalEntryId: string): void {
  useFeelingsStore.getState().deleteEntry(journalFeelingId(journalEntryId));
}

// From the Feelings log: an edit shows in the journal entry; a delete marks
// the entry so its feeling isn't brought back.
export function mirrorJournalFeelingEdit(entry: FeelingCheckIn): void {
  if (entry.source?.kind !== 'journal') return;
  const first = entry.feelingIds[0];
  const precise = first && wheel.some((f) => f.id === first && f.zone === entry.zone) ? first : undefined;
  useJournalStore.getState().setEntryFeeling(entry.source.refId, entry.zone, precise);
}
export function markJournalFeelingRemoved(entry: FeelingCheckIn): void {
  if (entry.source?.kind === 'journal') useJournalStore.getState().setFeelingRemoved(entry.source.refId, true);
}

function bringInQuitMoment(q: QuitFeelingEntry): void {
  const zone = q.zone ?? wheel.find((f) => f.id === q.feelingId)?.zone;
  if (!zone || q.feelingEntryId) return;
  const quit = useQuitHabitsStore.getState();
  const habitId = quit.tracks.find((t) => t.id === q.trackId)?.quitHabitId;
  if (!habitId) return;
  const name = quit.habits.find((h) => h.id === habitId)?.name;
  const id = quitFeelingId(q.id);
  const feelings = useFeelingsStore.getState();
  if (!feelings.entries.some((e) => e.id === id)) {
    feelings.putEntry({
      id,
      zone,
      feelingIds: q.feelingId ? [q.feelingId] : [],
      reasonTags: name ? [name] : undefined,
      note: q.note?.trim() || undefined,
      date: localDateOf(q.createdAt),
      createdAt: q.createdAt,
      source: { kind: 'quitHabit', refId: habitId, linkId: q.id },
    });
  }
  quit.setEntryFeeling(q.id, { feelingEntryId: id, zone, feelingId: q.feelingId, note: q.note });
}

// Brings in every feeling that isn't in the Feelings log yet. Safe to run
// again and again: at start, after switching data, after a sync.
export function bringFeelingsTogether(): { journal: number; quit: number } {
  const before = new Set(useFeelingsStore.getState().entries.map((e) => e.id));
  for (const e of useJournalStore.getState().entries) if (journalFeelingChosen(e) && !before.has(journalFeelingId(e.id))) syncJournalFeeling(e.id);
  for (const q of useQuitHabitsStore.getState().feelingEntries) if (!q.feelingEntryId) bringInQuitMoment(q);
  const added = useFeelingsStore.getState().entries.filter((e) => !before.has(e.id));
  return { journal: added.filter((e) => e.source?.kind === 'journal').length, quit: added.filter((e) => e.source?.kind === 'quitHabit').length };
}
