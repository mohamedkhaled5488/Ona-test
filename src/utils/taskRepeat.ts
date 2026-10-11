// When a task happens: repeat rules, occurrences and the reminder slots they
// need. Pure functions on ISO dates (see date.ts: no time zone or
// daylight-saving drift).
import type { DailyTask, TaskRepeat } from '../types/sections';
import { addDaysISO, daysInMonthISO, weekdayOfISO } from './date';

type RepeatFields = Pick<DailyTask, 'date' | 'repeat' | 'repeatDays' | 'repeatUntil' | 'skippedDates' | 'letGoDates'>;

export const WEEKDAYS = [1, 2, 3, 4, 5];

// Whether the repeat rule alone lands on `date` (ignores skipped/let-go days).
export function ruleMatches(task: Pick<DailyTask, 'date' | 'repeat' | 'repeatDays' | 'repeatUntil'>, date: string): boolean {
  if (date < task.date) return false;
  if (task.repeatUntil && date > task.repeatUntil) return false;
  switch (task.repeat) {
    case 'none':
      return date === task.date;
    case 'daily':
      return true;
    case 'weekly':
      return weekdayOfISO(date) === weekdayOfISO(task.date);
    case 'weekdays':
      return WEEKDAYS.includes(weekdayOfISO(date));
    case 'customDays':
      return (task.repeatDays ?? []).includes(weekdayOfISO(date));
    case 'monthly': {
      // The 31st falls on the 30th, the 29th in a leap February, and so on.
      const anchor = Number(task.date.slice(8, 10));
      return Number(date.slice(8, 10)) === Math.min(anchor, daysInMonthISO(date));
    }
    default:
      return false;
  }
}

// Whether a task (one-off or repeating) is on the plan for `date`.
export function occursOn(task: RepeatFields, date: string): boolean {
  // Tolerates a task that hasn't been through normalizeTask yet.
  if (task.skippedDates?.includes(date) || task.letGoDates?.includes(date)) return false;
  return ruleMatches(task, date);
}

// The next occurrences on or after `from`, at most `max`, looking no further
// than `horizonDays` ahead.
export function nextOccurrences(task: RepeatFields, from: string, max: number, horizonDays = 400): string[] {
  const out: string[] = [];
  const start = from > task.date ? from : task.date;
  for (let i = 0; i <= horizonDays && out.length < max; i++) {
    const d = addDaysISO(start, i);
    if (task.repeatUntil && d > task.repeatUntil) break;
    if (occursOn(task, d)) out.push(d);
  }
  return out;
}

export const REPEAT_LABELS: Record<TaskRepeat, string> = {
  none: 'Once',
  daily: 'Daily',
  weekdays: 'Weekdays',
  weekly: 'Weekly',
  customDays: 'Custom days',
  monthly: 'Monthly',
};

// How to schedule a task's reminders. The phone can repeat a notification
// daily or weekly by itself; anything else (monthly, a series with an end,
// a one-off) becomes separate dated notifications for the next few
// occurrences, topped up whenever Ona starts (refreshRollingReminders).
export interface ReminderSlot {
  date: string; // the occurrence the reminder belongs to (or the first one, for repeating slots)
  repeat: 'none' | 'daily' | 'weekly';
}

export const ROLLING_REMINDER_COUNT = 8;

export function reminderSlots(task: RepeatFields & Pick<DailyTask, 'completedDates'>, today: string, oneOffDone: boolean): ReminderSlot[] {
  if (task.repeat === 'none') return oneOffDone || task.letGoDates.includes(task.date) ? [] : [{ date: task.date, repeat: 'none' }];
  if (!task.repeatUntil) {
    if (task.repeat === 'daily') return [{ date: task.date, repeat: 'daily' }];
    if (task.repeat === 'weekly') return [{ date: task.date, repeat: 'weekly' }];
    if (task.repeat === 'weekdays' || task.repeat === 'customDays') {
      const days = task.repeat === 'weekdays' ? WEEKDAYS : task.repeatDays ?? [];
      // One weekly notification per weekday, anchored on its first occurrence.
      return days
        .map((wd) => nextOccurrences({ ...task, repeat: 'customDays', repeatDays: [wd], skippedDates: [], letGoDates: [] }, task.date, 1, 7)[0])
        .filter((d): d is string => !!d)
        .sort()
        .map((date) => ({ date, repeat: 'weekly' as const }));
    }
  }
  return usesRollingReminders(task)
    ? nextOccurrences({ ...task, skippedDates: [...task.skippedDates, ...task.completedDates] }, today, ROLLING_REMINDER_COUNT).map((date) => ({
        date,
        repeat: 'none' as const,
      }))
    : [];
}

// Tasks whose reminders are scheduled a few at a time and need topping up.
export function usesRollingReminders(task: Pick<DailyTask, 'repeat' | 'repeatUntil'>): boolean {
  return task.repeat === 'monthly' || (task.repeat !== 'none' && !!task.repeatUntil);
}

// Occurrences the user let go of, newest first (Settings → Daily Planning → archive).
export function letGoArchive(tasks: DailyTask[]): { task: DailyTask; date: string }[] {
  const out: { task: DailyTask; date: string }[] = [];
  for (const task of tasks) for (const date of task.letGoDates) out.push({ task, date });
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

// Every subtask ticked (and at least one exists): time to offer completing the parent.
export function allSubtasksDone(task: Pick<DailyTask, 'subtasks'>): boolean {
  return task.subtasks.length > 0 && task.subtasks.every((s) => s.done);
}
