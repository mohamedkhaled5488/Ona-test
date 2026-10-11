import type { StudySession } from '../types/sections';
import { addDaysISO } from './date';

export function minutesOnDate(sessions: StudySession[], date: string): number {
  return sessions.filter((s) => s.date === date).reduce((sum, s) => sum + s.focusMinutes, 0);
}

export function minutesInLastDays(sessions: StudySession[], fromDate: string, days: number): number {
  const cutoff = addDaysISO(fromDate, -(days - 1));
  return sessions.filter((s) => s.date >= cutoff && s.date <= fromDate).reduce((sum, s) => sum + s.focusMinutes, 0);
}

export function computeStudyStreak(sessions: StudySession[], fromDate: string): number {
  const daysWithStudy = new Set(sessions.filter((s) => s.focusMinutes > 0).map((s) => s.date));
  let streak = 0;
  let cursor = fromDate;
  while (daysWithStudy.has(cursor)) {
    streak += 1;
    cursor = addDaysISO(cursor, -1);
  }
  return streak;
}

export function last7DaysMinutes(sessions: StudySession[], today: string): { date: string; minutes: number }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDaysISO(today, i - 6);
    return { date, minutes: minutesOnDate(sessions, date) };
  });
}
