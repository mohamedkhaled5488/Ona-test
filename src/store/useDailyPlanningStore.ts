import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  AlarmSoundId,
  DailyTask,
  DayTemplate,
  TaskCompletionNote,
  TaskFeelingLink,
  TaskReminder,
  TaskRepeat,
  TaskTag,
  TaskTemplate,
  TaskTemplateFields,
} from '../types/sections';
import { mockDailyTasks } from '../data/mockData';
import { STARTER_TASK_TEMPLATES } from '../data/taskTemplates';
import { planColorPalette } from '../data/planStepColors';
import { genId } from '../utils/id';
import { addDaysISO, daysBetweenISODates, todayISO } from '../utils/date';
import { cancelReminders, scheduleReminder } from '../utils/notifications';
import { occursOn, reminderSlots, usesRollingReminders } from '../utils/taskRepeat';
import { normalizeTask } from '../utils/taskMigration';
import { moveInDay, sortForDay } from '../utils/dayView';
import { renameTaskTagInFeelings } from '../utils/taskFeelings';
import { usePlanStore, selectStepAtPath } from './usePlanStore';

export function resolveTaskTitle(task: DailyTask): string {
  if (!task.linkedPlan) return task.title;
  const plan = usePlanStore.getState().plans.find((p) => p.id === task.linkedPlan!.planId);
  return (plan && selectStepAtPath(plan.steps, task.linkedPlan.path)?.title) || 'Plan step';
}

// Whether a task (one-off or repeating) is on the plan for `date`.
export function taskAppliesToDate(task: DailyTask, date: string): boolean {
  return occursOn(task, date);
}

export function resolveTaskDone(task: DailyTask, forDate: string): boolean {
  if (task.linkedPlan) {
    const plan = usePlanStore.getState().plans.find((p) => p.id === task.linkedPlan!.planId);
    return !!(plan && selectStepAtPath(plan.steps, task.linkedPlan.path)?.done);
  }
  if (task.repeat !== 'none') return task.completedDates.includes(forDate);
  return task.done;
}

// The fields a person edits on the task page. Dates and history (completions,
// skips, feelings) are changed only through their own actions.
export type TaskPatch = Partial<
  Pick<
    DailyTask,
    | 'title'
    | 'date'
    | 'scheduledTime'
    | 'durationMinutes'
    | 'allDay'
    | 'reminders'
    | 'repeat'
    | 'repeatDays'
    | 'notes'
    | 'tagIds'
    | 'priority'
    | 'energy'
    | 'estimateMinutes'
    | 'context'
    | 'why'
    | 'attachments'
    | 'subtasks'
    | 'linkedPlan'
  >
>;

// For a repeating task: change only this day, this day and every later one,
// or the whole series (past days included).
export type EditScope = 'this' | 'future' | 'all';

export type TaskDraft = TaskPatch & { fromTemplateId?: string };

interface DailyPlanningState {
  tasks: DailyTask[];
  tags: TaskTag[];
  taskTemplates: TaskTemplate[];
  hiddenStarterTemplates: string[];
  dayTemplates: DayTemplate[];
  dayReflections: Record<string, string>; // ISO date -> one-line reflection
  // ISO date -> task ids in the order the user arranged that day (see utils/dayView.ts).
  dayOrder: Record<string, string[]>;
  // Re-applies Settings → Notifications (on/off, quiet hours, default sound) to every task reminder.
  resyncAllReminders: () => Promise<void>;
  // Tops up reminders that are scheduled a few occurrences at a time (monthly, series with an end).
  refreshRollingReminders: () => Promise<void>;

  addTask: (date: string, title: string, options?: TaskDraft) => string | undefined; // the new id; undefined for a blank title
  addLinkedTask: (date: string, planId: string, path: string[]) => string; // returns the (possibly pre-existing) task id
  // Applies the task page's edits. For a repeating task `scope` says which
  // days change; `forDate` is the day being edited. Returns the id that now
  // holds that day (a new one when only this day, or the future, was split off).
  updateTask: (id: string, patch: TaskPatch, scope?: EditScope, forDate?: string) => string;
  toggleTask: (id: string, forDate: string) => boolean; // returns whether the occurrence is now done
  updateTaskTitle: (id: string, title: string) => void;
  setScheduledTime: (id: string, time: string | undefined) => void;
  setReminders: (id: string, reminders: TaskReminder[]) => void;
  // The single-reminder controls from before v2: they edit the first reminder.
  setReminder: (id: string, minutesBefore: number | undefined) => void;
  setAlarmSound: (id: string, soundId: AlarmSoundId) => void;
  // Changes (or stops) a task's recurrence after creation. `forDate` anchors
  // the transition: switching to 'none' carries over that date's completion
  // and the task becomes a one-off from then on; switching a one-off task
  // into a repeat starts repeating from that date.
  setRepeat: (id: string, repeat: TaskRepeat, forDate: string, repeatDays?: number[]) => void;
  setCompletionNote: (id: string, date: string, note: TaskCompletionNote | undefined) => void;
  setActualMinutes: (id: string, date: string, minutes: number | undefined) => void;
  setFeelingLink: (id: string, date: string, which: keyof TaskFeelingLink, entryId: string | undefined) => void;
  // "Start" times a task; stopping (or completing it) adds the time to that day's actual minutes.
  startTask: (id: string, date: string) => void;
  stopTask: (id: string) => number; // minutes added
  deleteTask: (id: string) => void;
  // Deletes one day of a repeating task, or that day and every later one.
  deleteOccurrence: (id: string, date: string, scope: Exclude<EditScope, 'all'>) => void;
  restoreTasks: (tasks: DailyTask[]) => void;
  moveToTomorrow: (id: string, fromDate: string) => void;
  // Moves one occurrence to any date, at a chosen time (undefined = no time).
  // A recurring task keeps repeating — only this occurrence moves, as a
  // one-off copy, same as moving it to tomorrow.
  rescheduleTask: (id: string, fromDate: string, toDate: string, time: string | undefined) => void;
  moveIncompleteToTomorrow: (date: string) => number;
  // "Let go": archived without penalty — a choice, not a failure.
  letGo: (id: string, date: string) => void;
  undoLetGo: (id: string, date: string) => void;
  reorderTask: (date: string, id: string, direction: -1 | 1) => void;
  // Drag to reorder: moves `id` to `toIndex` among that day's tasks.
  moveTaskInDay: (date: string, id: string, toIndex: number) => void;

  addSubtask: (taskId: string, title: string) => void;
  toggleSubtask: (taskId: string, subtaskId: string) => void;
  deleteSubtask: (taskId: string, subtaskId: string) => void;
  moveSubtask: (taskId: string, subtaskId: string, toIndex: number) => void;

  // Tags. Names are unique ignoring case; adding an existing name returns its id.
  addTag: (name: string, color?: string) => string | undefined;
  renameTag: (id: string, name: string) => 'ok' | 'empty' | 'taken';
  setTagColor: (id: string, color: string) => void;
  // Every task tagged `fromId` gets `intoId` instead, and `fromId` is removed.
  mergeTags: (fromId: string, intoId: string) => void;
  // Removes the tag from every task; the tasks themselves stay.
  deleteTag: (id: string) => void;

  saveTaskAsTemplate: (taskId: string, name: string) => string | undefined;
  addTaskTemplate: (name: string, fields: TaskTemplateFields) => string;
  addTaskFromTemplate: (date: string, templateId: string) => string | undefined;
  deleteTaskTemplate: (templateId: string) => void;
  setStarterTemplateHidden: (templateId: string, hidden: boolean) => void;

  saveDayAsTemplate: (date: string, name: string) => void;
  applyTemplate: (date: string, templateId: string) => void;

  setDayReflection: (date: string, text: string) => void;
}

const blankTask = (date: string, order: number) => ({
  subtasks: [],
  notificationIds: [],
  completionNotes: {},
  completedAt: {},
  completedDates: [],
  skippedDates: [],
  letGoDates: [],
  tagIds: [],
  priority: 'none' as const,
  reminders: [],
  actualMinutes: {},
  attachments: [],
  feelingLinks: {},
  moveCount: 0,
  order,
  date,
});

const nextOrder = (tasks: DailyTask[], date: string) => tasks.filter((t) => t.date === date).length;

// Per-date history, split at `date`: [before, from date on].
function splitByDate<T>(map: Record<string, T>, date: string): [Record<string, T>, Record<string, T>] {
  const before: Record<string, T> = {};
  const after: Record<string, T> = {};
  for (const [d, v] of Object.entries(map)) (d < date ? before : after)[d] = v;
  return [before, after];
}

function pickDate<T>(map: Record<string, T>, date: string): Record<string, T> {
  return date in map ? { [date]: map[date] } : {};
}

export const findTask = (tasks: DailyTask[], id: string) => tasks.find((t) => t.id === id);

// A day's task ids in the user's order.
const dayIds = (state: Pick<DailyPlanningState, 'tasks' | 'dayOrder'>, date: string) =>
  sortForDay(state.tasks.filter((t) => occursOn(t, date)), date, state.dayOrder).map((t) => t.id);

export const visibleStarterTemplates = (hidden: string[]) => STARTER_TASK_TEMPLATES.filter((t) => !hidden.includes(t.id));

export const useDailyPlanningStore = create<DailyPlanningState>()(
  immer((set, get) => {
    // Cancel whatever was scheduled for a task and schedule afresh from its
    // current time/reminders/done state. Fire-and-forget: reminders are a
    // convenience and must never block the UI. Runs one at a time per task —
    // two overlapping runs would both schedule, and the first notification
    // would be orphaned (still firing, with no id left to cancel it).
    const pending = new Map<string, Promise<void>>();
    const syncReminder = (taskId: string): Promise<void> => {
      const run = (pending.get(taskId) ?? Promise.resolve()).then(() => syncReminderNow(taskId));
      const tracked = run.finally(() => {
        if (pending.get(taskId) === tracked) pending.delete(taskId);
      });
      pending.set(taskId, tracked);
      return tracked;
    };
    const syncReminderNow = async (taskId: string) => {
      const task = findTask(get().tasks, taskId);
      if (!task) return;
      await cancelReminders(task.notificationIds);

      const ids: string[] = [];
      if (task.scheduledTime && !task.allDay && task.reminders.length) {
        const slots = reminderSlots(task, todayISO(), task.repeat === 'none' && resolveTaskDone(task, task.date));
        for (const slot of slots) {
          for (const r of task.reminders) {
            ids.push(
              ...(await scheduleReminder({
                feature: 'tasks',
                alarm: true,
                title: resolveTaskTitle(task),
                date: slot.date,
                scheduledTime: task.scheduledTime,
                minutesBefore: r.minutesBefore,
                repeat: slot.repeat,
                soundId: r.sound,
              }))
            );
          }
        }
      }

      set((state) => {
        const t = findTask(state.tasks, taskId);
        if (t) t.notificationIds = ids;
      });
    };

    // Changes one task in place, then refreshes its reminders.
    const mutate = (id: string, fn: (t: DailyTask, state: DailyPlanningState) => void, reschedule = true) => {
      set((state) => {
        const t = findTask(state.tasks, id);
        if (t) fn(t, state);
      });
      if (reschedule) void syncReminder(id);
    };

    // A copy of a repeating task's single day as a one-off, carrying that
    // day's history with it. The original skips the day from then on.
    const detachOccurrence = (state: DailyPlanningState, t: DailyTask, date: string, toDate: string): DailyTask => {
      if (!t.skippedDates.includes(date)) t.skippedDates.push(date);
      return {
        ...t,
        id: genId('task'),
        repeat: 'none',
        repeatDays: undefined,
        repeatUntil: undefined,
        seriesId: t.seriesId ?? t.id,
        date: toDate,
        done: t.completedDates.includes(date),
        completedDates: [],
        skippedDates: [],
        letGoDates: [],
        notificationIds: [],
        completionNotes: pickDate(t.completionNotes, date),
        completedAt: pickDate(t.completedAt, date),
        actualMinutes: pickDate(t.actualMinutes, date),
        feelingLinks: pickDate(t.feelingLinks, date),
        subtasks: t.subtasks.map((s) => ({ ...s, id: genId('subtask'), done: false })),
        reminders: t.reminders.map((r) => ({ ...r })),
        tagIds: [...t.tagIds],
        attachments: t.attachments.map((a) => ({ ...a })),
        moveCount: 0,
        order: nextOrder(state.tasks, toDate),
        createdAt: new Date().toISOString(),
      };
    };

    const applyPatch = (t: DailyTask, patch: TaskPatch) => {
      Object.assign(t, patch);
      if (!t.scheduledTime) t.reminders = []; // a reminder is relative to the time
      if (t.repeat !== 'customDays') delete t.repeatDays;
      if (t.title) t.title = t.title.trim();
    };

    return {
      tasks: mockDailyTasks.map(normalizeTask),
      tags: [],
      taskTemplates: [],
      hiddenStarterTemplates: [],
      dayTemplates: [],
      dayReflections: {},
      dayOrder: {},

      resyncAllReminders: async () => {
        await Promise.all(get().tasks.map((t) => syncReminder(t.id)));
      },

      refreshRollingReminders: async () => {
        await Promise.all(get().tasks.filter((t) => t.reminders.length && usesRollingReminders(t)).map((t) => syncReminder(t.id)));
      },

      addTask: (date, title, options) => {
        const trimmed = title.trim();
        if (!trimmed) return undefined;
        const id = genId('task');
        set((state) => {
          const task: DailyTask = {
            id,
            title: trimmed,
            done: false,
            repeat: 'none',
            ...blankTask(date, nextOrder(state.tasks, date)),
            createdAt: new Date().toISOString(),
          };
          if (options) applyPatch(task, { ...options, title: trimmed, date: options.date ?? date });
          if (options?.fromTemplateId) task.fromTemplateId = options.fromTemplateId;
          state.tasks.push(task);
        });
        void syncReminder(id);
        return id;
      },

      addLinkedTask: (date, planId, path) => {
        const existing = get().tasks.find(
          (t) => t.date === date && t.linkedPlan?.planId === planId && t.linkedPlan?.path.join('/') === path.join('/')
        );
        if (existing) return existing.id;
        const id = genId('task');
        // "Why this matters" starts as the plan's motive.
        const motive = usePlanStore.getState().plans.find((p) => p.id === planId)?.motive?.trim();
        set((state) => {
          state.tasks.push({
            id,
            title: '',
            done: false,
            repeat: 'none',
            linkedPlan: { planId, path },
            ...blankTask(date, nextOrder(state.tasks, date)),
            ...(motive ? { why: motive } : {}),
            createdAt: new Date().toISOString(),
          });
        });
        return id;
      },

      updateTask: (id, patch, scope = 'all', forDate) => {
        const task = findTask(get().tasks, id);
        if (!task) return id;
        // A linked task's title lives on its Plan Builder step (unless this
        // edit unlinks it, or links it to a different step).
        const { title, ...rest } = patch;
        const linked = 'linkedPlan' in patch ? patch.linkedPlan : task.linkedPlan;
        const sameStep = !!linked && !!task.linkedPlan && linked.planId === task.linkedPlan.planId && linked.path.join('/') === task.linkedPlan.path.join('/');
        if (title !== undefined && sameStep) {
          usePlanStore.getState().updateStep(linked!.planId, linked!.path, { title });
        }
        const local: TaskPatch = linked || title === undefined ? rest : { ...rest, title };
        if (linked && !task.linkedPlan) local.title = '';

        const date = forDate ?? task.date;
        if (task.repeat === 'none' || scope === 'all' || (scope === 'future' && date <= task.date)) {
          // For a series, the page's date is the day being edited: moving it
          // shifts the whole series by the same number of days.
          if (task.repeat !== 'none' && local.date !== undefined) {
            if (local.date === date) delete local.date;
            else local.date = addDaysISO(task.date, daysBetweenISODates(date, local.date));
          }
          mutate(id, (t, state) => {
            if (local.date && local.date !== t.date) t.order = nextOrder(state.tasks, local.date);
            if (local.repeat && local.repeat !== 'none' && t.repeat === 'none') t.completedDates = t.done ? [t.date] : [];
            if (local.repeat === 'none' && t.repeat !== 'none') {
              t.done = t.completedDates.includes(t.date);
              t.completedDates = [];
              t.skippedDates = [];
            }
            applyPatch(t, local);
          });
          return id;
        }

        let newId = id;
        set((state) => {
          const t = findTask(state.tasks, id);
          if (!t) return;
          if (scope === 'this') {
            const copy = detachOccurrence(state, t, date, local.date ?? date);
            applyPatch(copy, { ...local, repeat: 'none' });
            state.tasks.push(copy);
            newId = copy.id;
            return;
          }
          // 'future': the old series ends the day before; a new one starts
          // here (or on the new date, if this day was moved).
          const start = local.date ?? date;
          const cut = start < date ? start : date;
          const [notesBefore, notesAfter] = splitByDate(t.completionNotes, cut);
          const [atBefore, atAfter] = splitByDate(t.completedAt, cut);
          const [minBefore, minAfter] = splitByDate(t.actualMinutes, cut);
          const [feelBefore, feelAfter] = splitByDate(t.feelingLinks, cut);
          const seriesId = t.seriesId ?? t.id;
          const next: DailyTask = {
            ...t,
            id: genId('task'),
            seriesId,
            date: start,
            notificationIds: [],
            completedDates: t.completedDates.filter((d) => d >= cut),
            skippedDates: t.skippedDates.filter((d) => d >= cut),
            letGoDates: t.letGoDates.filter((d) => d >= cut),
            completionNotes: notesAfter,
            completedAt: atAfter,
            actualMinutes: minAfter,
            feelingLinks: feelAfter,
            subtasks: t.subtasks.map((s) => ({ ...s })),
            reminders: t.reminders.map((r) => ({ ...r })),
            tagIds: [...t.tagIds],
            attachments: t.attachments.map((a) => ({ ...a })),
            createdAt: new Date().toISOString(),
          };
          if (local.repeat === 'none') {
            next.done = next.completedDates.includes(start);
            next.completedDates = [];
            next.skippedDates = [];
          }
          applyPatch(next, { ...local, date: start });
          next.order = nextOrder(state.tasks, start);
          t.seriesId = seriesId;
          t.repeatUntil = addDaysISO(cut, -1);
          t.completedDates = t.completedDates.filter((d) => d < cut);
          t.skippedDates = t.skippedDates.filter((d) => d < cut);
          t.letGoDates = t.letGoDates.filter((d) => d < cut);
          t.completionNotes = notesBefore;
          t.completedAt = atBefore;
          t.actualMinutes = minBefore;
          t.feelingLinks = feelBefore;
          state.tasks.push(next);
          newId = next.id;
        });
        void syncReminder(id);
        void syncReminder(newId);
        return newId;
      },

      // Linked tasks have no local done/title of their own — the Plan Builder
      // step is the single source of truth, so both directions of the "live
      // link" fall out of always reading through to it rather than syncing copies.
      // Recurring tasks track completion per-occurrence in completedDates.
      toggleTask: (id, forDate) => {
        const task = findTask(get().tasks, id);
        if (!task) return false;
        if (task.linkedPlan) {
          usePlanStore.getState().toggleStepDone(task.linkedPlan.planId, task.linkedPlan.path);
        } else {
          set((state) => {
            const t = findTask(state.tasks, id);
            if (!t) return;
            if (t.repeat !== 'none') {
              t.completedDates = t.completedDates.includes(forDate) ? t.completedDates.filter((d) => d !== forDate) : [...t.completedDates, forDate];
            } else {
              t.done = !t.done;
            }
          });
        }
        const nowDone = resolveTaskDone(findTask(get().tasks, id)!, forDate);
        if (nowDone && task.running?.date === forDate) get().stopTask(id);
        set((state) => {
          const t = findTask(state.tasks, id);
          if (!t) return;
          if (nowDone) t.completedAt[forDate] = new Date().toISOString();
          else delete t.completedAt[forDate];
        });
        void syncReminder(id);
        return nowDone;
      },

      updateTaskTitle: (id, title) => {
        const task = findTask(get().tasks, id);
        if (!task) return;
        if (task.linkedPlan) {
          usePlanStore.getState().updateStep(task.linkedPlan.planId, task.linkedPlan.path, { title });
          void syncReminder(id);
          return;
        }
        // A scheduled reminder's content is captured at schedule time, so a
        // title edit needs to reschedule for the new text to actually show up.
        mutate(id, (t) => {
          t.title = title;
        });
      },

      setScheduledTime: (id, time) =>
        mutate(id, (t) => {
          t.scheduledTime = time;
          if (!time) t.reminders = []; // a reminder is relative to the time
        }),

      setReminders: (id, reminders) =>
        mutate(id, (t) => {
          t.reminders = t.scheduledTime ? reminders : [];
        }),

      setReminder: (id, minutesBefore) =>
        mutate(id, (t) => {
          if (minutesBefore === undefined) t.reminders = t.reminders.slice(1);
          else if (t.reminders[0]) t.reminders[0].minutesBefore = minutesBefore;
          else t.reminders = [{ id: genId('reminder'), minutesBefore }];
        }),

      setAlarmSound: (id, soundId) =>
        mutate(id, (t) => {
          if (t.reminders[0]) t.reminders[0].sound = soundId;
        }),

      setRepeat: (id, repeat, forDate, repeatDays) =>
        mutate(id, (t) => {
          if (t.repeat === repeat && repeat !== 'customDays') return;
          if (repeat === 'none') {
            // Stop recurring: anchor to this occurrence, carrying over
            // whether *this* date was already completed.
            const wasDone = t.completedDates.includes(forDate);
            t.date = forDate;
            t.done = wasDone;
            t.completedDates = [];
            t.skippedDates = [];
            t.repeatUntil = undefined;
          } else if (t.repeat === 'none') {
            // Start repeating from this date forward.
            t.date = forDate;
            t.completedDates = t.done ? [forDate] : [];
          }
          t.repeat = repeat;
          if (repeat === 'customDays') t.repeatDays = [...(repeatDays ?? [])].sort();
          else delete t.repeatDays;
        }),

      setCompletionNote: (id, date, note) =>
        mutate(
          id,
          (t) => {
            if (note && (note.comment || note.evaluation || note.difficulty)) t.completionNotes[date] = note;
            else delete t.completionNotes[date];
          },
          false
        ),

      setActualMinutes: (id, date, minutes) =>
        mutate(
          id,
          (t) => {
            if (minutes && minutes > 0) t.actualMinutes[date] = Math.round(minutes);
            else delete t.actualMinutes[date];
          },
          false
        ),

      setFeelingLink: (id, date, which, entryId) =>
        mutate(
          id,
          (t) => {
            const link = { ...t.feelingLinks[date], [which]: entryId };
            if (!entryId) delete link[which];
            if (link.before || link.after) t.feelingLinks[date] = link;
            else delete t.feelingLinks[date];
          },
          false
        ),

      startTask: (id, date) =>
        mutate(
          id,
          (t) => {
            t.running = { date, startedAt: new Date().toISOString() };
          },
          false
        ),

      stopTask: (id) => {
        const task = findTask(get().tasks, id);
        if (!task?.running) return 0;
        const { date, startedAt } = task.running;
        // Capped at 12 hours, in case a timer was left running overnight.
        const minutes = Math.min(12 * 60, Math.max(0, Math.round((Date.now() - Date.parse(startedAt)) / 60_000)));
        mutate(
          id,
          (t) => {
            delete t.running;
            if (minutes > 0) t.actualMinutes[date] = (t.actualMinutes[date] ?? 0) + minutes;
          },
          false
        );
        return minutes;
      },

      deleteTask: (id) => {
        const task = findTask(get().tasks, id);
        if (task) void cancelReminders(task.notificationIds);
        set((state) => {
          state.tasks = state.tasks.filter((t) => t.id !== id);
        });
      },

      deleteOccurrence: (id, date, scope) => {
        const task = findTask(get().tasks, id);
        if (!task) return;
        if (task.repeat === 'none' || (scope === 'future' && date <= task.date)) return get().deleteTask(id);
        mutate(id, (t) => {
          if (scope === 'this') {
            if (!t.skippedDates.includes(date)) t.skippedDates.push(date);
          } else {
            t.repeatUntil = addDaysISO(date, -1);
          }
        });
      },

      restoreTasks: (tasks) => {
        set((state) => {
          state.tasks = tasks;
        });
        tasks.filter((t) => t.reminders.length).forEach((t) => void syncReminder(t.id));
      },

      moveToTomorrow: (id, fromDate) => {
        const task = findTask(get().tasks, id);
        if (!task) return;
        get().rescheduleTask(id, fromDate, addDaysISO(fromDate, 1), task.scheduledTime);
      },

      rescheduleTask: (id, fromDate, toDate, time) => {
        const task = findTask(get().tasks, id);
        if (!task) return;
        if (task.repeat === 'none') {
          mutate(id, (t, state) => {
            if (t.date !== toDate) {
              t.order = nextOrder(state.tasks, toDate);
              t.moveCount += 1;
            }
            t.date = toDate;
            t.scheduledTime = time;
            if (!time) t.reminders = []; // a reminder is relative to the time
          });
          return;
        }
        // A recurring task keeps repeating; only this occurrence moves, as a
        // one-off copy that carries its reminder settings along with it.
        let copyId = '';
        set((state) => {
          const t = findTask(state.tasks, id);
          if (!t) return;
          const copy = detachOccurrence(state, t, fromDate, toDate);
          copy.done = false;
          copy.scheduledTime = time;
          if (!time) copy.reminders = [];
          copy.moveCount = 1;
          state.tasks.push(copy);
          copyId = copy.id;
        });
        if (copyId) void syncReminder(copyId);
      },

      moveIncompleteToTomorrow: (date) => {
        const incomplete = get().tasks.filter((t) => taskAppliesToDate(t, date) && !resolveTaskDone(t, date));
        incomplete.forEach((t) => get().moveToTomorrow(t.id, date));
        return incomplete.length;
      },

      letGo: (id, date) =>
        mutate(id, (t) => {
          if (!t.letGoDates.includes(date)) t.letGoDates.push(date);
        }),

      undoLetGo: (id, date) =>
        mutate(id, (t) => {
          t.letGoDates = t.letGoDates.filter((d) => d !== date);
        }),

      reorderTask: (date, id, direction) => {
        const ids = dayIds(get(), date);
        const index = ids.indexOf(id);
        if (index === -1 || index + direction < 0 || index + direction >= ids.length) return;
        get().moveTaskInDay(date, id, index + direction);
      },

      moveTaskInDay: (date, id, toIndex) => {
        const next = moveInDay(dayIds(get(), date), id, toIndex);
        set((state) => {
          state.dayOrder[date] = next;
        });
      },

      addSubtask: (taskId, title) =>
        set((state) => {
          const trimmed = title.trim();
          if (!trimmed) return;
          const t = findTask(state.tasks, taskId);
          if (t) t.subtasks.push({ id: genId('subtask'), title: trimmed, done: false });
        }),

      toggleSubtask: (taskId, subtaskId) =>
        set((state) => {
          const sub = findTask(state.tasks, taskId)?.subtasks.find((s) => s.id === subtaskId);
          if (sub) sub.done = !sub.done;
        }),

      deleteSubtask: (taskId, subtaskId) =>
        set((state) => {
          const t = findTask(state.tasks, taskId);
          if (t) t.subtasks = t.subtasks.filter((s) => s.id !== subtaskId);
        }),

      moveSubtask: (taskId, subtaskId, toIndex) =>
        set((state) => {
          const t = findTask(state.tasks, taskId);
          if (!t) return;
          const from = t.subtasks.findIndex((s) => s.id === subtaskId);
          if (from === -1) return;
          const [item] = t.subtasks.splice(from, 1);
          t.subtasks.splice(Math.max(0, Math.min(toIndex, t.subtasks.length)), 0, item);
        }),

      addTag: (name, color) => {
        const trimmed = name.trim();
        if (!trimmed) return undefined;
        const existing = get().tags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
        if (existing) return existing.id;
        const id = genId('tag');
        set((state) => {
          state.tags.push({
            id,
            name: trimmed,
            color: color ?? planColorPalette[state.tags.length % planColorPalette.length],
            createdAt: new Date().toISOString(),
          });
        });
        return id;
      },

      renameTag: (id, name) => {
        const trimmed = name.trim();
        if (!trimmed) return 'empty';
        if (get().tags.some((t) => t.id !== id && t.name.toLowerCase() === trimmed.toLowerCase())) return 'taken';
        const oldName = get().tags.find((t) => t.id === id)?.name;
        if (oldName) renameTaskTagInFeelings(oldName, trimmed, get().tasks.filter((t) => t.tagIds.includes(id)).map((t) => t.id));
        set((state) => {
          const tag = state.tags.find((t) => t.id === id);
          if (tag) tag.name = trimmed;
        });
        return 'ok';
      },

      setTagColor: (id, color) =>
        set((state) => {
          const tag = state.tags.find((t) => t.id === id);
          if (tag) tag.color = color;
        }),

      mergeTags: (fromId, intoId) => {
        if (fromId === intoId) return;
        const from = get().tags.find((t) => t.id === fromId);
        const into = get().tags.find((t) => t.id === intoId);
        if (from && into) renameTaskTagInFeelings(from.name, into.name, get().tasks.filter((t) => t.tagIds.includes(fromId)).map((t) => t.id));
        set((state) => {
          if (!state.tags.some((t) => t.id === intoId)) return;
          for (const t of state.tasks) {
            if (!t.tagIds.includes(fromId)) continue;
            t.tagIds = t.tagIds.includes(intoId) ? t.tagIds.filter((x) => x !== fromId) : t.tagIds.map((x) => (x === fromId ? intoId : x));
          }
          for (const tpl of state.taskTemplates) {
            if (!tpl.fields.tagIds.includes(fromId)) continue;
            tpl.fields.tagIds = [...new Set(tpl.fields.tagIds.map((x) => (x === fromId ? intoId : x)))];
          }
          state.tags = state.tags.filter((t) => t.id !== fromId);
        });
      },

      deleteTag: (id) =>
        set((state) => {
          for (const t of state.tasks) if (t.tagIds.includes(id)) t.tagIds = t.tagIds.filter((x) => x !== id);
          for (const tpl of state.taskTemplates) tpl.fields.tagIds = tpl.fields.tagIds.filter((x) => x !== id);
          state.tags = state.tags.filter((t) => t.id !== id);
        }),

      saveTaskAsTemplate: (taskId, name) => {
        const task = findTask(get().tasks, taskId);
        if (!task) return undefined;
        const title = resolveTaskTitle(task);
        return get().addTaskTemplate(name, {
          title,
          notes: task.notes,
          durationMinutes: task.durationMinutes,
          tagIds: [...task.tagIds],
          priority: task.priority,
          energy: task.energy,
          estimateMinutes: task.estimateMinutes,
          context: task.context,
          why: task.why,
          subtaskTitles: task.subtasks.map((s) => s.title),
          reminders: task.reminders.map(({ id: _id, ...r }) => r),
        });
      },

      addTaskTemplate: (name, fields) => {
        const id = genId('tasktemplate');
        set((state) => {
          state.taskTemplates.push({ id, name: name.trim() || fields.title || 'Template', createdAt: new Date().toISOString(), fields });
        });
        return id;
      },

      addTaskFromTemplate: (date, templateId) => {
        const tpl = get().taskTemplates.find((t) => t.id === templateId) ?? STARTER_TASK_TEMPLATES.find((t) => t.id === templateId);
        if (!tpl) return undefined;
        const { subtaskTitles, reminders, tagIds, ...f } = tpl.fields;
        const known = new Set(get().tags.map((t) => t.id));
        return get().addTask(date, f.title || tpl.name, {
          ...f,
          tagIds: tagIds.filter((id) => known.has(id)),
          reminders: reminders.map((r) => ({ ...r, id: genId('reminder') })),
          subtasks: subtaskTitles.map((title) => ({ id: genId('subtask'), title, done: false })),
          fromTemplateId: tpl.id,
        });
      },

      deleteTaskTemplate: (templateId) =>
        set((state) => {
          state.taskTemplates = state.taskTemplates.filter((t) => t.id !== templateId);
        }),

      setStarterTemplateHidden: (templateId, hidden) =>
        set((state) => {
          const rest = state.hiddenStarterTemplates.filter((id) => id !== templateId);
          state.hiddenStarterTemplates = hidden ? [...rest, templateId] : rest;
        }),

      saveDayAsTemplate: (date, name) =>
        set((state) => {
          const titles = state.tasks
            .filter((t) => t.date === date && !t.linkedPlan)
            .map((t) => t.title)
            .filter(Boolean);
          if (titles.length === 0) return;
          state.dayTemplates.push({ id: genId('daytemplate'), name: name.trim() || 'Untitled day', taskTitles: titles });
        }),

      applyTemplate: (date, templateId) =>
        set((state) => {
          const template = state.dayTemplates.find((t) => t.id === templateId);
          if (!template) return;
          const startOrder = nextOrder(state.tasks, date);
          template.taskTitles.forEach((title, i) => {
            state.tasks.push({
              id: genId('task'),
              title,
              done: false,
              repeat: 'none',
              ...blankTask(date, startOrder + i),
              createdAt: new Date().toISOString(),
            });
          });
        }),

      setDayReflection: (date, text) =>
        set((state) => {
          if (text.trim()) state.dayReflections[date] = text;
          else delete state.dayReflections[date];
        }),
    };
  })
);
