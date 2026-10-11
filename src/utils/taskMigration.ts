// Brings tasks saved by any earlier version of Ona up to the current shape,
// without losing anything. Runs when data loads from the phone and when
// records arrive from another device (which may still run an older version).
// Idempotent: a task that's already current comes back unchanged.
import type { AlarmSoundId, DailySubtask, TaskAttachment, DailyTask, TaskPriority, TaskReminder, TaskRepeat, TaskTag, TaskTemplate } from '../types/sections';

const REPEATS: TaskRepeat[] = ['none', 'daily', 'weekly', 'weekdays', 'customDays', 'monthly'];
const PRIORITIES: TaskPriority[] = ['none', 'low', 'medium', 'high'];

type Raw = Record<string, unknown>;

// A task as saved before v2 (one reminder, three repeat options, no tags).
export type LegacyDailyTask = Omit<
  DailyTask,
  'reminders' | 'completedAt' | 'letGoDates' | 'tagIds' | 'priority' | 'actualMinutes' | 'attachments' | 'feelingLinks' | 'moveCount' | 'repeat'
> & {
  repeat: 'none' | 'daily' | 'weekly';
  reminderMinutesBefore?: number;
  alarmSound?: AlarmSoundId;
};

const isObj = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const record = <T>(v: unknown): Record<string, T> => (isObj(v) ? (v as Record<string, T>) : {});
const optNum = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const optStr = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

function reminders(raw: Raw): TaskReminder[] {
  if (Array.isArray(raw.reminders)) {
    return raw.reminders.filter(isObj).flatMap((r, i) => {
      const minutesBefore = optNum(r.minutesBefore);
      if (minutesBefore === undefined) return [];
      return [{ id: optStr(r.id) ?? `reminder-${i}`, minutesBefore, ...(optStr(r.sound) ? { sound: r.sound as TaskReminder['sound'] } : {}) }];
    });
  }
  // Before v2: one reminder and one sound on the task itself.
  const minutesBefore = optNum(raw.reminderMinutesBefore);
  if (minutesBefore === undefined) return [];
  return [{ id: 'reminder-0', minutesBefore, ...(optStr(raw.alarmSound) ? { sound: raw.alarmSound as TaskReminder['sound'] } : {}) }];
}

function subtasks(v: unknown): DailySubtask[] {
  return Array.isArray(v)
    ? v.filter(isObj).filter((s) => typeof s.id === 'string').map((s) => ({ id: s.id as string, title: typeof s.title === 'string' ? s.title : '', done: !!s.done }))
    : [];
}

function attachments(v: unknown): TaskAttachment[] {
  return Array.isArray(v)
    ? v
        .filter(isObj)
        .filter((a) => typeof a.id === 'string' && (a.kind === 'photo' || a.kind === 'link') && typeof a.uri === 'string')
        .map((a) => ({ id: a.id as string, kind: a.kind as TaskAttachment['kind'], uri: a.uri as string, ...(optStr(a.label) ? { label: a.label as string } : {}) }))
    : [];
}

export function normalizeTask(input: unknown): DailyTask {
  const raw: Raw = isObj(input) ? input : {};
  const { reminderMinutesBefore: _legacyMinutes, alarmSound: _legacySound, ...rest } = raw;
  const repeat = REPEATS.includes(raw.repeat as TaskRepeat) ? (raw.repeat as TaskRepeat) : 'none';
  const task = {
    ...rest, // keeps anything a newer version added that this one doesn't know yet
    id: typeof raw.id === 'string' ? raw.id : `task-${Math.random().toString(36).slice(2)}`,
    date: typeof raw.date === 'string' ? raw.date : '1970-01-01',
    title: typeof raw.title === 'string' ? raw.title : '',
    done: !!raw.done,
    reminders: reminders(raw),
    notificationIds: strings(raw.notificationIds),
    completionNotes: record(raw.completionNotes),
    completedAt: record<string>(raw.completedAt),
    subtasks: subtasks(raw.subtasks),
    repeat,
    completedDates: strings(raw.completedDates),
    skippedDates: strings(raw.skippedDates),
    letGoDates: strings(raw.letGoDates),
    order: optNum(raw.order) ?? 0,
    tagIds: strings(raw.tagIds),
    priority: PRIORITIES.includes(raw.priority as TaskPriority) ? (raw.priority as TaskPriority) : 'none',
    actualMinutes: record<number>(raw.actualMinutes),
    attachments: attachments(raw.attachments),
    feelingLinks: record(raw.feelingLinks),
    moveCount: optNum(raw.moveCount) ?? 0,
  } as DailyTask;
  if (repeat === 'customDays') task.repeatDays = (Array.isArray(raw.repeatDays) ? raw.repeatDays : []).filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6);
  return task;
}

export function normalizeTasks(value: unknown): DailyTask[] {
  return Array.isArray(value) ? value.map(normalizeTask) : [];
}

export function normalizeTags(value: unknown): TaskTag[] {
  return Array.isArray(value)
    ? value.filter(isObj).filter((t) => typeof t.id === 'string' && typeof t.name === 'string').map((t) => ({
        ...t,
        id: t.id as string,
        name: t.name as string,
        color: typeof t.color === 'string' ? t.color : '#4F9B82',
        createdAt: typeof t.createdAt === 'string' ? t.createdAt : new Date(0).toISOString(),
      }))
    : [];
}

export function normalizeTemplates(value: unknown): TaskTemplate[] {
  return Array.isArray(value)
    ? value.filter(isObj).filter((t) => typeof t.id === 'string' && isObj(t.fields)).map((t) => {
        const f = t.fields as Raw;
        return {
          ...t,
          id: t.id as string,
          name: typeof t.name === 'string' ? t.name : 'Template',
          createdAt: typeof t.createdAt === 'string' ? t.createdAt : new Date(0).toISOString(),
          fields: {
            ...f,
            title: typeof f.title === 'string' ? f.title : '',
            tagIds: strings(f.tagIds),
            priority: PRIORITIES.includes(f.priority as TaskPriority) ? (f.priority as TaskPriority) : 'none',
            subtaskTitles: strings(f.subtaskTitles),
            reminders: reminders({ reminders: f.reminders }).map(({ id: _id, ...r }) => r),
          },
        } as TaskTemplate;
      })
    : [];
}
