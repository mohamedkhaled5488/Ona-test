// The link between a task and the feelings logged around it. A feeling is
// stored once, in the Feelings log (so it shows in the graph and Analysis),
// with source { kind: 'task', refId, date, phase }; the task keeps only the
// entry's id for that day (task.feelingLinks). Editing or deleting it in
// either place therefore changes the one copy, and these helpers keep the
// link itself tidy.
import type { DailyTask, FeelingCheckIn, FeelingZone, TaskTag } from '../types/sections';
import type { TaskFeelingMode } from '../store/useSettingsStore';
import { useFeelingsStore } from '../store/useFeelingsStore';
import { useDailyPlanningStore } from '../store/useDailyPlanningStore';
import { unlinkDeletedFeeling } from './itemFeelings';
import { markJournalFeelingRemoved } from '../feelings/fromSections';


export type FeelingPhase = 'before' | 'after';

export const QUICK_TASK_MINUTES = 5;

// Whether finishing this task should bring up the "How do you feel?" sheet.
// Otherwise a quiet "How did it feel?" link is still on the row.
export function shouldAskFeeling(task: Pick<DailyTask, 'priority' | 'tagIds' | 'estimateMinutes' | 'durationMinutes'>, mode: TaskFeelingMode): boolean {
  if (mode === 'never') return false;
  if (mode === 'always') return true;
  if (mode === 'tagged') return task.tagIds.length > 0;
  // 'auto': important or tagged tasks, and never a quick one.
  const minutes = task.estimateMinutes ?? task.durationMinutes;
  if (minutes !== undefined && minutes <= QUICK_TASK_MINUTES) return false;
  return task.priority === 'medium' || task.priority === 'high' || task.tagIds.length > 0;
}

export function taskTagNames(task: Pick<DailyTask, 'tagIds'>, tags: TaskTag[]): string[] {
  return task.tagIds.map((id) => tags.find((t) => t.id === id)?.name).filter((n): n is string => !!n);
}

// The entry linked to one day of a task. Entries logged before v2 have no
// link on the task; they're found by their source and date instead.
export function linkedEntry(task: DailyTask, date: string, phase: FeelingPhase, entries: FeelingCheckIn[]): FeelingCheckIn | undefined {
  const id = task.feelingLinks[date]?.[phase];
  if (id) return entries.find((e) => e.id === id);
  if (phase === 'before') return undefined;
  return [...entries].reverse().find((e) => e.source?.kind === 'task' && e.source.refId === task.id && !e.source.phase && (e.source.date ?? e.date) === date);
}

export interface TaskFeelingInput {
  taskId: string;
  date: string; // the task's day
  phase: FeelingPhase;
  zone: FeelingZone;
  feelingIds?: string[]; // empty: just the zone ("Calm"); set by "Be more specific"
  intensities?: FeelingCheckIn['intensities'];
  reasonTags?: string[]; // chosen in the Feelings flow, added to the task's tags
  note?: string;
}

// Logs (or, if that day already has one, updates) a feeling for a task.
// Returns the entry id.
export function logTaskFeeling(input: TaskFeelingInput): string | undefined {
  const plan = useDailyPlanningStore.getState();
  const task = plan.tasks.find((t) => t.id === input.taskId);
  if (!task) return undefined;
  const feelings = useFeelingsStore.getState();
  const reasonTags = [...new Set([...taskTagNames(task, plan.tags), ...(input.reasonTags ?? [])])];
  const existing = linkedEntry(task, input.date, input.phase, feelings.entries);
  const patch = {
    zone: input.zone,
    feelingIds: input.feelingIds ?? [],
    intensities: input.intensities,
    reasonTags: reasonTags.length ? reasonTags : undefined,
    ...(input.note !== undefined ? { note: input.note } : {}),
  };
  let id: string;
  if (existing) {
    feelings.updateEntry(existing.id, patch);
    id = existing.id;
  } else {
    id = feelings.addEntry(input.zone, patch.feelingIds, input.intensities, patch.reasonTags, {
      kind: 'task',
      refId: task.id,
      date: input.date,
      phase: input.phase,
    });
    if (input.note) feelings.setEntryNote(id, input.note);
  }
  plan.setFeelingLink(task.id, input.date, input.phase, id);
  return id;
}

// Removes the feeling from one day of a task, from both places.
export function clearTaskFeeling(taskId: string, date: string, phase: FeelingPhase): void {
  const plan = useDailyPlanningStore.getState();
  const task = plan.tasks.find((t) => t.id === taskId);
  if (!task) return;
  const entry = linkedEntry(task, date, phase, useFeelingsStore.getState().entries);
  if (entry) useFeelingsStore.getState().deleteEntry(entry.id);
  plan.setFeelingLink(taskId, date, phase, undefined);
}

// Deleting from the Feelings log also clears the task's link to it.
export function deleteFeelingEntry(entryId: string): void {
  const entry = useFeelingsStore.getState().entries.find((e) => e.id === entryId);
  useFeelingsStore.getState().deleteEntry(entryId);
  if (entry?.source?.kind === 'quitHabit') unlinkDeletedFeeling(entryId);
  if (entry) markJournalFeelingRemoved(entry);
  if (entry?.source?.kind !== 'task') return;
  const plan = useDailyPlanningStore.getState();
  const task = plan.tasks.find((t) => t.id === entry.source!.refId);
  if (!task) return;
  for (const [date, link] of Object.entries(task.feelingLinks)) {
    if (link.after === entryId) plan.setFeelingLink(task.id, date, 'after', undefined);
    if (link.before === entryId) plan.setFeelingLink(task.id, date, 'before', undefined);
  }
}

// Renaming or merging a tag renames it in the reason tags of feelings
// logged after the tasks that carry it. (Deleting a tag leaves past
// feelings as they were, like the Feelings section's own tags.)
export function renameTaskTagInFeelings(oldName: string, newName: string, taskIds: string[]): void {
  if (oldName === newName || taskIds.length === 0) return;
  const ids = new Set(taskIds);
  const feelings = useFeelingsStore.getState();
  for (const e of feelings.entries) {
    if (e.source?.kind !== 'task' || !ids.has(e.source.refId) || !e.reasonTags?.includes(oldName)) continue;
    feelings.updateEntry(e.id, { reasonTags: [...new Set(e.reasonTags.map((t) => (t === oldName ? newName : t)))] });
  }
}
