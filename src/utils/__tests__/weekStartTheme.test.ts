// Settings → Appearance: the week start drives Recap, Habits and Skills the
// same way, and theme / text size changes rebuild styles from the new tokens.
import { getMonthGrid, rotateWeekdays, setCalendarWeekStart } from '../date';
import { weekStartFor, periodRange } from '../feelingsStats';
import { weekStart, frequencyStreak } from '../habitFrequency';
import { weeklyMinutes } from '../skillProgress';
import { applyTheme, themedStyles, fontScale, TEXT_SCALE } from '../../theme/runtime';
import { colors, darkPalette, lightPalette } from '../../theme/colors';
import type { HabitCheckIn, PracticeSession } from '../../types/sections';

const STARTS = [
  { ws: 6, name: 'Saturday' },
  { ws: 0, name: 'Sunday' },
  { ws: 1, name: 'Monday' },
] as const;

describe('week start is consistent everywhere', () => {
  afterAll(() => setCalendarWeekStart(1));

  // 2026-01-01 is a Thursday: its week begins in the previous year.
  test.each([
    ['2026-01-01', { 6: '2025-12-27', 0: '2025-12-28', 1: '2025-12-29' }],
    ['2026-03-01', { 6: '2026-02-28', 0: '2026-03-01', 1: '2026-02-23' }], // Sunday, across a month boundary
    ['2026-10-31', { 6: '2026-10-31', 0: '2026-10-25', 1: '2026-10-26' }], // Saturday
  ])('%s', (date, expected) => {
    for (const { ws } of STARTS) {
      setCalendarWeekStart(ws);
      const recap = periodRange('week', date, { start: date, end: date }, ws).start;
      expect(recap).toBe(expected[ws]);
      expect(weekStartFor(date, ws)).toBe(expected[ws]);
      expect(weekStart(date)).toBe(expected[ws]); // habits and skills follow the setting
    }
  });

  test('skills weekly totals split weeks on the chosen day, across a year boundary', () => {
    const sessions = [
      { id: 'a', skillId: 's', date: '2025-12-27', minutes: 10 }, // Saturday
      { id: 'b', skillId: 's', date: '2025-12-28', minutes: 20 }, // Sunday
      { id: 'c', skillId: 's', date: '2026-01-02', minutes: 30 }, // Friday
    ] as PracticeSession[];

    setCalendarWeekStart(6);
    expect(weeklyMinutes(sessions, 's', '2025-12-27', '2026-01-02')).toEqual([{ weekStart: '2025-12-27', minutes: 60 }]);

    setCalendarWeekStart(0);
    expect(weeklyMinutes(sessions, 's', '2025-12-27', '2026-01-02')).toEqual([
      { weekStart: '2025-12-21', minutes: 10 },
      { weekStart: '2025-12-28', minutes: 50 },
    ]);

    setCalendarWeekStart(1);
    expect(weeklyMinutes(sessions, 's', '2025-12-27', '2026-01-02')).toEqual([
      { weekStart: '2025-12-22', minutes: 30 },
      { weekStart: '2025-12-29', minutes: 30 },
    ]);
  });

  test('"X times a week" habits count the same week Recap shows', () => {
    // Done Saturday 3 Oct and Sunday 4 Oct; it's Sunday 4 Oct.
    const checkIns = [
      { id: '1', habitId: 'h', date: '2026-10-03', done: true },
      { id: '2', habitId: 'h', date: '2026-10-04', done: true },
    ] as HabitCheckIn[];
    const today = '2026-10-04';
    const doneThisWeek = () => checkIns.filter((c) => c.date >= weekStart(today) && c.date <= today).length;
    const expected = { 6: 2, 0: 1, 1: 2 } as const;
    for (const { ws } of STARTS) {
      setCalendarWeekStart(ws);
      expect(doneThisWeek()).toBe(expected[ws]);
      expect(weekStart(today)).toBe(periodRange('week', today, { start: today, end: today }, ws).start);
    }
    // And a per-week streak sees the same weeks.
    setCalendarWeekStart(6);
    expect(frequencyStreak(checkIns, 'h', { kind: 'perWeek', count: 2 }, today).current).toBeGreaterThanOrEqual(1);
  });

  test('month grid pads to the chosen first day (October 2026 starts on a Thursday)', () => {
    expect(getMonthGrid('2026-10-15', 0).indexOf('2026-10-01')).toBe(4);
    expect(getMonthGrid('2026-10-15', 1).indexOf('2026-10-01')).toBe(3);
    expect(getMonthGrid('2026-10-15', 6).indexOf('2026-10-01')).toBe(5);
    expect(getMonthGrid('2026-10-15', 6).filter(Boolean)).toHaveLength(31);
    expect(rotateWeekdays(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], 6)).toEqual(['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    expect(rotateWeekdays(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], 1)[0]).toBe('Mon');
  });
});

describe('theme and text size', () => {
  afterAll(() => applyTheme({ scheme: 'dark', accent: 'teal', textSize: 'system' }));

  const styles = themedStyles(() => ({
    page: { backgroundColor: colors.stone },
    title: { color: colors.ink, fontSize: 20, lineHeight: 26 },
    button: { backgroundColor: colors.teal },
  }));

  test('switching theme swaps the tokens and rebuilds existing styles immediately', () => {
    applyTheme({ scheme: 'dark', accent: 'teal', textSize: 'system' });
    expect((styles.page as { backgroundColor: string }).backgroundColor).toBe(darkPalette.stone);
    applyTheme({ scheme: 'light', accent: 'teal', textSize: 'system' });
    expect(colors.ink).toBe(lightPalette.ink);
    expect((styles.page as { backgroundColor: string }).backgroundColor).toBe(lightPalette.stone);
    expect((styles.title as { color: string }).color).toBe(lightPalette.ink);
  });

  test('accent replaces the primary color, with a deeper shade on light', () => {
    applyTheme({ scheme: 'light', accent: 'plum', textSize: 'system' });
    const light = (styles.button as { backgroundColor: string }).backgroundColor;
    applyTheme({ scheme: 'dark', accent: 'plum', textSize: 'system' });
    const dark = (styles.button as { backgroundColor: string }).backgroundColor;
    expect(light).not.toBe(dark);
    expect([light, dark]).not.toContain(darkPalette.teal);
  });

  test('text size scales font sizes and line heights together', () => {
    applyTheme({ scheme: 'dark', accent: 'teal', textSize: 'largest' });
    expect(fontScale()).toBe(TEXT_SCALE.largest);
    const t = styles.title as { fontSize: number; lineHeight: number };
    expect(t.fontSize).toBe(Math.round(20 * TEXT_SCALE.largest));
    expect(t.lineHeight).toBe(Math.round(26 * TEXT_SCALE.largest));
    // Line height never ends up smaller than the text it holds.
    expect(t.lineHeight).toBeGreaterThanOrEqual(t.fontSize);
    applyTheme({ scheme: 'dark', accent: 'teal', textSize: 'system' });
    expect((styles.title as { fontSize: number }).fontSize).toBe(20);
  });

  test('applying the same theme twice is a no-op', () => {
    applyTheme({ scheme: 'dark', accent: 'teal', textSize: 'system' });
    expect(applyTheme({ scheme: 'dark', accent: 'teal', textSize: 'system' })).toBe(false);
  });
});
