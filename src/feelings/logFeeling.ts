// The one way a feeling is saved, from any section. There is one Feelings
// log (useFeelingsStore); this decides how the entry is linked by its
// source, so every screen saves the same way and the graph, Analysis and
// Recap see every feeling:
// - a task: linked both ways (the task shows it; it carries the task's tags)
// - a habit, practice session or Quit moment: carries that item's name as a
//   tag (and a Quit moment keeps its link to the urge or slip)
// - Study, Book, or standalone: saved as is, with its source if any.
// Screens and components never call the store's addEntry or the helpers
// below directly (logFeeling.test.ts checks that).
import { useFeelingsStore } from '../store/useFeelingsStore';
import { logItemFeeling } from '../utils/itemFeelings';
import { logTaskFeeling } from '../utils/taskFeelings';
import { todayISO } from '../utils/date';
import type { FeelingSource, FeelingZone } from '../types/sections';

export interface LogFeelingInput {
  zone: FeelingZone;
  feelingIds?: string[];
  intensities?: Partial<Record<string, 1 | 2 | 3 | 4 | 5>>;
  tags?: string[];
  // undefined: leave as is; '' clears it (editing a task's feeling)
  note?: string;
  source?: FeelingSource;
}

// Returns the Feelings log entry's id.
export function logFeeling(input: LogFeelingInput): string {
  const { source } = input;
  if (source?.kind === 'task') {
    const id = logTaskFeeling({
      taskId: source.refId,
      date: source.date ?? todayISO(),
      phase: source.phase ?? 'after',
      zone: input.zone,
      feelingIds: input.feelingIds,
      intensities: input.intensities,
      reasonTags: input.tags,
      note: input.note,
    });
    if (id) return id;
    // The task no longer exists: the feeling is still kept, with its source.
  } else if (source && (source.kind === 'habit' || source.kind === 'skill' || source.kind === 'quitHabit')) {
    return logItemFeeling({ source, zone: input.zone, feelingIds: input.feelingIds, intensities: input.intensities, reasonTags: input.tags, note: input.note });
  }
  const feelings = useFeelingsStore.getState();
  const tags = input.tags?.length ? [...new Set(input.tags)] : undefined;
  const id = feelings.addEntry(input.zone, input.feelingIds ?? [], input.intensities, tags, source);
  const note = input.note?.trim();
  if (note) feelings.setEntryNote(id, note);
  return id;
}
