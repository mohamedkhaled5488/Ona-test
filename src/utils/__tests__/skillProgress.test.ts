import {
  metricSeries,
  metricChange,
  describeMetricChange,
  directional,
  detectPlateau,
  plateauPeriods,
  linearTrend,
  weeklyMinutes,
  weeklyGoalProgress,
  subSkillTime,
  subSkillName,
  neglectedSubSkills,
  suggestedFocus,
  struggleCounts,
  sweetSpot,
  effortAndProgress,
  weeklyDifficulty,
  monthlyRecap,
  skillSummary,
  buildJourney,
  primaryMetric,
  activeMetrics,
  totalMinutesFor,
  learningDuration,
  type MetricPoint,
} from '../skillProgress';
import type { PracticeSession, Skill, SkillMetric } from '../../types/sections';

const SKILL = 'sk';

function skill(extra: Partial<Skill> = {}): Skill {
  return {
    id: SKILL,
    name: 'Guitar',
    color: '#000',
    icon: 'musical-notes-outline',
    startDate: '2026-06-01',
    milestones: [],
    reminderEnabled: false,
    reminderNotificationIds: [],
    ...extra,
  };
}

let seq = 0;
function session(date: string, extra: Partial<PracticeSession> = {}): PracticeSession {
  seq += 1;
  return { id: `s${seq}`, skillId: SKILL, date, minutes: 30, hasVoiceMemo: false, createdAt: `${date}T12:00:${String(seq % 60).padStart(2, '0')}Z`, ...extra };
}

const WPM: SkillMetric = { id: 'wpm', name: 'Typing speed', unit: 'WPM', direction: 'higher', role: 'primary', createdAt: '2026-06-01' };
const RUN: SkillMetric = { id: 'run', name: '5K time', unit: 'min', direction: 'lower', role: 'primary', createdAt: '2026-06-01' };

function series(values: [string, number][]): MetricPoint[] {
  return values.map(([date, value], i) => ({ date, value, sessionId: `p${i}` }));
}

// Dates spread across the 28-day window ending 2026-10-01.
const WINDOW_DATES = ['2026-09-04', '2026-09-10', '2026-09-16', '2026-09-22', '2026-09-28', '2026-10-01'];

describe('lower-is-better metrics count a decrease as improvement everywhere', () => {
  it('directional flips the sign for lower-is-better', () => {
    expect(directional('higher', 5)).toBe(5);
    expect(directional('lower', -2)).toBe(2);
  });

  it('home-screen change text: a faster 5K reads as better, not as a drop', () => {
    const change = metricChange(series([['2026-06-01', 31], ['2026-09-01', 28]]), 'lower')!;
    expect(change.improvement).toBe(3);
    expect(describeMetricChange(RUN, change)).toBe('31 → 28 min · 3 min better since you began');
  });

  it('home-screen change text for higher-is-better', () => {
    const change = metricChange(series([['2026-06-01', 42], ['2026-09-01', 58]]), 'higher')!;
    expect(describeMetricChange(WPM, change)).toBe('42 → 58 WPM · +16 since you began');
  });

  it('a slower 5K is never described as progress', () => {
    const change = metricChange(series([['2026-06-01', 28], ['2026-09-01', 31]]), 'lower')!;
    expect(change.improvement).toBeLessThan(0);
    expect(describeMetricChange(RUN, change)).not.toMatch(/better|\+/);
  });

  it('graph trend: a steadily dropping 5K has a negative slope (improving)', () => {
    const trend = linearTrend(series([['2026-06-01', 31], ['2026-07-01', 30], ['2026-08-01', 29]]))!;
    expect(trend.slope).toBeLessThan(0);
  });

  it('plateau detection: a steadily falling 5K time is NOT a plateau', () => {
    const falling = series(WINDOW_DATES.map((d, i) => [d, 30 - i * 0.8]));
    expect(detectPlateau(falling, 'lower', '2026-10-01')).toBeUndefined();
  });

  it('plateau detection: a flat 5K time IS a plateau', () => {
    const flat = series(WINDOW_DATES.map((d, i) => [d, 28 + (i % 2 ? 0.2 : -0.2)]));
    expect(detectPlateau(flat, 'lower', '2026-10-01')).toBeDefined();
  });
});

describe('plateau detection', () => {
  it('detects a flat stretch over ~4 weeks', () => {
    const flat = series(WINDOW_DATES.map((d, i) => [d, 50 + (i % 2 ? 1 : -1)]));
    const p = detectPlateau(flat, 'higher', '2026-10-01');
    expect(p).toBeDefined();
    expect(p!.weeks).toBe(4);
  });

  it('does not trigger with too few entries in the window (sparse data)', () => {
    const sparse = series([['2026-09-04', 50], ['2026-09-20', 50], ['2026-10-01', 50]]);
    expect(detectPlateau(sparse, 'higher', '2026-10-01')).toBeUndefined();
  });

  it('does not trigger when all entries are crammed into the last few days', () => {
    const crammed = series(['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'].map((d) => [d, 50]));
    expect(detectPlateau(crammed, 'higher', '2026-10-01')).toBeUndefined();
  });

  it('a single outlier session cannot hide a plateau', () => {
    const values = [50, 51, 49, 80, 50, 51]; // one freak good day
    const withOutlier = series(WINDOW_DATES.map((d, i) => [d, values[i]]));
    expect(detectPlateau(withOutlier, 'higher', '2026-10-01')).toBeDefined();
  });

  it('a single outlier session cannot fake a plateau in a steadily improving series', () => {
    const values = [40, 44, 20, 52, 56, 60]; // one bad day in a clear climb
    const improving = series(WINDOW_DATES.map((d, i) => [d, values[i]]));
    expect(detectPlateau(improving, 'higher', '2026-10-01')).toBeUndefined();
  });

  it('a clear decline is not called "steady"', () => {
    const declining = series(WINDOW_DATES.map((d, i) => [d, 60 - i * 4]));
    expect(detectPlateau(declining, 'higher', '2026-10-01')).toBeUndefined();
  });

  it('plateauPeriods returns no bands for zero or tiny data', () => {
    expect(plateauPeriods([], 'higher')).toEqual([]);
    expect(plateauPeriods(series([['2026-09-01', 5]]), 'higher')).toEqual([]);
  });
});

describe('sessions without details still work', () => {
  const bare = [session('2026-09-01'), session('2026-09-02', { minutes: 0 })];
  const s = skill({ metrics: [WPM], subSkills: [{ id: 'a', name: 'Chords', level: 2, createdAt: '' }] });

  it('a session with no metric value just has no point on the metric graph', () => {
    expect(metricSeries(bare, SKILL, 'wpm')).toEqual([]);
    expect(metricChange([], 'higher')).toBeUndefined();
  });

  it('still counts toward time, weeks and the summary', () => {
    expect(totalMinutesFor(bare, SKILL)).toBe(30);
    expect(weeklyMinutes(bare, SKILL, '2026-09-01', '2026-09-02')[0].minutes).toBe(30);
    expect(skillSummary(s, bare, '2026-09-02')).toMatch(/^You've practiced Guitar for 30 min/);
  });

  it('no difficulty ratings means empty difficulty weeks, not a crash', () => {
    const weeks = weeklyDifficulty(bare, SKILL, '2026-09-01', '2026-09-02');
    expect(weeks).toHaveLength(1);
    expect(Object.values(weeks[0].counts).every((n) => n === 0)).toBe(true);
  });

  it('no focus sub-skills means zero time per sub-skill, not a crash', () => {
    expect(subSkillTime(s, bare)[0].minutes).toBe(0);
  });
});

describe('sub-skills', () => {
  it('an archived sub-skill keeps its history and still shows by name', () => {
    const s = skill({ subSkills: [{ id: 'fp', name: 'Fingerpicking', level: 2, createdAt: '', archivedAt: '2026-09-10' }] });
    const sessions = [session('2026-09-01', { focusSubSkillIds: ['fp'], minutes: 40 })];
    const time = subSkillTime(s, sessions);
    expect(time).toHaveLength(1);
    expect(time[0].minutes).toBe(40);
    expect(subSkillName(s, 'fp')).toBe('Fingerpicking (archived)');
  });

  it('an archived sub-skill with no history drops out of the balance chart', () => {
    const s = skill({ subSkills: [{ id: 'x', name: 'Old', level: 1, createdAt: '', archivedAt: '2026-09-10' }] });
    expect(subSkillTime(s, [])).toEqual([]);
  });

  it('a session focused on two sub-skills splits its minutes between them', () => {
    const s = skill({ subSkills: [{ id: 'a', name: 'Chords', level: 2, createdAt: '' }, { id: 'b', name: 'Strumming', level: 2, createdAt: '' }] });
    const time = subSkillTime(s, [session('2026-09-01', { focusSubSkillIds: ['a', 'b'], minutes: 60 })]);
    expect(time.map((t) => t.minutes)).toEqual([30, 30]);
  });

  it('neglected: names a sub-skill untouched for 3 weeks, not one practiced recently', () => {
    const s = skill({ subSkills: [{ id: 'a', name: 'Chords', level: 2, createdAt: '' }, { id: 'b', name: 'Fingerpicking', level: 2, createdAt: '' }] });
    const sessions = [session('2026-09-01', { focusSubSkillIds: ['b'] }), session('2026-09-28', { focusSubSkillIds: ['a'] })];
    const neglected = neglectedSubSkills(s, sessions, '2026-10-01');
    expect(neglected.map((n) => [n.subSkill.name, n.daysSince])).toEqual([['Fingerpicking', 30]]);
  });

  it('suggested focus prefers last session\'s struggle, else the least recently practiced', () => {
    const s = skill({ subSkills: [{ id: 'a', name: 'Chords', level: 2, createdAt: '' }, { id: 'b', name: 'Barre chords', level: 1, createdAt: '' }] });
    expect(suggestedFocus(s, [session('2026-09-01', { focusSubSkillIds: ['a'], struggledSubSkillIds: ['b'] })])).toMatchObject({ reason: 'struggled', subSkill: { name: 'Barre chords' } });
    expect(suggestedFocus(s, [session('2026-09-01', { focusSubSkillIds: ['a'] })])).toMatchObject({ reason: 'leastRecent', subSkill: { name: 'Barre chords' } });
  });

  it('struggled with: every sub-skill marked, with its count, in sub-skill order, gated by a minimum', () => {
    const s = skill({ subSkills: [{ id: 'a', name: 'Chords', level: 2, createdAt: '' }, { id: 'b', name: 'Barre chords', level: 1, createdAt: '' }] });
    const sessions = ['09-01', '09-03', '09-05', '09-07', '09-09'].map((d, i) => session(`2026-${d}`, { struggledSubSkillIds: i < 4 ? ['b'] : ['a'] }));
    const r = struggleCounts(s, sessions)!;
    expect(r.of).toBe(5);
    expect(r.counts.map((c) => [c.subSkill.name, c.count])).toEqual([['Chords', 1], ['Barre chords', 4]]);
    expect(struggleCounts(s, sessions.slice(0, 2))).toBeUndefined();
  });
});

describe('metric definition changes', () => {
  it('a redefined metric keeps the old values under the archived metric; the new one starts fresh', () => {
    const old: SkillMetric = { ...WPM, archivedAt: '2026-08-01' };
    const replacement: SkillMetric = { ...WPM, id: 'wpm2', name: 'Typing speed (accuracy-adjusted)', createdAt: '2026-08-01' };
    const s = skill({ metrics: [old, replacement] });
    const sessions = [session('2026-07-01', { metricValues: { wpm: 40 } }), session('2026-08-05', { metricValues: { wpm2: 38 } })];
    expect(primaryMetric(s)?.id).toBe('wpm2');
    expect(activeMetrics(s).map((m) => m.id)).toEqual(['wpm2']);
    expect(metricSeries(sessions, SKILL, 'wpm')).toHaveLength(1); // old values retained
    expect(metricSeries(sessions, SKILL, 'wpm2')).toHaveLength(1);
  });
});

describe('weeks and dates', () => {
  it('weeks run Monday–Sunday straight across a year boundary', () => {
    // Mon 2026-12-28 … Sun 2027-01-03 is one week
    const sessions = [session('2026-12-30', { minutes: 20 }), session('2027-01-02', { minutes: 25 }), session('2027-01-04', { minutes: 10 })];
    const weeks = weeklyMinutes(sessions, SKILL, '2026-12-28', '2027-01-04');
    expect(weeks).toEqual([{ weekStart: '2026-12-28', minutes: 45 }, { weekStart: '2027-01-04', minutes: 10 }]);
  });

  it('a week across a month boundary stays one week', () => {
    // Mon 2026-09-28 … Sun 2026-10-04
    const sessions = [session('2026-09-30', { minutes: 30 }), session('2026-10-02', { minutes: 30 })];
    expect(weeklyMinutes(sessions, SKILL, '2026-09-28', '2026-10-04')).toEqual([{ weekStart: '2026-09-28', minutes: 60 }]);
  });

  it('empty weeks show as zero, not missing', () => {
    const weeks = weeklyMinutes([session('2026-09-01')], SKILL, '2026-09-01', '2026-09-20');
    expect(weeks.map((w) => w.minutes)).toEqual([30, 0, 0]);
  });

  it('weekly goal uses stored local dates, so a later time-zone change cannot move a session into another week', () => {
    // createdAt is a UTC instant on the next day; the stored local date is what counts.
    const s = skill({ weeklyGoalMinutes: 120 });
    const late = session('2026-10-04', { minutes: 60, createdAt: '2026-10-05T03:00:00Z' }); // Sunday evening locally
    const progress = weeklyGoalProgress(s, [late], '2026-10-04')!;
    expect(progress.minutes).toBe(60);
    expect(weeklyGoalProgress(s, [late], '2026-10-05')!.minutes).toBe(0); // the new week starts clean
  });

  it('weekly goal caps at 100% and is undefined when not set', () => {
    const s = skill({ weeklyGoalMinutes: 60 });
    expect(weeklyGoalProgress(s, [session('2026-10-01', { minutes: 90 })], '2026-10-01')!.fraction).toBe(1);
    expect(weeklyGoalProgress(skill(), [], '2026-10-01')).toBeUndefined();
  });

  it('two sessions on the same day: minutes add up; the later metric value is that day\'s point', () => {
    const sessions = [
      session('2026-09-01', { minutes: 20, metricValues: { wpm: 40 }, createdAt: '2026-09-01T08:00:00Z' }),
      session('2026-09-01', { minutes: 25, metricValues: { wpm: 44 }, createdAt: '2026-09-01T19:00:00Z' }),
    ];
    expect(totalMinutesFor(sessions, SKILL)).toBe(45);
    expect(metricSeries(sessions, SKILL, 'wpm')).toEqual([{ date: '2026-09-01', value: 44, sessionId: sessions[1].id }]);
  });

  it('two same-day sessions with identical timestamps: the newer (stored first) still wins', () => {
    const older = session('2026-09-01', { metricValues: { wpm: 1 }, createdAt: '2026-09-01T10:00:00Z' });
    const newer = session('2026-09-01', { metricValues: { wpm: 3 }, createdAt: '2026-09-01T10:00:00Z' });
    expect(metricSeries([newer, older], SKILL, 'wpm')[0].value).toBe(3); // the store keeps newest first
  });

  it('a session spanning midnight is attributed (with all its minutes) to the day and week it started', () => {
    // Started Sunday 2026-10-04 at 23:30, ran 60 minutes into Monday.
    const spanning = session('2026-10-04', { minutes: 60, startedAt: '2026-10-04T23:30:00', createdAt: '2026-10-05T00:30:00' });
    const weeks = weeklyMinutes([spanning], SKILL, '2026-09-28', '2026-10-05');
    expect(weeks).toEqual([{ weekStart: '2026-09-28', minutes: 60 }, { weekStart: '2026-10-05', minutes: 0 }]);
    expect(monthlyRecap(skill(), [spanning], '2026-10').minutes).toBe(60);
  });
});

describe('insights stay quiet until the data supports them', () => {
  it('sweet spot needs enough rated sessions and metric entries', () => {
    expect(sweetSpot([session('2026-09-01', { difficulty: 'justRight' })], SKILL, series([['2026-09-01', 1]]), 'higher')).toBeUndefined();
  });

  it('sweet spot: stronger stretches with more Just right / Challenging sessions', () => {
    const sessions: PracticeSession[] = [];
    const points: [string, number][] = [];
    let value = 50;
    for (let i = 0; i < 8; i++) {
      const day = String(1 + i * 3).padStart(2, '0');
      const strong = i % 2 === 1;
      if (i > 0) {
        sessions.push(session(`2026-08-${day}`, { difficulty: strong ? 'challenging' : 'tooEasy' }));
        sessions.push(session(`2026-08-${day}`, { difficulty: strong ? 'justRight' : 'tooEasy' }));
      }
      value += strong ? 5 : 0;
      points.push([`2026-08-${day}`, value]);
    }
    const result = sweetSpot(sessions, SKILL, series(points), 'higher');
    expect(result).toBeDefined();
    expect(result!.strongShare).toBeGreaterThan(result!.weakShare);
  });

  it('effort and progress needs enough weeks', () => {
    expect(effortAndProgress([session('2026-09-01')], SKILL, series([['2026-09-01', 1], ['2026-09-08', 2]]), 'higher')).toBeUndefined();
  });

  it('effort and progress: more minutes in the weeks with bigger gains', () => {
    const sessions: PracticeSession[] = [];
    const points: [string, number][] = [];
    let value = 30;
    for (let w = 0; w < 8; w++) {
      const date = addDays('2026-07-06', w * 7); // Mondays
      const minutes = w === 0 ? 30 : 30 + (w % 2) * 90;
      sessions.push(session(date, { minutes }));
      value += w === 0 ? 0 : (w % 2) * 4 + 0.5;
      points.push([date, value]);
    }
    expect(effortAndProgress(sessions, SKILL, series(points), 'higher')).toBeDefined();
  });

  it('zero-data: every function returns an empty / undefined result instead of throwing', () => {
    const s = skill({ metrics: [WPM], subSkills: [{ id: 'a', name: 'Chords', level: 1, createdAt: '' }] });
    expect(skillSummary(s, [], '2026-10-01')).toBeUndefined();
    expect(suggestedFocus(s, [])).toMatchObject({ reason: 'leastRecent' });
    expect(neglectedSubSkills(s, [], '2026-10-01')).toEqual([]);
    expect(struggleCounts(s, [])).toBeUndefined();
    expect(sweetSpot([], SKILL, [], 'higher')).toBeUndefined();
    expect(effortAndProgress([], SKILL, [], 'higher')).toBeUndefined();
    expect(detectPlateau([], 'higher', '2026-10-01')).toBeUndefined();
    expect(linearTrend([])).toBeUndefined();
    expect(monthlyRecap(s, [], '2026-10')).toEqual({ minutes: 0, sessions: 0, milestones: 0 });
    expect(buildJourney(s, []).map((e) => e.kind)).toEqual(['start']);
  });
});

describe('summary, recap and journey', () => {
  it('summary names the metric change and the time per sub-skill, in sub-skill order', () => {
    const s = skill({
      startDate: '2026-06-01',
      metrics: [{ ...WPM, name: 'songs played cleanly', unit: '' }],
      subSkills: [{ id: 'st', name: 'Strumming', level: 2, createdAt: '' }, { id: 'fp', name: 'Fingerpicking', level: 1, createdAt: '' }],
    });
    const sessions = [
      session('2026-06-02', { minutes: 120, focusSubSkillIds: ['st'], metricValues: { wpm: 0 } }),
      session('2026-09-30', { minutes: 60, focusSubSkillIds: ['fp'], metricValues: { wpm: 3 } }),
    ];
    expect(skillSummary(s, sessions, '2026-10-01')).toBe(
      'You\'ve practiced Guitar for 3 h over 4 months. Your "songs played cleanly" went from 0 to 3. Time per sub-skill: Strumming 2 h · Fingerpicking 1 h.'
    );
  });

  it('monthly recap counts minutes, sessions and milestones reached that month', () => {
    const s = skill({ milestones: [{ id: 'm', text: 'First song', achieved: true, achievedAt: '2026-10-12' }] });
    expect(monthlyRecap(s, [session('2026-10-01', { minutes: 40 }), session('2026-09-30')], '2026-10')).toEqual({ minutes: 40, sessions: 1, milestones: 1 });
  });

  it('journey: chronological, with breakthroughs, feedback, photos, finished resources, and the next milestone last', () => {
    const s = skill({
      startingLevel: 'starting',
      goal: 'Play at an open mic',
      milestones: [
        { id: 'm1', text: 'First full song', achieved: true, achievedAt: '2026-08-01' },
        { id: 'm2', text: 'Open mic', achieved: false, targetDate: '2026-12-01' },
      ],
      levelHistory: [{ id: 'l', date: '2026-08-02', from: 'starting', to: 'some' }],
      resources: [{ id: 'r', name: 'Justin Guitar', type: 'course', status: 'done', doneAt: '2026-07-15', createdAt: '' }],
    });
    const sessions = [
      session('2026-07-01', { breakthrough: true }),
      session('2026-07-10', { feedback: { from: 'teacher', text: 'Relax the wrist' }, photoUri: 'file://x.jpg' }),
    ];
    const kinds = buildJourney(s, sessions).map((e) => e.kind);
    expect(kinds).toEqual(['start', 'breakthrough', 'feedback', 'photo', 'resource', 'milestone', 'level', 'next']);
  });

  it('learning duration reads naturally', () => {
    expect(learningDuration('2026-10-01', '2026-10-01')).toBe('1 day');
    expect(learningDuration('2026-06-01', '2026-10-01')).toBe('4 months');
  });
});

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('metric value formatting', () => {
  it('singularizes plain plural units for exactly 1, leaves other units alone', () => {
    const { formatMetricValue } = require('../skillProgress');
    expect(formatMetricValue(1, 'songs')).toBe('1 song');
    expect(formatMetricValue(3, 'songs')).toBe('3 songs');
    expect(formatMetricValue(1, 'sec')).toBe('1 sec');
    expect(formatMetricValue(1, 'WPM')).toBe('1 WPM');
    expect(formatMetricValue(7.25, '/10')).toBe('7.3 /10');
  });
});
