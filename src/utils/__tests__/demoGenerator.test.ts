// Demo mode, stage 2: the sample data generator. Same seed, same story;
// dates relative to today with nothing in the future except plans; enough
// data for every chart and Insight; month graphs covering their whole month.
// These build the full 8-week sample set; give them room on a slow, busy
// machine (a coverage run) instead of the default 5 seconds.
jest.setTimeout(20_000);

jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []) }));

import { DEMO_DAYS, generateDemoData, localeCurrency, type DemoSections } from '../../demo/generate';
import { addDaysISO, daysInMonthISO } from '../date';
import { dailyTrendPoints, datesInRange } from '../feelingsStats';
import { frequencyStreak } from '../habitFrequency';
import { occursOn, letGoArchive } from '../taskRepeat';
import { carryOver } from '../dayView';
import {
  buckets,
  completionInsight,
  estimateInsight,
  feelingsInsight,
  insightRange,
  movedOften,
  occurrences,
  tagInsight,
  weeklyReview,
  energyInsight,
  overloadInsight,
} from '../planningInsights';
import type { DailyTask, FeelingCheckIn, FeelingZone, Habit, HabitCheckIn, Plan, PracticeSession, QuitFeelingEntry, QuitTrack, Skill, TaskTag } from '../../types/sections';

const IMAGES = { sketchEarly: 'img://early', sketchLatest: 'img://latest', bookPage: 'img://page', practiceNotes: 'img://notes' };
const TODAY = '2026-10-11';
const NOW = new Date(2026, 9, 11, 10, 30).getTime(); // 10:30 local, mid-morning
const gen = (today = TODAY, seed?: string, now = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8)), 10, 30).getTime()) =>
  generateDemoData({ today, seed, now, images: IMAGES, currency: 'EUR' });

const get = <T,>(d: DemoSections, section: string, key: string) => d[section][key] as T;
const doneOn = (t: DailyTask, d: string) => (t.repeat === 'none' ? t.done : t.completedDates.includes(d));

describe('determinism', () => {
  test('the same seed and day give exactly the same data', () => {
    expect(JSON.stringify(gen())).toBe(JSON.stringify(gen()));
  });
  test('another seed tells a different story', () => {
    expect(JSON.stringify(gen(TODAY, 'other-seed'))).not.toBe(JSON.stringify(gen()));
  });
});

describe('dates are relative to today', () => {
  const d = gen();
  const since = addDaysISO(TODAY, -DEMO_DAYS);

  // Every ISO date and datetime anywhere in the data, with where it was found.
  function allDates(value: unknown, path = ''): { path: string; value: string }[] {
    if (typeof value === 'string' && /^\d{4}-\d\d-\d\d/.test(value)) return [{ path, value }];
    if (Array.isArray(value)) return value.flatMap((v, i) => allDates(v, `${path}[${i}]`));
    if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => allDates(v, `${path}.${k}`));
    return [];
  }

  test('nothing is in the future except planned tasks, meals, goals and target dates', () => {
    const PLANNED = /dailyPlanning\.tasks\[\d+\]\.date$|plannedMeals\[\d+\]\.date$|\.(dueDate|deadline|goalTargetDate|targetDate)$/;
    for (const { path, value } of allDates(d)) {
      if (PLANNED.test(path)) continue;
      if (value.length > 10) expect({ path, ok: Date.parse(value) <= NOW }).toEqual({ path, ok: true });
      else expect({ path, ok: value <= TODAY }).toEqual({ path, ok: true });
    }
  });

  test('history spans about eight weeks', () => {
    const days = allDates(d).map((x) => x.value.slice(0, 10)).filter((v) => v <= TODAY);
    expect(days.sort()[0] >= addDaysISO(since, -1)).toBe(true);
    expect(days.some((v) => v <= addDaysISO(TODAY, -50))).toBe(true);
  });

  test.each(['2026-10-11', '2026-03-01', '2028-03-02', '2026-01-03', '2026-10-31'])('around %s, last month\'s 25th to its last day have feelings', (today) => {
    const entries = get<FeelingCheckIn[]>(gen(today), 'feelings', 'entries');
    const lastMonthEnd = addDaysISO(`${today.slice(0, 7)}-01`, -1);
    const days = new Set(entries.map((e) => e.date));
    for (let day = 25; day <= daysInMonthISO(lastMonthEnd); day++) expect(days.has(`${lastMonthEnd.slice(0, 8)}${day}`)).toBe(true);
    // ...so last month's graph has points right up to its end.
    const points = dailyTrendPoints(entries, datesInRange(`${lastMonthEnd.slice(0, 8)}01`, lastMonthEnd));
    expect(points[points.length - 1].date).toBe(lastMonthEnd);
  });

  test('just after midnight, today\'s items stay on today and in the past', () => {
    const justAfter = new Date(2026, 9, 11, 0, 1).getTime();
    const data = generateDemoData({ today: TODAY, now: justAfter, images: IMAGES });
    for (const e of get<FeelingCheckIn[]>(data, 'feelings', 'entries').filter((x) => x.date === TODAY)) {
      expect(Date.parse(e.createdAt)).toBeLessThanOrEqual(justAfter);
      expect(Date.parse(e.createdAt)).toBeGreaterThanOrEqual(new Date(2026, 9, 11).getTime());
    }
  });

  test('across a month end and a leap day it still builds', () => {
    for (const today of ['2026-03-31', '2028-02-29', '2026-12-31']) {
      const data = gen(today);
      expect(get<DailyTask[]>(data, 'dailyPlanning', 'tasks').length).toBeGreaterThan(80);
    }
  });
});

describe('Feelings: enough for every graph and Analysis card', () => {
  const entries = get<FeelingCheckIn[]>(gen(), 'feelings', 'entries');
  const own = entries.filter((e) => !e.source);
  test('about 40 check-ins of its own, plus feelings after tasks and habits', () => {
    expect(own.length).toBeGreaterThanOrEqual(35);
    expect(own.length).toBeLessThanOrEqual(55);
    expect(entries.some((e) => e.source?.kind === 'task')).toBe(true);
    expect(entries.some((e) => e.source?.kind === 'habit')).toBe(true);
  });
  test('all five zones, varied words, two-word blends with an intensity each, reason tags', () => {
    expect(new Set(own.map((e) => e.zone))).toEqual(new Set<FeelingZone>(['lively', 'calm', 'tense', 'low', 'okay']));
    expect(new Set(own.flatMap((e) => e.feelingIds)).size).toBeGreaterThan(15);
    const blends = own.filter((e) => e.feelingIds.length === 2);
    expect(blends.length).toBeGreaterThan(3);
    for (const b of blends) expect(Object.keys(b.intensities ?? {})).toEqual(b.feelingIds);
    expect(new Set(own.flatMap((e) => e.reasonTags ?? [])).size).toBeGreaterThanOrEqual(6);
  });
});

describe('Habits', () => {
  const d = gen();
  const habits = get<Habit[]>(d, 'habits', 'habits');
  const checkIns = get<HabitCheckIn[]>(d, 'habits', 'checkIns');
  test('four habits with believable patterns, not perfect streaks', () => {
    expect(habits).toHaveLength(4);
    for (const h of habits) {
      const mine = checkIns.filter((c) => c.habitId === h.id);
      expect(mine.length).toBeGreaterThan(8);
    }
    expect(checkIns.some((c) => !c.done && c.reasonTags?.length)).toBe(true);
  });
  test('one streak is paused (not reset)', () => {
    const s = frequencyStreak(checkIns, 'habit-demo-water', habits[3].frequency, TODAY);
    expect(s.paused).toBe(true);
    expect(s.current).toBeGreaterThan(0);
  });
  test('the minimum version was used a few times', () => {
    expect(checkIns.filter((c) => /Minimum version/.test(c.note ?? '')).length).toBeGreaterThanOrEqual(3);
  });
});

describe('Daily Planning: enough for Insights, carry-over and today', () => {
  const d = gen();
  const tasks = get<DailyTask[]>(d, 'dailyPlanning', 'tasks');
  const tags = get<TaskTag[]>(d, 'dailyPlanning', 'tags');
  const entries = get<FeelingCheckIn[]>(d, 'feelings', 'entries');
  const range = insightRange('month', TODAY, 1);
  const quarter = insightRange('quarter', TODAY, 1);
  const occ = occurrences(tasks, quarter, doneOn, entries);

  test('today, yesterday and next week all have tasks', () => {
    for (const day of [TODAY, addDaysISO(TODAY, -1)]) expect(tasks.some((t) => occursOn(t, day))).toBe(true);
    expect(tasks.filter((t) => t.date > TODAY && t.date <= addDaysISO(TODAY, 7)).length).toBeGreaterThanOrEqual(3);
  });

  test('tags, priorities, estimates, subtasks and feelings are all used', () => {
    expect(new Set(tasks.flatMap((t) => t.tagIds))).toEqual(new Set(tags.map((t) => t.id)));
    expect(new Set(tasks.map((t) => t.priority))).toEqual(new Set(['none', 'low', 'medium', 'high']));
    expect(tasks.filter((t) => t.subtasks.length).length).toBeGreaterThan(5);
    expect(tasks.filter((t) => t.feelingLinks && Object.keys(t.feelingLinks).length).length).toBeGreaterThanOrEqual(5);
  });

  test('every Insights card has enough to show', () => {
    expect(completionInsight(occurrences(tasks, range, doneOn, entries), buckets(range, 'day', 1)).enough).toBe(true);
    expect(tagInsight(occ, tasks, tags).enough).toBe(true);
    expect(estimateInsight(occ).enough).toBe(true);
    expect(energyInsight(occ).enough).toBe(true);
    expect(feelingsInsight(occ, tags).enough).toBe(true);
    expect(overloadInsight(occ, 480).enough).toBe(true);
    expect(weeklyReview(tasks, tags, TODAY, 1, doneOn, entries, 480, (t) => t.title)).toBeDefined();
  });

  test('carry-over, moved-often and let go each have an example', () => {
    expect(carryOver(tasks, TODAY, doneOn).length).toBeGreaterThanOrEqual(1);
    expect(movedOften(tasks, doneOn).length).toBeGreaterThanOrEqual(1);
    expect(letGoArchive(tasks)).toHaveLength(1);
  });

  test('the task linked to Plan Builder points at a real step', () => {
    const linked = tasks.find((t) => t.linkedPlan)!;
    const plan = get<Plan[]>(d, 'planBuilder', 'plans').find((p) => p.id === linked.linkedPlan!.planId)!;
    expect(plan.steps.some((s) => s.id === linked.linkedPlan!.path[0])).toBe(true);
  });

  test('insight wording on demo data is still correlational', () => {
    const CAUSAL = /\b(causes?|caused|makes you|because of|leads? to|results? in|due to)\b/i;
    const lines = [completionInsight(occ, buckets(quarter, 'week', 1)), tagInsight(occ, tasks, tags), estimateInsight(occ), energyInsight(occ), feelingsInsight(occ, tags), overloadInsight(occ, 480)].flatMap((i) => i.lines);
    expect(lines.length).toBeGreaterThan(5);
    for (const l of lines) expect(l).not.toMatch(CAUSAL);
  });
});

describe('the other sections', () => {
  const d = gen();
  test('Plan Builder: three plans; steps, sub-steps, alternatives, colors; one partly done; one recurring', () => {
    const plans = get<Plan[]>(d, 'planBuilder', 'plans');
    expect(plans).toHaveLength(3);
    const all = plans.flatMap((p) => p.steps);
    expect(all.some((s) => s.subSteps.length)).toBe(true);
    expect(all.some((s) => s.alternatives.length)).toBe(true);
    expect(all.some((s) => s.color)).toBe(true);
    expect(plans.some((p) => p.steps.some((s) => s.done) && p.steps.some((s) => !s.done))).toBe(true);
    expect(plans.some((p) => p.reviewIntervalDays)).toBe(true);
  });

  test('Journaling: about 15 entries, all five zones, handwriting fonts, gentle', () => {
    const entries = get<{ zone: FeelingZone; font?: string; text: string }[]>(d, 'journaling', 'entries');
    expect(entries.length).toBe(15);
    expect(new Set(entries.map((e) => e.zone)).size).toBe(5);
    expect(entries.filter((e) => e.font === 'caveat' || e.font === 'patrickHand').length).toBeGreaterThanOrEqual(2);
  });

  test('Quit: a journey with resisted urges and one slip that\'s part of it (an archived track, then a new one)', () => {
    const tracks = get<QuitTrack[]>(d, 'quitHabit', 'tracks');
    const feelings = get<QuitFeelingEntry[]>(d, 'quitHabit', 'feelingEntries');
    expect(tracks.map((t) => t.status)).toEqual(['archived', 'active']);
    expect(feelings.filter((f) => f.isResistedUrge && f.approach).length).toBeGreaterThanOrEqual(5);
    expect(feelings.filter((f) => f.isRelapseMoment)).toHaveLength(1);
  });

  test('Skills: two skills with levels, sub-skills, metrics, a plateau, and first-vs-latest photos', () => {
    const skills = get<Skill[]>(d, 'skills', 'skills');
    const sessions = get<PracticeSession[]>(d, 'skills', 'sessions');
    expect(skills).toHaveLength(2);
    for (const s of skills) expect(s.subSkills?.length && s.metrics?.length && s.levelHistory?.length).toBeTruthy();
    const guitar = sessions.filter((s) => s.skillId === 'skill-demo-guitar').sort((a, b) => a.date.localeCompare(b.date));
    const values = guitar.map((s) => s.metricValues!['metric-demo-changes']);
    expect(values[values.length - 1]).toBeGreaterThan(values[0]); // progress...
    const lastTwoWeeks = guitar.filter((s) => s.date > addDaysISO(TODAY, -14)).map((s) => s.metricValues!['metric-demo-changes']);
    expect(Math.max(...lastTwoWeeks) - Math.min(...lastTwoWeeks)).toBeLessThanOrEqual(2); // ...then a plateau
    const photos = sessions.filter((s) => s.skillId === 'skill-demo-sketch' && s.photoUri).map((s) => s.photoUri);
    expect(photos).toEqual(expect.arrayContaining([IMAGES.sketchEarly, IMAGES.sketchLatest]));
  });

  test('Study, Sleep, Book, Budget, Diet, Songs, Games, Thoughts, Recap all have data', () => {
    expect(get<unknown[]>(d, 'studySession', 'sessions').length).toBeGreaterThanOrEqual(5);
    expect(get<unknown[]>(d, 'sleep', 'logs').length).toBeGreaterThanOrEqual(8);
    expect(get<unknown[]>(d, 'sleep', 'mix').length).toBeGreaterThan(0);
    const books = get<{ status: string; totalPages?: number }[]>(d, 'book', 'entries');
    expect(books.map((b) => b.status)).toEqual(['reading', 'finished']);
    expect(get<{ photoUri?: string }[]>(d, 'book', 'quotes').some((q) => q.photoUri === IMAGES.bookPage)).toBe(true);
    expect(get<{ currency: string }[]>(d, 'budget', 'budgets').every((b) => b.currency === 'EUR')).toBe(true);
    const month = get<{ budgetId: string; date: string; amount: number }[]>(d, 'budget', 'entries').filter((e) => e.budgetId === 'budget-demo-month' && e.date >= '2026-10-01');
    expect(month.reduce((s, e) => s + e.amount, 0) / 1200).toBeGreaterThanOrEqual(0.8); // a gentle "getting close" warning
    expect(get<unknown[]>(d, 'dietPlanning', 'plannedMeals').length).toBeGreaterThanOrEqual(21);
    expect(get<{ status: string }[]>(d, 'songwriting', 'songs').map((s) => s.status)).toEqual(['finished', 'in-progress']);
    expect(get<unknown[]>(d, 'mindGames', 'results').length).toBeGreaterThanOrEqual(5);
    const thoughts = get<{ promotedTo?: string }[]>(d, 'catchAThought', 'thoughts');
    expect(thoughts).toHaveLength(10);
    expect(thoughts.filter((t) => t.promotedTo).length).toBeGreaterThanOrEqual(2);
    expect(get<unknown[]>(d, 'recap', 'bestMoments').length).toBeGreaterThanOrEqual(2);
  });

  test('gentle content: no distressing words anywhere', () => {
    // Only the words people read (values), as whole words.
    const values: string[] = [];
    const walk = (v: unknown) => (typeof v === 'string' ? values.push(v) : Array.isArray(v) ? v.forEach(walk) : v && typeof v === 'object' ? Object.values(v).forEach(walk) : undefined);
    walk(d);
    const text = values.join(' | ');
    expect(text).not.toMatch(/\b(suicide|self-harm|die|died|kill|hate|drunk|alcohol|cigarettes?|vape|gambling)\b/i);
  });

  test('no placeholder ids leak out: every id is a demo id', () => {
    const tasks = get<DailyTask[]>(d, 'dailyPlanning', 'tasks');
    for (const t of tasks) expect(t.id).toMatch(/demo/);
  });
});

test('the phone\'s currency is used when Ona supports it', () => {
  expect(typeof localeCurrency()).toBe('string');
  expect(localeCurrency()).toMatch(/^[A-Z]{3}$/);
});
