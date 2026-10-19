// Small, valid records for tests: pass only what the test is about.
//
//   makeTask({ date: '2026-10-18', done: true })
//   makeCheckIn({ habitId: 'h1', date: '2026-10-18' })
//
// Ids are unique per call. Times are local to the test zone and never read
// the real clock.
import type { DailyTask, FeelingCheckIn, Habit, HabitCheckIn, PracticeSession, QuitFeelingEntry, QuitHabit, QuitTrack, Skill } from '../types/sections';
import { localMs } from './time';

let n = 0;
const id = (prefix: string) => `${prefix}-t${++n}`;
const at = (date: string, hour = 9) => new Date(localMs(`${date}T${String(hour).padStart(2, '0')}:00`)).toISOString();

export function makeTask(over: Partial<DailyTask> = {}): DailyTask {
  const date = over.date ?? '2026-10-18';
  return {
    id: id('task'),
    date,
    title: 'A task',
    done: false,
    reminders: [],
    notificationIds: [],
    completionNotes: {},
    completedAt: {},
    subtasks: [],
    repeat: 'none',
    completedDates: [],
    skippedDates: [],
    letGoDates: [],
    order: 0,
    tagIds: [],
    priority: 'medium',
    actualMinutes: {},
    attachments: [],
    feelingLinks: {},
    moveCount: 0,
    createdAt: at(date, 8),
    ...over,
  } as DailyTask;
}

export function makeHabit(over: Partial<Habit> = {}): Habit {
  return { id: id('habit'), name: 'A habit', targetDays: 66, createdAt: '2026-09-01', reminderEnabled: false, reminderNotificationIds: [], ...over };
}

export function makeCheckIn(over: Partial<HabitCheckIn> & { hour?: number } = {}): HabitCheckIn {
  const { hour = 9, ...rest } = over;
  const date = rest.date ?? '2026-10-18';
  const done = rest.done ?? true;
  return { id: id('checkin'), habitId: 'habit-1', date, done, createdAt: at(date, hour), ...(done ? { completedAt: at(date, hour) } : {}), ...rest };
}

export function makeFeeling(over: Partial<FeelingCheckIn> & { hour?: number } = {}): FeelingCheckIn {
  const { hour = 12, ...rest } = over;
  const date = rest.date ?? '2026-10-18';
  return { id: id('feeling'), zone: 'calm', feelingIds: [], date, createdAt: at(date, hour), ...rest };
}

export function makeSkill(over: Partial<Skill> = {}): Skill {
  return { id: id('skill'), name: 'A skill', color: '#3D8B7A', icon: 'musical-notes-outline', startDate: '2026-09-01', milestones: [], reminderEnabled: false, reminderNotificationIds: [], ...over } as Skill;
}

export function makeSession(over: Partial<PracticeSession> & { hour?: number } = {}): PracticeSession {
  const { hour = 18, ...rest } = over;
  const date = rest.date ?? '2026-10-18';
  return { id: id('session'), skillId: 'skill-1', date, minutes: 20, hasVoiceMemo: false, createdAt: at(date, hour), ...rest };
}

export function makeQuitHabit(over: Partial<QuitHabit> = {}): QuitHabit {
  return { id: id('quit'), name: 'A quit habit', createdAt: '2026-09-01', ...over } as QuitHabit;
}

export function makeTrack(over: Partial<QuitTrack> = {}): QuitTrack {
  const startDate = over.startDate ?? '2026-09-01';
  return { id: id('track'), quitHabitId: 'quit-1', startDate, createdAt: at(startDate, 8), status: 'active', ...over } as QuitTrack;
}

export function makeQuitEntry(over: Partial<QuitFeelingEntry> & { date?: string; hour?: number } = {}): QuitFeelingEntry {
  const { date = '2026-10-18', hour = 21, ...rest } = over;
  return { id: id('quitentry'), trackId: 'track-1', isRelapseMoment: false, isResistedUrge: true, createdAt: at(date, hour), ...rest };
}
