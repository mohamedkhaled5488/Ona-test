import {
  missesByWeekday,
  skipReasons,
  completionFeelingZone,
  relapseReasonCounts,
  urgeTimeOfDayPattern,
  resistedUrgeTrend,
  approachResults,
  rotatingJourneyStat,
  longestHabitStreak,
  completionSeries,
  habitMilestones,
  sessionMinutesByTimeOfDay,
  quitHeaderStats,
  quitJourneySeries,
  quitJourneyLog,
  quitAnalysisSummary,
  buildHabitAnalysisSummary,
  habitChain,
  daysSinceLastActivity,
  needsReentry,
  isReviewDue,
} from '../habitStats';
import type { Habit, HabitCheckIn, FeelingCheckIn, QuitFeelingEntry, QuitTrack } from '../../types/sections';

const HABIT_ID = 'habit-1';

function habitCheckIn(date: string, done: boolean, opts?: { reasonTags?: string[]; hour?: number }): HabitCheckIn {
  const hour = opts?.hour ?? 12;
  return {
    id: `c-${date}-${Math.random()}`,
    habitId: HABIT_ID,
    date,
    done,
    reasonTags: opts?.reasonTags,
    createdAt: `${date}T${String(hour).padStart(2, '0')}:00:00`, // local time, no "Z" — getHours() must read back exactly `hour`
  };
}

function feelingCheckIn(date: string, zone: FeelingCheckIn['zone']): FeelingCheckIn {
  return {
    id: `f-${date}-${Math.random()}`,
    zone,
    feelingIds: ['okay-okay'],
    date,
    createdAt: `${date}T12:00:00Z`,
    source: { kind: 'habit', refId: HABIT_ID },
  };
}

describe('missesByWeekday', () => {
  it('lists missed out of logged for every weekday it was logged, in week order', () => {
    // 2026-09-21, 28 and Oct 5 are Mondays; the 22nd is a Tuesday
    const checkIns = [
      habitCheckIn('2026-09-21', false),
      habitCheckIn('2026-09-28', false),
      habitCheckIn('2026-10-05', false),
      habitCheckIn('2026-09-22', true),
    ];
    expect(missesByWeekday(checkIns, HABIT_ID)).toEqual([
      { weekday: 'Mon', missed: 3, logged: 3 },
      { weekday: 'Tue', missed: 0, logged: 1 },
    ]);
  });

  it('stays undefined below the minimum sample size', () => {
    const checkIns = [habitCheckIn('2026-09-21', false), habitCheckIn('2026-09-28', false)];
    expect(missesByWeekday(checkIns, HABIT_ID)).toBeUndefined();
  });
});

describe('skipReasons', () => {
  it('counts every reason tagged on a missed day, none singled out', () => {
    const checkIns = [
      habitCheckIn('2026-09-01', false, { reasonTags: ['Tired'] }),
      habitCheckIn('2026-09-02', false, { reasonTags: ['Tired'] }),
      habitCheckIn('2026-09-03', false, { reasonTags: ['Tired', 'Work'] }),
      habitCheckIn('2026-09-04', false, { reasonTags: ['Work'] }),
    ];
    const r = skipReasons(checkIns, HABIT_ID)!;
    expect(r.missedTotal).toBe(4);
    expect(Object.fromEntries(r.tags.map((t) => [t.tag, t.count]))).toEqual({ Tired: 3, Work: 2 });
  });
});

describe('completionFeelingZone', () => {
  it('finds the zone most associated with feelings logged against this habit', () => {
    const entries = [feelingCheckIn('2026-09-01', 'calm'), feelingCheckIn('2026-09-02', 'calm'), feelingCheckIn('2026-09-03', 'tense')];
    const stat = completionFeelingZone(entries, HABIT_ID);
    expect(stat).toEqual({ zone: 'calm', count: 2, total: 3 });
  });

  it('ignores feelings logged against a different habit or skill', () => {
    const entries: FeelingCheckIn[] = [
      { id: 'a', zone: 'calm', feelingIds: ['okay-okay'], date: '2026-09-01', createdAt: '2026-09-01T12:00:00Z', source: { kind: 'habit', refId: 'other-habit' } },
    ];
    expect(completionFeelingZone(entries, HABIT_ID)).toBeUndefined();
  });
});

const TRACK_ID = 'track-1';

function archivedTrack(relapseReasonTags?: string[]): QuitTrack {
  return {
    id: `t-${Math.random()}`,
    quitHabitId: HABIT_ID,
    startDate: '2026-08-01',
    endDate: '2026-08-10',
    createdAt: '2026-08-01T00:00:00Z',
    status: 'archived',
    relapseReasonTags,
  };
}

function quitFeelingEntry(opts: {
  hour: number;
  isRelapseMoment?: boolean;
  isResistedUrge?: boolean;
  daysAgo?: number;
  today?: string;
  approach?: string;
  urgePassed?: boolean;
}): QuitFeelingEntry {
  const today = opts.today ?? '2026-10-01';
  const date = new Date(`${today}T00:00:00`);
  date.setDate(date.getDate() - (opts.daysAgo ?? 0));
  const iso = date.toISOString().slice(0, 10);
  return {
    id: `qf-${Math.random()}`,
    trackId: TRACK_ID,
    feelingId: 'tense-stressed',
    zone: 'tense',
    isRelapseMoment: !!opts.isRelapseMoment,
    isResistedUrge: !!opts.isResistedUrge,
    approach: opts.approach,
    urgePassed: opts.urgePassed,
    createdAt: `${iso}T${String(opts.hour).padStart(2, '0')}:00:00`, // local time, no "Z" — see habitCheckIn's note above
  };
}

describe('relapseReasonCounts', () => {
  it('counts each reason tagged when a track ended, in the reason list order', () => {
    const tracks = [archivedTrack(['Stress']), archivedTrack(['Stress']), archivedTrack(['Stress', 'Sleep']), archivedTrack(['Sleep'])];
    const counts = relapseReasonCounts(tracks, HABIT_ID);
    expect(Object.fromEntries(counts.map((c) => [c.tag, c.count]))).toEqual({ Stress: 3, Sleep: 2 });
  });
});

describe('urgeTimeOfDayPattern', () => {
  it('finds the day-part most cravings and relapses happen in', () => {
    const tracks = [{ id: TRACK_ID, quitHabitId: HABIT_ID, startDate: '2026-08-01', createdAt: '2026-08-01T00:00:00Z', status: 'active' as const }];
    const entries = [
      quitFeelingEntry({ hour: 22, isResistedUrge: true }),
      quitFeelingEntry({ hour: 21, isRelapseMoment: true }),
      quitFeelingEntry({ hour: 23, isResistedUrge: true }),
      quitFeelingEntry({ hour: 9, isResistedUrge: true }),
    ];
    expect(urgeTimeOfDayPattern(entries, tracks, HABIT_ID)).toEqual({ bucket: 'night', count: 3 });
  });
});

describe('resistedUrgeTrend', () => {
  it('compares the resisted/relapse ratio of the last 30 days against the 30 before that', () => {
    const tracks = [{ id: TRACK_ID, quitHabitId: HABIT_ID, startDate: '2026-01-01', createdAt: '2026-01-01T00:00:00Z', status: 'active' as const }];
    const entries = [
      // last 30 days: 2 resisted, 0 relapses -> ratio 1.0
      quitFeelingEntry({ hour: 12, isResistedUrge: true, daysAgo: 5 }),
      quitFeelingEntry({ hour: 12, isResistedUrge: true, daysAgo: 10 }),
      // 30-60 days ago: 1 resisted, 1 relapse -> ratio 0.5
      quitFeelingEntry({ hour: 12, isResistedUrge: true, daysAgo: 40 }),
      quitFeelingEntry({ hour: 12, isRelapseMoment: true, daysAgo: 45 }),
    ];
    const trend = resistedUrgeTrend(entries, tracks, HABIT_ID, '2026-10-01');
    expect(trend.currentRatio).toBe(1);
    expect(trend.previousRatio).toBe(0.5);
    expect(trend.direction).toBe('more');
  });
});

describe('approachResults', () => {
  const tracks = [{ id: TRACK_ID, quitHabitId: HABIT_ID, startDate: '2026-08-01', createdAt: '2026-08-01T00:00:00Z', status: 'active' as const }];

  it('shows how every approach went, A to Z, without picking one', () => {
    const entries = [
      quitFeelingEntry({ hour: 12, isResistedUrge: true, approach: 'Step outside for a minute', urgePassed: true }),
      quitFeelingEntry({ hour: 12, isResistedUrge: true, approach: 'Step outside for a minute', urgePassed: true }),
      quitFeelingEntry({ hour: 12, isResistedUrge: true, approach: 'Step outside for a minute', urgePassed: false }),
      quitFeelingEntry({ hour: 12, isResistedUrge: true, approach: 'Riding it out', urgePassed: false }),
      quitFeelingEntry({ hour: 12, isResistedUrge: true, approach: 'Riding it out', urgePassed: false }),
      quitFeelingEntry({ hour: 12, isResistedUrge: true, approach: 'Riding it out', urgePassed: false }),
    ];
    expect(approachResults(entries, tracks, HABIT_ID)).toEqual([
      { approach: 'Riding it out', passedCount: 0, totalCount: 3 },
      { approach: 'Step outside for a minute', passedCount: 2, totalCount: 3 },
    ]);
  });

  it('leaves out an approach below the minimum sample size', () => {
    const entries = [
      quitFeelingEntry({ hour: 12, isResistedUrge: true, approach: 'Reaching out', urgePassed: true }),
      quitFeelingEntry({ hour: 12, isResistedUrge: true, approach: 'Reaching out', urgePassed: true }),
    ];
    expect(approachResults(entries, tracks, HABIT_ID)).toEqual([]);
  });
});

describe('rotatingJourneyStat', () => {
  const tracks = [{ id: TRACK_ID, quitHabitId: HABIT_ID, startDate: '2026-09-01', createdAt: '2026-09-01T00:00:00Z', status: 'active' as const }];

  it('returns undefined when there is nothing real to say yet', () => {
    expect(rotatingJourneyStat([], [], HABIT_ID, '2026-10-01')).toBeUndefined();
  });

  it('returns one of the real, true candidate stats for this habit', () => {
    const entries = [
      quitFeelingEntry({ hour: 12, isResistedUrge: true, daysAgo: 2 }),
      quitFeelingEntry({ hour: 12, isResistedUrge: true, daysAgo: 5 }),
    ];
    const stat = rotatingJourneyStat(entries, tracks, HABIT_ID, '2026-10-01');
    expect(stat).toMatch(/longest stretch|resisted \d+ urge|When you checked in/);
    expect(stat).not.toMatch(/tend|most|best/);
  });
});

describe('Build dashboard builders', () => {
  it('longestHabitStreak finds the longest consecutive run of Done days, not the current one', () => {
    const checkIns = [
      habitCheckIn('2026-09-01', true),
      habitCheckIn('2026-09-02', true),
      habitCheckIn('2026-09-03', true),
      habitCheckIn('2026-09-04', false),
      habitCheckIn('2026-09-10', true),
    ];
    expect(longestHabitStreak(checkIns, HABIT_ID)).toBe(3);
  });

  it('completionSeries gives one point per day with a trailing 7-day rate that never reaches before the start', () => {
    const checkIns = [habitCheckIn('2026-09-01', true), habitCheckIn('2026-09-02', false), habitCheckIn('2026-09-04', true)];
    const series = completionSeries(checkIns, HABIT_ID, '2026-09-01', '2026-09-08');
    expect(series).toHaveLength(8);
    expect(series[0]).toEqual({ date: '2026-09-01', rate: 100, status: 'done' }); // 1 of 1 day so far
    expect(series[1]).toEqual({ date: '2026-09-02', rate: 50, status: 'missed' }); // 1 of 2
    expect(series[2].status).toBe('none'); // no check-in counts as not done
    expect(series[7].rate).toBe(Math.round((1 / 7) * 100)); // window 09-02..09-08 holds one Done (09-04)
  });

  it('habitMilestones marks only the days already passed as reached, and adds graduation', () => {
    const habit: Habit = {
      id: HABIT_ID,
      name: 'Read',
      targetDays: 21,
      createdAt: '2026-09-01',
      reminderEnabled: false,
      reminderNotificationIds: [],
      graduatedAt: '2026-09-22',
      graduationChoice: 'formed',
    };
    const ms = habitMilestones(habit, '2026-09-08');
    expect(ms.map((m) => [m.label, m.day, m.reached])).toEqual([
      ['Day 1', 1, true],
      ['One week', 7, true],
      ['Halfway', 11, false],
      ['Target', 21, false],
      ['Formed', 22, true],
    ]);
  });

  it('sessionMinutesByTimeOfDay only counts check-ins that used the timed session', () => {
    const withMinutes = (date: string, hour: number, minutes: number): HabitCheckIn => ({ ...habitCheckIn(date, true, { hour }), durationMinutes: minutes });
    const checkIns = [withMinutes('2026-09-01', 7, 10), withMinutes('2026-09-02', 7, 20), withMinutes('2026-09-03', 8, 30), habitCheckIn('2026-09-04', true, { hour: 7 })];
    expect(sessionMinutesByTimeOfDay(checkIns, HABIT_ID)).toEqual([{ bucket: 'before 9am', averageMinutes: 20, count: 3 }]);
  });
});

describe('Quit dashboard builders', () => {
  const track = (id: string, startDate: string, endDate?: string): QuitTrack => ({
    id,
    quitHabitId: HABIT_ID,
    startDate,
    endDate,
    createdAt: `${startDate}T08:00:00Z`,
    status: endDate ? 'archived' : 'active',
  });

  it('quitHeaderStats counts across every track, not just the active one', () => {
    const tracks = [track('a', '2026-09-01', '2026-09-10'), track('b', '2026-09-10')];
    const entries = [{ ...quitFeelingEntry({ hour: 12, isResistedUrge: true }), trackId: 'a' }, { ...quitFeelingEntry({ hour: 12, isResistedUrge: true }), trackId: 'b' }];
    expect(quitHeaderStats(tracks, entries, HABIT_ID, '2026-09-15')).toEqual({ currentDays: 6, resistedTotal: 2, longestDays: 10, trackCount: 2 });
  });

  it('quitJourneySeries climbs within a track and drops back to day 1 when a new track starts the same day', () => {
    const tracks = [track('a', '2026-09-01', '2026-09-03'), track('b', '2026-09-03')];
    const days = quitJourneySeries(tracks, [], HABIT_ID, '2026-09-05');
    expect(days.map((d) => [d.date, d.trackNumber, d.dayCount, d.relapse])).toEqual([
      ['2026-09-01', 1, 1, false],
      ['2026-09-02', 1, 2, false],
      ['2026-09-03', 2, 1, true], // relapse on track 1, fresh start on track 2
      ['2026-09-04', 2, 2, false],
      ['2026-09-05', 2, 3, false],
    ]);
  });

  it('quitJourneySeries leaves a gap (not a zero) between a relapse and a later restart', () => {
    const tracks = [track('a', '2026-09-01', '2026-09-02'), track('b', '2026-09-05')];
    const dates = quitJourneySeries(tracks, [], HABIT_ID, '2026-09-06').map((d) => d.date);
    expect(dates).toEqual(['2026-09-01', '2026-09-02', '2026-09-05', '2026-09-06']);
  });

  it('the summaries never rank: no "often at night", "often around" or "most often"', () => {
    const tracks = [track(TRACK_ID, '2026-09-25')];
    const five = quitAnalysisSummary(
      tracks,
      [22, 23, 22, 23, 21].map((hour, i) => quitFeelingEntry({ hour, isResistedUrge: true, daysAgo: i })),
      HABIT_ID,
      '2026-10-01'
    );
    expect(five).toContain("You've resisted 5 urges this month.");
    expect(five).not.toMatch(/often|most/);
    const build = buildHabitAnalysisSummary(
      [habitCheckIn('2026-09-28', false), habitCheckIn('2026-09-29', true), habitCheckIn('2026-09-30', true)],
      [],
      HABIT_ID,
      '2026-10-01'
    );
    expect(build).toBe("Over the past 30 days, you've completed this habit 2 times and marked it missed 1 time.");
  });

  it('quitJourneyLog merges track starts, relapses and feelings into one newest-first list', () => {
    const tracks = [{ ...track('a', '2026-09-01', '2026-09-03'), relapseReflection: 'Rough week' }, track('b', '2026-09-04')];
    const entry = { ...quitFeelingEntry({ hour: 12, isResistedUrge: true, today: '2026-09-02' }), trackId: 'a' };
    const kinds = quitJourneyLog(tracks, [entry], HABIT_ID).map((e) => `${e.kind}:${e.trackNumber}`);
    expect(kinds).toEqual(['trackStart:2', 'trackEnd:1', 'feeling:1', 'trackStart:1']);
  });
});

describe('habit chain, re-entry and review', () => {
  const habit = (id: string, name: string, extra: Partial<Habit> = {}): Habit => ({
    id,
    name,
    targetDays: 30,
    createdAt: '2026-09-01',
    reminderEnabled: false,
    reminderNotificationIds: [],
    ...extra,
  });

  it('habitChain follows a cue back through another habit of the same name', () => {
    const wake = habit('a', 'Meditate', { cueRoutine: 'wake up' });
    const journal = habit('b', 'Journal', { cueRoutine: 'meditate' });
    expect(habitChain([wake, journal], journal).map((s) => s.label)).toEqual(['wake up', 'Meditate', 'Journal']);
  });

  it('habitChain stops on a cycle instead of looping forever', () => {
    const a = habit('a', 'A', { cueRoutine: 'b' });
    const b = habit('b', 'B', { cueRoutine: 'a' });
    expect(habitChain([a, b], a).map((s) => s.label)).toEqual(['a', 'B', 'A']);
  });

  it('days since last activity uses the latest of check-in, resume, or creation', () => {
    const h = habit('h', 'Read', { reentryAcknowledgedAt: '2026-09-10' });
    expect(daysSinceLastActivity(h, [{ id: 'c', habitId: 'h', date: '2026-09-05', done: true, createdAt: '' }], '2026-09-20')).toBe(10);
  });

  it('re-entry shows after 14 quiet days, not for archived or formed habits', () => {
    expect(needsReentry(habit('h', 'Read'), [], '2026-09-15')).toBe(true);
    expect(needsReentry(habit('h', 'Read'), [], '2026-09-14')).toBe(false);
    expect(needsReentry(habit('h', 'Read', { archivedAt: '2026-09-02' }), [], '2026-10-01')).toBe(false);
    expect(needsReentry(habit('h', 'Read', { graduationChoice: 'formed', graduatedAt: '2026-09-02' }), [], '2026-10-01')).toBe(false);
  });

  it('the weekly review comes due 7 days after the last one, never alongside re-entry', () => {
    const recent = [{ id: 'c', habitId: 'h', date: '2026-09-07', done: true, createdAt: '' }];
    expect(isReviewDue(habit('h', 'Read'), recent, '2026-09-08')).toBe(true);
    expect(isReviewDue(habit('h', 'Read', { lastReviewedAt: '2026-09-05' }), recent, '2026-09-08')).toBe(false);
    expect(isReviewDue(habit('h', 'Read'), [], '2026-09-20')).toBe(false); // re-entry wins
  });

  it('completionSeries judges a weekdays habit against its own schedule', () => {
    const mwf = { kind: 'weekdays' as const, days: [1, 3, 5] };
    // 2026-09-28 Mon … 2026-10-04 Sun; done on all three scheduled days
    const checkIns = ['2026-09-28', '2026-09-30', '2026-10-02'].map((d) => habitCheckIn(d, true));
    const series = completionSeries(checkIns, HABIT_ID, '2026-09-28', '2026-10-04', 7, mwf);
    expect(series[series.length - 1].rate).toBe(100);
    expect(series[1].status).toBe('off'); // Tuesday, nothing logged
    expect(longestHabitStreak(checkIns, HABIT_ID, mwf)).toBe(3);
  });
});
