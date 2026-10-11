export function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

// Calendar arithmetic on ISO dates is done in UTC, where every day is 24
// hours long, so daylight-saving changes and the phone's time zone can never
// shift a date by one.
function utcOf(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function isoOfUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function addDaysISO(iso: string, days: number): string {
  const d = utcOf(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return isoOfUtc(d);
}

// JS weekday of an ISO date: 0 = Sunday.
export function weekdayOfISO(iso: string): number {
  return utcOf(iso).getUTCDay();
}

export function daysInMonthISO(iso: string): number {
  const d = utcOf(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

// Whole days from a to b (negative when b is earlier).
export function daysBetweenISODates(a: string, b: string): number {
  return Math.round((utcOf(b).getTime() - utcOf(a).getTime()) / 86_400_000);
}

export function formatDisplayDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

export function dayOfYear(iso: string): number {
  const d = new Date(`${iso}T00:00:00`);
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.floor((d.getTime() - start.getTime()) / 86400000);
}

// When a reminder `minutesBefore` a local start time fires, in real elapsed
// time. A start time that doesn't exist (skipped by a daylight-saving change)
// moves forward with the clock, as the phone's own alarm would.
export function reminderFireDate(date: string, time: string, minutesBefore: number): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, m] = time.split(':').map(Number);
  return new Date(new Date(y, mo - 1, d, h, m, 0, 0).getTime() - minutesBefore * 60_000);
}

export function isSameWeekday(a: string, b: string): boolean {
  return weekdayOfISO(a) === weekdayOfISO(b);
}

export function isBeforeOrSameDate(a: string, b: string): boolean {
  return a <= b; // ISO yyyy-mm-dd strings compare lexicographically in date order
}

export function formatMonthLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function addMonthsISO(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  return toISODate(d);
}

// The user's first day of the week (Settings → Appearance), JS getDay
// numbering. Set from the settings store at startup and whenever it changes,
// so pure date code (habit weeks, skill weeks) can follow it without
// importing the store.
let calendarWeekStart = 1;

export function setCalendarWeekStart(day: number): void {
  calendarWeekStart = day;
}

export function getCalendarWeekStart(): number {
  return calendarWeekStart;
}

// Weekday labels (Sunday-first, as getDay numbers them) rotated so the
// first one is the week's first day.
export function rotateWeekdays<T>(sundayFirst: T[], weekStartsOn: number): T[] {
  return [...sundayFirst.slice(weekStartsOn), ...sundayFirst.slice(0, weekStartsOn)];
}

// Returns one ISO date per day of the month containing `iso`, padded at the
// start with `null` so the first real day lands under the right weekday.
export function getMonthGrid(iso: string, weekStartsOn = 0): (string | null)[] {
  const d = new Date(`${iso}T00:00:00`);
  const year = d.getFullYear();
  const month = d.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() - weekStartsOn + 7) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (string | null)[] = Array(firstWeekday).fill(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(toISODate(new Date(year, month, day)));
  }
  return cells;
}

// Settings → Appearance → Time format, set from the settings store like the
// week start. 'system' follows the phone's region.
export type TimeFormat = 'system' | '12h' | '24h';
let timeFormat: TimeFormat = 'system';

export function setTimeFormat(format: TimeFormat): void {
  timeFormat = format;
}

export function uses12Hour(format: TimeFormat = timeFormat): boolean {
  if (format !== 'system') return format === '12h';
  try {
    return !!new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12;
  } catch {
    return false;
  }
}

// "18:05" → "6:05 PM" or "18:05". Stored times are always HH:MM; this is
// only for showing them.
export function formatClockTime(hhmm: string, format: TimeFormat = timeFormat): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const mm = String(m).padStart(2, '0');
  if (!uses12Hour(format)) return `${String(h).padStart(2, '0')}:${mm}`;
  return `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
}

// A moment's time of day, in the same format.
export function formatTimeOfDay(date: Date, format: TimeFormat = timeFormat): string {
  return formatClockTime(`${date.getHours()}:${date.getMinutes()}`, format);
}
