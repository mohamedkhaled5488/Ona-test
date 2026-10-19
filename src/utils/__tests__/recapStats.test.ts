jest.mock('../notifications', () => ({
  cancelReminders: jest.fn(async () => {}),
  scheduleReminder: jest.fn(async () => []),
}));

import {
  areaSummaries,
  buildHighlights,
  buildStory,
  effortSummary,
  formatDuration,
  periodStats,
  shareableStoryCards,
  withoutHidden,
  type RecapData,
} from '../recapStats';
import { datesInRange, periodRange, previousPeriodRange, weekStartFor } from '../feelingsStats';

const custom = { start: '2026-01-01', end: '2026-01-14' };

function emptyData(): RecapData {
  return {
    tasks: [], journalEntries: [], thoughts: [], studySessions: [], meals: [], songs: [], gameResults: [],
    feelingCheckIns: [], sleepLogs: [], readingEntries: [], readingSessions: [], quotes: [], plans: [], skills: [],
    skillSessions: [], habits: [], habitCheckIns: [], budgets: [], budgetEntries: [], quitHabits: [], quitTracks: [],
    quitFeelingEntries: [], bestMoments: [],
  };
}

const study = (id: string, date: string, focusMinutes: number) =>
  ({ id, date, focusMinutes, breakMinutes: 0, appBlockingEnabled: false, ambientSound: 'none' }) as RecapData['studySessions'][number];
const reading = (id: string, date: string, minutes: number, pagesRead?: number) => ({ id, entryId: 'b1', date, minutes, pagesRead });
const task = (id: string, date: string, done: boolean) =>
  ({ id, date, title: id, done, notificationIds: [], completionNotes: {}, subtasks: [], repeat: 'none', completedDates: [], skippedDates: [], order: 0 }) as unknown as RecapData['tasks'][number];
const feeling = (id: string, date: string) =>
  ({ id, date, zone: 'calm', feelingIds: ['content'], createdAt: `${date}T10:00:00.000Z` }) as unknown as RecapData['feelingCheckIns'][number];

function sampleData(): RecapData {
  return {
    ...emptyData(),
    studySessions: [study('s1', '2026-10-05', 50), study('s2', '2026-10-06', 25), study('s3', '2026-10-13', 40), study('s4', '2026-09-30', 30)],
    readingSessions: [reading('r1', '2026-10-05', 30, 20), reading('r2', '2026-10-07', 45, 35), reading('r3', '2026-10-12', 20, 10)],
    skillSessions: [{ id: 'k1', skillId: 'sk', date: '2026-10-06', minutes: 60, hasVoiceMemo: false, createdAt: '2026-10-06T08:00:00Z' }],
    habitCheckIns: [
      { id: 'h1', habitId: 'hb', date: '2026-10-07', done: true, durationMinutes: 15, createdAt: '2026-10-07T07:00:00Z' },
      { id: 'h2', habitId: 'hb', date: '2026-10-08', done: true, createdAt: '2026-10-08T07:00:00Z' },
      { id: 'h3', habitId: 'hb', date: '2026-10-09', done: false, durationMinutes: 99, createdAt: '2026-10-09T07:00:00Z' },
    ],
    tasks: [task('t1', '2026-10-05', true), task('t2', '2026-10-05', false), task('t3', '2026-10-08', true)],
    feelingCheckIns: [feeling('f1', '2026-10-06'), feeling('f2', '2026-10-08')],
    quitFeelingEntries: [
      { id: 'q1', trackId: 'tr', feelingId: 'content', zone: 'calm', isRelapseMoment: false, isResistedUrge: true, createdAt: '2026-10-07T21:00:00Z' },
    ],
  };
}

describe('recap periods (shared range utility)', () => {
  it('follows the week-start setting', () => {
    // Wednesday 7 October 2026
    expect(periodRange('week', '2026-10-07', custom, 1)).toMatchObject({ start: '2026-10-05', end: '2026-10-11' });
    expect(periodRange('week', '2026-10-07', custom, 0)).toMatchObject({ start: '2026-10-04', end: '2026-10-10' });
    expect(periodRange('week', '2026-10-07', custom, 6)).toMatchObject({ start: '2026-10-03', end: '2026-10-09' });
    // The start day itself begins its own week.
    expect(weekStartFor('2026-10-03', 6)).toBe('2026-10-03');
  });

  it('handles month and year boundaries', () => {
    expect(periodRange('month', '2026-02-15', custom, 1)).toMatchObject({ start: '2026-02-01', end: '2026-02-28' });
    expect(periodRange('month', '2028-02-10', custom, 1)).toMatchObject({ start: '2028-02-01', end: '2028-02-29' });
    expect(periodRange('year', '2026-06-01', custom, 1)).toMatchObject({ start: '2026-01-01', end: '2026-12-31', granularity: 'month' });
    const jan = periodRange('month', '2026-01-20', custom, 1);
    expect(previousPeriodRange('month', jan, 1)).toMatchObject({ start: '2025-12-01', end: '2025-12-31' });
    expect(previousPeriodRange('year', periodRange('year', '2026-03-01', custom, 1), 1)).toMatchObject({ start: '2025-01-01', end: '2025-12-31' });
    expect(previousPeriodRange('today', periodRange('today', '2026-03-01', custom, 1), 1)).toMatchObject({ start: '2026-02-28', end: '2026-02-28' });

    // A session on the last day of a month counts in that month only.
    const data = { ...emptyData(), studySessions: [study('a', '2026-01-31', 30), study('b', '2026-02-01', 20)] };
    expect(periodStats(data, jan).minutes.study).toBe(30);
    expect(periodStats(data, periodRange('month', '2026-02-01', custom, 1)).minutes.study).toBe(20);
  });

  it('keeps the previous custom range the same length', () => {
    const range = periodRange('custom', '2026-01-14', custom, 1);
    const prev = previousPeriodRange('custom', range, 1);
    expect(prev).toMatchObject({ start: '2025-12-18', end: '2025-12-31' });
    expect(datesInRange(prev.start, prev.end)).toHaveLength(14);
  });

  // Jest runs in America/New_York (see jest.globalSetup.js).
  describe('daylight-saving days', () => {

    it('really runs in a zone with daylight saving', () => {
      expect(new Date('2026-03-07T12:00:00').getTimezoneOffset()).not.toBe(new Date('2026-03-09T12:00:00').getTimezoneOffset());
    });

    it('still has seven days in a week that springs forward or falls back', () => {
      const spring = periodRange('week', '2026-03-10', custom, 0); // DST starts Sun 8 March 2026
      expect(spring).toMatchObject({ start: '2026-03-08', end: '2026-03-14' });
      expect(datesInRange(spring.start, spring.end)).toHaveLength(7);
      const fall = periodRange('week', '2026-11-03', custom, 0); // DST ends Sun 1 November 2026
      expect(fall).toMatchObject({ start: '2026-11-01', end: '2026-11-07' });
      expect(datesInRange(fall.start, fall.end)).toHaveLength(7);
    });

    it('counts time logged on the DST day itself', () => {
      const data = { ...emptyData(), studySessions: [study('d', '2026-03-08', 45), study('e', '2026-11-01', 30)] };
      expect(periodStats(data, periodRange('week', '2026-03-10', custom, 0)).minutes.study).toBe(45);
      expect(periodStats(data, periodRange('week', '2026-11-03', custom, 0)).minutes.study).toBe(30);
      expect(periodStats(data, periodRange('month', '2026-03-01', custom, 0)).minutesByDay['2026-03-08'].study).toBe(45);
    });
  });
});

describe('recap totals', () => {
  const week = periodRange('week', '2026-10-07', custom, 1); // 5–11 Oct

  it('reconcile with the source data', () => {
    const data = sampleData();
    const s = periodStats(data, week);
    expect(s.minutes).toEqual({ study: 75, skills: 60, reading: 75, habits: 15 });
    expect(s.totalMinutes).toBe(225);
    expect(s.pagesRead).toBe(55);
    expect(s.tasksPlanned).toBe(3);
    expect(s.tasksCompleted).toBe(2);
    expect(s.habitCompletions).toBe(2); // the missed day isn't counted, nor its minutes
    expect(s.feelingsLogged).toBe(2);
    expect(s.resistedUrges).toBe(1);
    // Per-day minutes add back up to the period total.
    const byDay = s.dates.reduce((sum, d) => sum + Object.values(s.minutesByDay[d]).reduce((a, b) => a + b, 0), 0);
    expect(byDay).toBe(s.totalMinutes);
  });

  it('add up across smaller periods', () => {
    const data = sampleData();
    const month = periodStats(data, periodRange('month', '2026-10-01', custom, 1));
    let sum = 0;
    for (let anchor = '2026-10-01'; anchor <= '2026-10-31'; ) {
      const r = periodRange('today', anchor, custom, 1);
      sum += periodStats(data, r).totalMinutes;
      anchor = datesInRange(anchor, '2026-11-01')[1];
    }
    expect(sum).toBe(month.totalMinutes);
    expect(month.minutes.study).toBe(115); // the 30 Sep session stays in September
  });

  it('keeps counts separate from time', () => {
    const data = { ...emptyData(), tasks: [task('x', '2026-10-05', true)] };
    const s = periodStats(data, week);
    expect(s.totalMinutes).toBe(0);
    expect(s.tasksCompleted).toBe(1);
  });

  it('writes a plain summary sentence and a neutral comparison', () => {
    const data = sampleData();
    const s = periodStats(data, week);
    const prev = periodStats(data, previousPeriodRange('week', week, 1));
    const summary = effortSummary(s, prev, 'week', true);
    expect(summary.numbers.map((n) => n.id)).toEqual(['time', 'tasks', 'pages', 'habits']);
    expect(summary.numbers[0].display).toBe('3 h 45 min');
    expect(summary.sentence).toBe('This week you focused for 3 h 45 min, finished 2 tasks and read 55 pages.');
    expect(summary.numbers[0].delta).toBe('+3 h 15 min vs last week'); // last week had 30 min
    expect(summary.numbers[1].delta).toBe('+2 vs last week');
  });

  it('formats durations', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(120)).toBe('2 h');
    expect(formatDuration(390)).toBe('6 h 30 min');
  });
});

describe('empty periods', () => {
  it('get a friendly sentence and no cards', () => {
    const range = periodRange('week', '2026-10-07', custom, 1);
    const s = periodStats(emptyData(), range);
    const summary = effortSummary(s, undefined, 'week', true);
    expect(summary.numbers).toEqual([]);
    expect(summary.sentence).toMatch(/quiet so far/);
    expect(effortSummary(s, undefined, 'week', false).sentence).toBe('Nothing was logged that week.');
    expect(buildHighlights(emptyData(), s)).toEqual([]);
    expect(buildStory(emptyData(), s, [], 'week', true, '2026-10-07')).toEqual([]);
    expect(areaSummaries(s, []).every((a) => !a.hasData)).toBe(true);
  });
});

describe('hidden sections and the story', () => {
  const week = periodRange('week', '2026-10-07', custom, 1);

  it('drops hidden sections from every number', () => {
    const data = withoutHidden(sampleData(), ['moodCheck', 'book', 'quitHabit']);
    const s = periodStats(data, week);
    expect(s.feelingsLogged).toBe(0);
    expect(s.pagesRead).toBe(0);
    expect(s.minutes.reading).toBe(0);
    expect(s.resistedUrges).toBe(0);
    const summary = effortSummary(s, undefined, 'week', true);
    expect(summary.numbers.find((n) => n.id === 'pages')).toBeUndefined();
    const story = buildStory(data, s, buildHighlights(data, s), 'week', true, '2026-10-07');
    expect(story.find((c) => c.id === 'feelings')).toBeUndefined();
    expect(story.find((c) => c.id === 'urges')).toBeUndefined();
    expect(story.some((c) => [c.headline, ...c.lines].join(' ').includes('Reading'))).toBe(false);
  });

  it('hides an area card only when all its sections are hidden', () => {
    const s = periodStats(sampleData(), week);
    expect(areaSummaries(s, ['journaling', 'moodCheck']).map((a) => a.area)).toContain('reflect');
    expect(areaSummaries(s, ['journaling', 'moodCheck', 'sleep']).map((a) => a.area)).not.toContain('reflect');
  });

  it('skips story cards that have no data', () => {
    const data = { ...emptyData(), studySessions: [study('a', '2026-10-05', 30), study('b', '2026-10-06', 40)] };
    const s = periodStats(data, week);
    const summary = effortSummary(s, undefined, 'week', true);
    const ids = buildStory(data, s, buildHighlights(data, s), 'week', true, '2026-10-07').map((c) => c.id);
    // No "fullest day": Recap doesn't rank days, so with only this there's no win card.
    expect(ids).toEqual(['effort', 'time']);
  });

  it('leaves Feelings and Quit out of shared cards unless the user opts in', () => {
    const data = sampleData();
    const s = periodStats(data, week);
    const summary = effortSummary(s, undefined, 'week', true);
    const story = buildStory(data, s, buildHighlights(data, s), 'week', true, '2026-10-07');
    expect(story.map((c) => c.id)).toEqual(expect.arrayContaining(['feelings', 'urges']));
    const shared = shareableStoryCards(story, false).map((c) => c.id);
    expect(shared).not.toContain('feelings');
    expect(shared).not.toContain('urges');
    expect(shareableStoryCards(story, true)).toHaveLength(story.length);
    // The opening card leaves feelings out, so it can always be shared.
    const opening = story.find((c) => c.id === 'effort')!;
    expect(shared).toContain('effort');
    expect([opening.headline, ...opening.lines].join(' ')).not.toMatch(/feeling/i);
  });

  it('marks a best moment from Feelings as sensitive', () => {
    const data = { ...sampleData(), bestMoments: [{ date: '2026-10-06', sourceSection: 'moodCheck' as const, label: 'Felt calm after the walk' }] };
    const s = periodStats(data, week);
    const highlights = buildHighlights(data, s);
    expect(highlights[0]).toMatchObject({ id: 'moment-2026-10-06', sensitive: true });
    const story = buildStory(data, s, highlights, 'week', true, '2026-10-07');
    expect(shareableStoryCards(story, false).find((c) => c.id === 'moment')).toBeUndefined();
  });
});
