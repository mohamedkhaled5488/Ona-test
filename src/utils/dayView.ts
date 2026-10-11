// The day list: its order, filters, sorting, grouping, search, the "Plan my
// day" load and carry-over. Pure functions; the screen passes in how to read
// a task's title and done state (a linked task reads its Plan Builder step).
import type { DailyTask, TaskEnergy, TaskPriority, TaskTag } from '../types/sections';
import { nextOccurrences, occursOn } from './taskRepeat';
import { addDaysISO } from './date';

export type GroupBy = 'none' | 'tag' | 'priority' | 'energy' | 'status';
export type SortBy = 'manual' | 'time' | 'priority' | 'energy';
export type StatusFilter = 'all' | 'open' | 'done';

export interface DayFilters {
  tagIds: string[]; // any of these (empty = no tag filter)
  priorities: TaskPriority[];
  energies: TaskEnergy[];
  status: StatusFilter;
}

export interface DayViewPrefs {
  groupBy: GroupBy;
  sortBy: SortBy;
  filters: DayFilters;
}

export const DEFAULT_DAY_VIEW: DayViewPrefs = {
  groupBy: 'none',
  sortBy: 'manual',
  filters: { tagIds: [], priorities: [], energies: [], status: 'all' },
};

export type DoneOn = (task: DailyTask, date: string) => boolean;
export type TitleOf = (task: DailyTask) => string;

// --- Order of the day ---------------------------------------------------------
// `dayOrder[date]` is the order the user dragged that day into. Tasks not in
// it (new, or never reordered that day) follow, by their own `order`.
export function sortForDay(tasks: DailyTask[], date: string, dayOrder: Record<string, string[]>): DailyTask[] {
  const saved = dayOrder[date] ?? [];
  const rank = new Map(saved.map((id, i) => [id, i]));
  return [...tasks].sort((a, b) => {
    const ra = rank.get(a.id);
    const rb = rank.get(b.id);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return a.order - b.order;
  });
}

// The day's ids after moving `id` to position `toIndex` (clamped).
export function moveInDay(ids: string[], id: string, toIndex: number): string[] {
  const from = ids.indexOf(id);
  if (from === -1) return ids;
  const next = ids.filter((x) => x !== id);
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, id);
  return next;
}

// Where a dragged row lands: rows are passed top to bottom with their
// heights; it moves past a neighbour once it's been dragged over half of it.
export function dropIndex(heights: number[], from: number, dy: number): number {
  let index = from;
  let remaining = dy;
  if (dy > 0) {
    while (index < heights.length - 1 && remaining > heights[index + 1] / 2) {
      remaining -= heights[index + 1];
      index += 1;
    }
  } else {
    while (index > 0 && -remaining > heights[index - 1] / 2) {
      remaining += heights[index - 1];
      index -= 1;
    }
  }
  return index;
}

// --- Filters, sort, groups ---------------------------------------------------------
export function filtersActive(f: DayFilters): number {
  return (f.tagIds.length ? 1 : 0) + (f.priorities.length ? 1 : 0) + (f.energies.length ? 1 : 0) + (f.status !== 'all' ? 1 : 0);
}

export function applyFilters(tasks: DailyTask[], date: string, f: DayFilters, doneOn: DoneOn): DailyTask[] {
  return tasks.filter((t) => {
    if (f.tagIds.length && !t.tagIds.some((id) => f.tagIds.includes(id))) return false;
    if (f.priorities.length && !f.priorities.includes(t.priority)) return false;
    if (f.energies.length && !(t.energy && f.energies.includes(t.energy))) return false;
    if (f.status === 'open' && doneOn(t, date)) return false;
    if (f.status === 'done' && !doneOn(t, date)) return false;
    return true;
  });
}

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2, none: 3 };
const ENERGY_RANK: Record<TaskEnergy, number> = { high: 0, medium: 1, low: 2 };

// `tasks` arrive in the day's manual order; other sorts keep it for ties.
export function sortTasks(tasks: DailyTask[], sortBy: SortBy): DailyTask[] {
  if (sortBy === 'manual') return tasks;
  const pos = new Map(tasks.map((t, i) => [t.id, i]));
  const key = (t: DailyTask): number => {
    if (sortBy === 'time') {
      if (t.allDay) return -1;
      if (!t.scheduledTime) return 24 * 60;
      const [h, m] = t.scheduledTime.split(':').map(Number);
      return h * 60 + m;
    }
    if (sortBy === 'priority') return PRIORITY_RANK[t.priority];
    return t.energy ? ENERGY_RANK[t.energy] : 3;
  };
  return [...tasks].sort((a, b) => key(a) - key(b) || pos.get(a.id)! - pos.get(b.id)!);
}

export interface TaskGroup {
  key: string;
  label: string;
  tasks: DailyTask[];
}

const PRIORITY_LABELS: Record<TaskPriority, string> = { high: 'High priority', medium: 'Medium priority', low: 'Low priority', none: 'No priority' };
const ENERGY_LABELS: Record<TaskEnergy | 'none', string> = { high: 'High energy', medium: 'Medium energy', low: 'Low energy', none: 'Energy not set' };

// Empty groups are left out. With tags, a task with two tags shows in both.
export function groupTasks(tasks: DailyTask[], groupBy: GroupBy, date: string, tags: TaskTag[], doneOn: DoneOn): TaskGroup[] {
  if (groupBy === 'none') return [{ key: 'all', label: '', tasks }];
  const groups: TaskGroup[] = [];
  const push = (key: string, label: string, list: DailyTask[]) => list.length && groups.push({ key, label, tasks: list });
  if (groupBy === 'status') {
    push('open', 'To do', tasks.filter((t) => !doneOn(t, date)));
    push('done', 'Done', tasks.filter((t) => doneOn(t, date)));
  } else if (groupBy === 'priority') {
    (['high', 'medium', 'low', 'none'] as TaskPriority[]).forEach((p) => push(p, PRIORITY_LABELS[p], tasks.filter((t) => t.priority === p)));
  } else if (groupBy === 'energy') {
    (['high', 'medium', 'low'] as TaskEnergy[]).forEach((e) => push(e, ENERGY_LABELS[e], tasks.filter((t) => t.energy === e)));
    push('none', ENERGY_LABELS.none, tasks.filter((t) => !t.energy));
  } else {
    for (const tag of [...tags].sort((a, b) => a.name.localeCompare(b.name))) push(tag.id, tag.name, tasks.filter((t) => t.tagIds.includes(tag.id)));
    const known = new Set(tags.map((t) => t.id));
    push('untagged', 'No tag', tasks.filter((t) => !t.tagIds.some((id) => known.has(id))));
  }
  return groups;
}

// --- Search -----------------------------------------------------------------
export interface SearchHit {
  task: DailyTask;
  date: string; // the occurrence to open: the task's own date, or a repeating task's next one from today
  where: 'title' | 'notes' | 'subtask' | 'context' | 'why';
}

// Every task, any date. Matches ignore case and accents.
export function searchTasks(tasks: DailyTask[], query: string, titleOf: TitleOf, today: string, limit = 50): SearchHit[] {
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = fold(query.trim());
  if (!q) return [];
  const hits: SearchHit[] = [];
  for (const task of tasks) {
    const where: SearchHit['where'] | undefined = fold(titleOf(task)).includes(q)
      ? 'title'
      : task.notes && fold(task.notes).includes(q)
        ? 'notes'
        : task.subtasks.some((s) => fold(s.title).includes(q))
          ? 'subtask'
          : task.context && fold(task.context).includes(q)
            ? 'context'
            : task.why && fold(task.why).includes(q)
              ? 'why'
              : undefined;
    if (!where) continue;
    const date = task.repeat === 'none' ? task.date : nextOccurrences(task, today, 1)[0] ?? task.date;
    hits.push({ task, date, where });
  }
  // Title matches first, then nearest date to today.
  const distance = (d: string) => Math.abs(Date.parse(d) - Date.parse(today));
  return hits.sort((a, b) => (a.where === 'title' ? 0 : 1) - (b.where === 'title' ? 0 : 1) || distance(a.date) - distance(b.date)).slice(0, limit);
}

// --- Plan my day ----------------------------------------------------------------
export interface DayLoad {
  plannedMinutes: number; // every task on the day with a time estimate (or a duration)
  remainingMinutes: number; // the ones not done yet
  withoutEstimate: number; // open tasks with no estimate, so the total may be low
  availableMinutes: number;
  overfull: boolean;
  message: string;
}

export const taskMinutes = (t: DailyTask): number => t.estimateMinutes ?? t.durationMinutes ?? 0;

const roughHours = (minutes: number): string => {
  const h = Math.round((minutes / 60) * 2) / 2; // to the nearest half hour
  if (h < 1) return `${Math.max(5, Math.round(minutes / 5) * 5)} minutes`;
  return `${h % 1 ? h.toFixed(1) : h} hour${h === 1 ? '' : 's'}`;
};

// Never shames: an overfull day is a gentle question, not a warning sign.
export function dayLoad(tasks: DailyTask[], date: string, availableMinutes: number, doneOn: DoneOn): DayLoad {
  const open = tasks.filter((t) => !doneOn(t, date));
  const plannedMinutes = tasks.reduce((sum, t) => sum + taskMinutes(t), 0);
  const remainingMinutes = open.reduce((sum, t) => sum + taskMinutes(t), 0);
  const withoutEstimate = open.filter((t) => !taskMinutes(t)).length;
  const overfull = remainingMinutes > availableMinutes;
  let message: string;
  if (tasks.length === 0) message = 'Nothing planned yet. A light day is a fine day.';
  else if (remainingMinutes === 0 && open.length === 0) message = 'Everything on this day is done.';
  else if (remainingMinutes === 0) message = 'Add time estimates to see how full the day is.';
  else if (overfull) message = `This is about ${roughHours(remainingMinutes)} of work, and you have about ${roughHours(availableMinutes)}. Move something?`;
  else message = `About ${roughHours(remainingMinutes)} of work left, with room to spare.`;
  return { plannedMinutes, remainingMinutes, withoutEstimate, availableMinutes, overfull, message };
}

// --- Carry-over -----------------------------------------------------------------
// One-off tasks from earlier days that weren't finished or let go, newest
// first. A repeating task's missed day isn't carried over: the next one
// comes round by itself.
export function carryOver(tasks: DailyTask[], today: string, doneOn: DoneOn, lookbackDays = 60): DailyTask[] {
  const since = addDaysISO(today, -lookbackDays);
  return tasks
    .filter((t) => t.repeat === 'none' && !t.linkedPlan && t.date < today && t.date >= since && occursOn(t, t.date) && !doneOn(t, t.date))
    .sort((a, b) => b.date.localeCompare(a.date));
}
