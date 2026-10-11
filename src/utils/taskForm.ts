// The task page's working copy of a task, and the rules around it: what
// counts as a change, what's required, start/end/duration maths. Pure, so
// the page stays thin and all of this is tested directly.
import type { DailySubtask, DailyTask, TaskAttachment, TaskEnergy, TaskPriority, TaskReminder, TaskRepeat, TaskTemplate, TaskTemplateFields, DailyTaskLink } from '../types/sections';
import type { TaskPatch } from '../store/useDailyPlanningStore';

export interface TaskForm {
  title: string;
  date: string;
  allDay: boolean;
  scheduledTime?: string;
  durationMinutes?: number;
  tagIds: string[];
  priority: TaskPriority;
  energy?: TaskEnergy;
  estimateMinutes?: number;
  subtasks: DailySubtask[];
  reminders: TaskReminder[];
  repeat: TaskRepeat;
  repeatDays: number[];
  linkedPlan?: DailyTaskLink;
  context: string;
  attachments: TaskAttachment[];
  why: string;
  notes: string;
}

export const ESTIMATE_PRESETS = [5, 15, 30, 60];
export const DURATION_PRESETS = [15, 30, 45, 60, 90];
export const REMINDER_PRESETS = [0, 5, 10, 15, 30, 60, 1440];
export const CONTEXT_SUGGESTIONS = ['At home', 'At work', 'Phone call', 'Computer', 'Out and about'];

export function emptyForm(date: string, title = ''): TaskForm {
  return {
    title,
    date,
    allDay: false,
    tagIds: [],
    priority: 'none',
    subtasks: [],
    reminders: [],
    repeat: 'none',
    repeatDays: [],
    context: '',
    attachments: [],
    why: '',
    notes: '',
  };
}

// `title` is passed in because a linked task's title lives on its Plan Builder step.
export function formFromTask(task: DailyTask, title: string): TaskForm {
  return {
    title,
    date: task.date,
    allDay: !!task.allDay,
    scheduledTime: task.scheduledTime,
    durationMinutes: task.durationMinutes,
    tagIds: [...task.tagIds],
    priority: task.priority,
    energy: task.energy,
    estimateMinutes: task.estimateMinutes,
    subtasks: task.subtasks.map((s) => ({ ...s })),
    reminders: task.reminders.map((r) => ({ ...r })),
    repeat: task.repeat,
    repeatDays: [...(task.repeatDays ?? [])],
    linkedPlan: task.linkedPlan,
    context: task.context ?? '',
    attachments: task.attachments.map((a) => ({ ...a })),
    why: task.why ?? '',
    notes: task.notes ?? '',
  };
}

// A template fills the form; tags that no longer exist are dropped.
export function applyTemplate(form: TaskForm, tpl: TaskTemplate, knownTagIds: string[], newId: (prefix: string) => string): TaskForm {
  const f = tpl.fields;
  return {
    ...form,
    title: f.title || tpl.name,
    durationMinutes: f.durationMinutes,
    tagIds: f.tagIds.filter((id) => knownTagIds.includes(id)),
    priority: f.priority,
    energy: f.energy,
    estimateMinutes: f.estimateMinutes,
    subtasks: f.subtaskTitles.map((title) => ({ id: newId('subtask'), title, done: false })),
    reminders: f.reminders.map((r) => ({ ...r, id: newId('reminder') })),
    context: f.context ?? '',
    why: f.why ?? '',
    notes: f.notes ?? '',
  };
}

export function templateFieldsFromForm(form: TaskForm): TaskTemplateFields {
  return {
    title: form.title.trim(),
    notes: form.notes.trim() || undefined,
    durationMinutes: form.durationMinutes,
    tagIds: [...form.tagIds],
    priority: form.priority,
    energy: form.energy,
    estimateMinutes: form.estimateMinutes,
    context: form.context.trim() || undefined,
    why: form.why.trim() || undefined,
    subtaskTitles: form.subtasks.map((s) => s.title),
    reminders: form.reminders.map(({ id: _id, ...r }) => r),
  };
}

// What gets saved. Empty text becomes "not set"; no time means no reminders
// and no end; all day keeps the time out of the timeline.
export function formToPatch(form: TaskForm): TaskPatch {
  const timed = !form.allDay && !!form.scheduledTime;
  return {
    title: form.title.trim(),
    date: form.date,
    allDay: form.allDay || undefined,
    scheduledTime: form.allDay ? undefined : form.scheduledTime,
    durationMinutes: timed ? form.durationMinutes : undefined,
    tagIds: [...form.tagIds],
    priority: form.priority,
    energy: form.energy,
    estimateMinutes: form.estimateMinutes,
    subtasks: form.subtasks.filter((s) => s.title.trim()).map((s) => ({ ...s, title: s.title.trim() })),
    reminders: timed ? form.reminders : [],
    repeat: form.repeat,
    repeatDays: form.repeat === 'customDays' ? [...form.repeatDays].sort() : undefined,
    linkedPlan: form.linkedPlan,
    context: form.context.trim() || undefined,
    attachments: form.attachments,
    why: form.why.trim() || undefined,
    notes: form.notes.trim() ? form.notes : undefined,
  };
}

// Stable comparison of what would be saved, so typing and deleting the same
// character doesn't count as a change.
export function isDirty(form: TaskForm, initial: TaskForm): boolean {
  return JSON.stringify(formToPatch(form)) !== JSON.stringify(formToPatch(initial));
}

export interface FormErrors {
  title?: string;
  repeatDays?: string;
}

export function validateForm(form: TaskForm): FormErrors {
  const errors: FormErrors = {};
  // A linked task takes the step's title; it still can't be blank.
  if (!form.title.trim()) errors.title = 'Give the task a title.';
  if (form.repeat === 'customDays' && form.repeatDays.length === 0) errors.repeatDays = 'Pick at least one day.';
  return errors;
}

export const hasErrors = (e: FormErrors) => Object.keys(e).length > 0;

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const fromMinutes = (total: number) => {
  const t = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

// The end time, wrapping past midnight (23:30 + 60 min = 00:30).
export function endTimeOf(start: string | undefined, durationMinutes: number | undefined): string | undefined {
  if (!start || !durationMinutes) return undefined;
  return fromMinutes(toMinutes(start) + durationMinutes);
}

// Picking an end time sets the duration; an end before the start means the
// next day (a night shift), and the same time means no duration.
export function durationBetween(start: string, end: string): number | undefined {
  const d = (toMinutes(end) - toMinutes(start) + 1440) % 1440;
  return d === 0 ? undefined : d;
}

export function formatMinutes(total: number): string {
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function reminderText(minutesBefore: number): string {
  if (minutesBefore === 0) return 'At the start time';
  if (minutesBefore % 1440 === 0) return minutesBefore === 1440 ? '1 day before' : `${minutesBefore / 1440} days before`;
  return `${formatMinutes(minutesBefore)} before`;
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

// Tags the user has used most (then most recently created) first, for suggestions.
export function suggestTags<T extends { id: string; createdAt: string }>(tags: T[], tasks: { tagIds: string[] }[], exclude: string[], limit = 8): T[] {
  const uses = new Map<string, number>();
  for (const t of tasks) for (const id of t.tagIds) uses.set(id, (uses.get(id) ?? 0) + 1);
  return tags
    .filter((t) => !exclude.includes(t.id))
    .sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

// A link the user typed, made openable ("example.com" -> "https://example.com").
// Returns undefined for something that isn't a web address.
export function normalizeLink(input: string): string | undefined {
  const s = input.trim();
  if (!s || /\s/.test(s)) return undefined;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;
  return /^https?:\/\/[^/]+\.[^/]+/i.test(withScheme) || /^https?:\/\/localhost/i.test(withScheme) ? withScheme : undefined;
}
