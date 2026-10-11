// Quiet hours: optional reminders that would land inside the quiet window are
// moved to the moment it ends. Alarms the user set on purpose ring through,
// unless they chose to include alarms too.
import type { QuietHours } from '../store/useSettingsStore';

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function isInQuietHours(minuteOfDay: number, quiet: QuietHours): boolean {
  if (!quiet.enabled) return false;
  const start = toMinutes(quiet.start);
  const end = toMinutes(quiet.end);
  if (start === end) return false;
  return start < end ? minuteOfDay >= start && minuteOfDay < end : minuteOfDay >= start || minuteOfDay < end;
}

export interface ClockTime {
  hour: number;
  minute: number;
}

// The time a reminder should actually fire at, and whether that moved it to
// the next day (a window that runs past midnight).
export function applyQuietHours(time: ClockTime, quiet: QuietHours, isAlarm: boolean): ClockTime & { nextDay: boolean } {
  const minute = time.hour * 60 + time.minute;
  if ((isAlarm && !quiet.includeAlarms) || !isInQuietHours(minute, quiet)) return { ...time, nextDay: false };
  const end = toMinutes(quiet.end);
  return { hour: Math.floor(end / 60), minute: end % 60, nextDay: end < minute };
}

// Same rule for a one-off date.
export function applyQuietHoursToDate(date: Date, quiet: QuietHours, isAlarm: boolean): Date {
  const shifted = applyQuietHours({ hour: date.getHours(), minute: date.getMinutes() }, quiet, isAlarm);
  if (shifted.hour === date.getHours() && shifted.minute === date.getMinutes() && !shifted.nextDay) return date;
  const out = new Date(date);
  if (shifted.nextDay) out.setDate(out.getDate() + 1);
  out.setHours(shifted.hour, shifted.minute, 0, 0);
  return out;
}
