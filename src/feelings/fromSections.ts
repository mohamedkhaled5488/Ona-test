// Every feeling a person notes, in any section, is in the one Feelings log,
// so the Feelings section, its Analysis and Recap see all of them (owner,
// 2026-10-27; this replaces the earlier "Quit: from now on, no backfill").
//
// Two sections keep a feeling of their own as well:
// - Journaling: each entry's colour, and its specific feeling, goes into the
//   Feelings log when the person chose it. A new entry starts with no colour
//   (owner, 2026-10-27), so a colour on it was chosen. Older entries started
//   on Calm and a moved idea got the neutral colour, so those two aren't
//   counted as chosen unless there's a specific feeling (owner: plain older
//   Calm stays out). A conflict copy from sync has no feeling of its own (the
//   day's feeling is its original's).
// - Quit: urges and slips noted with a feeling before they were linked to the
//   Feelings log.
//
// A feeling brought in this way has an id made from its source's id, so
// running this again (or on another phone before the two sync) never makes
// a second copy. A feeling deleted from the Feelings log isn't brought back:
// the journal entry is marked, and a Quit moment loses its feeling. After a
// load or a sync, each feeling is made to follow its source again (so two
// phones end up agreeing, and a feeling deleted on one phone that another
// sent back before it knew is removed again).
import type { FeelingCheckIn, JournalEntry, QuitFeelingEntry, QuitHabit, QuitTrack } from '../types/sections';
import { useFeelingsStore } from '../store/useFeelingsStore';
import { useJournalStore } from '../store/useJournalStore';
import { useQuitHabitsStore } from '../store/useQuitHabitsStore';
import { feelings as wheel } from '../data/feelingsWheel';
import { localDateOf } from '../quit/journey';

export const journalFeelingId = (journalEntryId: string) => `feeling-journal-${journalEntryId}`;
export const quitFeelingId = (quitEntryId: string) => `feeling-quit-${quitEntryId}`;

// A Quit moment's feeling in the Feelings log: linked by id since the link
// existed; an older moment's is found by its own id. (Bringing it in never
// edits the moment: an edit there could, on sync, win over a delete made on
// another phone and bring the feeling back.)
export const quitMomentFeelingId = (q: QuitFeelingEntry): string | undefined => q.feelingEntryId ?? (q.zone || q.feelingId ? quitFeelingId(q.id) : undefined);

// Did the person choose this entry's feeling? (See the header.)
export function journalFeelingChosen(e: JournalEntry): boolean {
  if (e.feelingRemoved || !e.zone || e.conflictCopyOf) return false;
  if (e.feelingChosen !== undefined) return e.feelingChosen;
  return !!e.preciseFeelingId || (e.zone !== 'calm' && e.zone !== 'okay');
}

// A journal entry has no time of day: midday on its date (or now, if that's
// earlier), only so the log keeps its order.
function journalTime(date: string, now: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Math.min(new Date(y, m - 1, d, 12).getTime(), now)).toISOString();
}

// What a journal entry's feeling in the log should be (undefined: none), from
// the entry and the feeling there now. Pure: the app and test seeds use it.
export function journalFeelingFor(entry: JournalEntry, existing: FeelingCheckIn | undefined, now: number = Date.now()): FeelingCheckIn | undefined {
  if (!journalFeelingChosen(entry) || !entry.zone) return undefined;
  const feelingIds = entry.preciseFeelingId ? [entry.preciseFeelingId] : [];
  if (existing && existing.zone === entry.zone && existing.date === entry.date && existing.feelingIds.join() === feelingIds.join()) return existing;
  const today = localDateOf(new Date(now).toISOString());
  return {
    ...(existing ?? {}),
    id: journalFeelingId(entry.id),
    zone: entry.zone,
    feelingIds,
    intensities: existing && existing.feelingIds.join() === feelingIds.join() ? existing.intensities : undefined,
    date: entry.date,
    createdAt: existing?.createdAt ?? (entry.date === today ? new Date(now).toISOString() : journalTime(entry.date, now)),
    source: { kind: 'journal', refId: entry.id },
  };
}

// An older Quit moment's feeling for the log (undefined: it has none, or it's
// already linked). Pure, like journalFeelingFor.
export function quitFeelingFor(q: QuitFeelingEntry, tracks: QuitTrack[], habits: QuitHabit[]): FeelingCheckIn | undefined {
  const zone = q.zone ?? wheel.find((f) => f.id === q.feelingId)?.zone;
  if (!zone || q.feelingEntryId) return undefined;
  const habitId = tracks.find((t) => t.id === q.trackId)?.quitHabitId;
  if (!habitId) return undefined;
  const name = habits.find((h) => h.id === habitId)?.name;
  return {
    id: quitFeelingId(q.id),
    zone,
    feelingIds: q.feelingId ? [q.feelingId] : [],
    reasonTags: name ? [name] : undefined,
    note: q.note?.trim() || undefined,
    date: localDateOf(q.createdAt),
    createdAt: q.createdAt,
    source: { kind: 'quitHabit', refId: habitId, linkId: q.id },
  };
}

// The feelings missing from a log, for data as it's stored. Pure: used to make
// test seeds look as the app keeps data (realSeed.ts), by the same rules as
// bringFeelingsTogether.
export function feelingsToBringIn(
  data: { journal: JournalEntry[]; quitMoments: QuitFeelingEntry[]; tracks: QuitTrack[]; habits: QuitHabit[]; feelings: FeelingCheckIn[] },
  now: number = Date.now()
): FeelingCheckIn[] {
  const have = new Set(data.feelings.map((f) => f.id));
  const out: FeelingCheckIn[] = [];
  for (const e of data.journal) {
    const f = journalFeelingFor(e, undefined, now);
    if (f && !have.has(f.id)) out.push(f);
  }
  for (const q of data.quitMoments) {
    const f = quitFeelingFor(q, data.tracks, data.habits);
    if (f && !have.has(f.id)) out.push(f);
  }
  return out;
}

// After a journal entry is saved (or brought back by undo): its feeling in
// the Feelings log follows it. A feeling edited in the Feelings log keeps
// what was added there (intensity, tags, note).
export function syncJournalFeeling(journalEntryId: string): void {
  const entry = useJournalStore.getState().entries.find((e) => e.id === journalEntryId);
  if (!entry) return;
  const feelings = useFeelingsStore.getState();
  const id = journalFeelingId(entry.id);
  const existing = feelings.entries.find((e) => e.id === id);
  const wanted = journalFeelingFor(entry, existing);
  // Cleared, deleted from the log, or a conflict copy: no feeling. (An older
  // entry left on Calm never had one.)
  if (!wanted) {
    if (existing) feelings.deleteEntry(id);
    return;
  }
  if (wanted !== existing) feelings.putEntry(wanted);
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
  const quit = useQuitHabitsStore.getState();
  const f = quitFeelingFor(q, quit.tracks, quit.habits);
  const feelings = useFeelingsStore.getState();
  if (f && !feelings.entries.some((e) => e.id === f.id)) feelings.putEntry(f);
}

// Brings in every feeling that isn't in the Feelings log yet, and makes each
// one follow its source. Safe to run again and again: at start, after
// switching data, after a sync.
export function bringFeelingsTogether(): { journal: number; quit: number } {
  const before = new Set(useFeelingsStore.getState().entries.map((e) => e.id));
  for (const e of useJournalStore.getState().entries) syncJournalFeeling(e.id);
  for (const q of useQuitHabitsStore.getState().feelingEntries) {
    if (!q.feelingEntryId) bringInQuitMoment(q);
    // Its feeling was deleted (the moment has none now): a copy sent back by a
    // phone that didn't know yet goes again.
    if (!quitMomentFeelingId(q) && before.has(quitFeelingId(q.id))) useFeelingsStore.getState().deleteEntry(quitFeelingId(q.id));
  }
  const added = useFeelingsStore.getState().entries.filter((e) => !before.has(e.id));
  return { journal: added.filter((e) => e.source?.kind === 'journal').length, quit: added.filter((e) => e.source?.kind === 'quitHabit').length };
}
