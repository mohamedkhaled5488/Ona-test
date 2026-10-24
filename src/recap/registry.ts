// The Recap registry: every section registers one contributor, and Recap
// (Home's area tiles and every area page) reads only from here. A section
// without a contributor fails recapRegistry.test.ts, so a new section can't
// be forgotten. Numbers come from the same functions the sections use for
// their own pages (Quit: quitJourneySeries), so they always match.
//
// Wording follows the design philosophy: counts in a fixed order, never a
// ranking; Quit as a journey, a slip as a new chapter, never "failed".
import type { FeelingZone, SectionId } from '../types/sections';
import type { RecapPeriod } from '../utils/feelingsStats';
import { AREA_TITLES, bucketSeries, summarySentence, formatDuration, growDetails, learnDetails, planDetails, type AreaId, type PeriodStats, type RecapData } from '../utils/recapStats';
import { buildSkillsTimeBreakdown } from '../utils/recap';
import { quitJourneySeries } from '../utils/habitStats';
import { journeyCounts, localDateOf, sessionSeconds } from '../quit/journey';
import { formatMoney } from '../data/currencies';
import { sectionAccents } from '../theme';

export type RecapOpen = { section: SectionId; params?: Record<string, string> } | { route: 'planDetail'; params: { planId: string } };
export interface RecapRow {
  label: string;
  value: string;
  open?: RecapOpen;
}
export interface RecapItem {
  id: string;
  title: string;
  caption?: string; // e.g. "3 of 8 steps", "Longest run: 5 days"
  fraction?: number; // 0..1, drawn as a progress bar
  color?: string;
  open?: RecapOpen;
}
export interface SectionRecap {
  section: SectionId;
  title: string;
  hasData: boolean;
  rows: RecapRow[];
  items: RecapItem[];
  notes: string[];
  zoneMix?: Record<FeelingZone, number>; // Feelings: drawn as the zone bar
  bars?: number[]; // per day (or bucket), drawn as small bars
}
export interface RecapContext {
  data: RecapData;
  stats: PeriodStats;
  today: string;
}
export interface RecapContributor {
  section: SectionId;
  area: AreaId;
  title: string;
  // Feelings and Quit: private. Out of the shared story unless included, and
  // hidden on Home with "Hide sensitive areas on Home".
  sensitive?: boolean;
  build: (ctx: RecapContext) => SectionRecap;
  // Per day, for the area tile's small bars (optional).
  perDay?: (ctx: RecapContext, date: string) => number;
}

const inRange = (date: string, s: PeriodStats) => date >= s.range.start && date <= s.range.end;
const recap = (section: SectionId, title: string, hasData: boolean, rows: RecapRow[], extra: Partial<SectionRecap> = {}): SectionRecap => ({ section, title, hasData, rows, items: [], notes: [], ...extra });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const RECAP_CONTRIBUTORS: RecapContributor[] = [
  // --- Plan ---
  {
    section: 'dailyPlanning',
    area: 'plan',
    title: 'Daily Planning',
    perDay: ({ stats }, d) => stats.tasksByDay[d]?.done ?? 0,
    build: ({ stats }) => {
      const rate = stats.tasksPlanned ? Math.round((stats.tasksCompleted / stats.tasksPlanned) * 100) : undefined;
      return recap('dailyPlanning', 'Daily Planning', stats.tasksPlanned > 0, [
        { label: 'Tasks done', value: `${stats.tasksCompleted} of ${stats.tasksPlanned}`, open: { section: 'dailyPlanning' } },
        ...(rate !== undefined ? [{ label: 'Completion', value: `${rate}%` }] : []),
      ], { bars: stats.dates.length <= 31 ? stats.dates.map((d) => stats.tasksByDay[d]?.done ?? 0) : undefined });
    },
  },
  {
    section: 'planBuilder',
    area: 'plan',
    title: 'Plans',
    build: ({ data, stats }) => {
      const plans = planDetails(data, stats).plans;
      const stepsDone = plans.reduce((n, p) => n + p.done, 0);
      return recap('planBuilder', 'Plans', plans.length > 0, plans.length ? [{ label: 'Steps done across active plans', value: String(stepsDone), open: { section: 'planBuilder' } }] : [], {
        items: plans.map((p) => ({ id: p.id, title: p.title, caption: `${p.done} of ${p.total} steps`, fraction: p.done / p.total, color: p.color, open: { route: 'planDetail', params: { planId: p.id } } })),
      });
    },
  },
  {
    section: 'dietPlanning',
    area: 'plan',
    title: 'Diet',
    build: ({ stats }) => recap('dietPlanning', 'Diet', stats.mealsPlanned > 0, [{ label: 'Meals planned', value: String(stats.mealsPlanned), open: { section: 'dietPlanning' } }]),
  },
  {
    section: 'budget',
    area: 'plan',
    title: 'Budget',
    build: ({ data, stats }) => {
      const entries = data.budgetEntries.filter((e) => inRange(e.date, stats));
      const spending = planDetails(data, stats).spending;
      return recap('budget', 'Budget', entries.length > 0, [
        { label: 'Entries logged', value: String(entries.length), open: { section: 'budget' } },
        ...spending.map((b) => ({ label: b.name, value: `${b.mode === 'goal' ? 'Saved' : 'Spent'} ${formatMoney(b.amount, b.currency)} of ${formatMoney(b.target, b.currency)}`, open: { section: 'budget', params: { openBudgetId: b.budgetId } } as RecapOpen })),
      ]);
    },
  },

  // --- Reflect ---
  {
    section: 'journaling',
    area: 'reflect',
    title: 'Journaling',
    build: ({ stats }) =>
      recap('journaling', 'Journaling', stats.journalEntries > 0, [
        { label: 'Journal entries', value: String(stats.journalEntries), open: { section: 'journaling' } },
        { label: 'Words written', value: stats.journalWords.toLocaleString() },
      ]),
  },
  {
    section: 'moodCheck',
    area: 'reflect',
    title: 'Feelings',
    sensitive: true,
    build: ({ stats }) =>
      recap('moodCheck', 'Feelings', stats.feelingsLogged > 0, [{ label: 'Feelings named', value: String(stats.feelingsLogged), open: { section: 'moodCheck' } }], {
        zoneMix: stats.zoneMix,
        notes: stats.topFeelings.length ? [`Feelings you named: ${stats.topFeelings.map((f) => `${f.name.toLowerCase()} ${f.count}`).join(', ')}.`] : [],
      }),
  },
  {
    section: 'sleep',
    area: 'reflect',
    title: 'Sleep',
    build: ({ stats }) =>
      recap('sleep', 'Sleep', stats.sleepLogs > 0, [
        { label: 'Nights logged', value: String(stats.sleepLogs), open: { section: 'sleep' } },
        ...(stats.sleepLogs ? [{ label: 'Felt rested', value: `${stats.restedNights} of ${stats.sleepLogs}` }] : []),
      ]),
  },
  {
    section: 'catchAThought',
    area: 'reflect',
    title: 'Catch a Feeling or Idea',
    build: ({ stats }) => recap('catchAThought', 'Catch a Feeling or Idea', stats.thoughtsCaught > 0, [{ label: 'Thoughts caught', value: String(stats.thoughtsCaught), open: { section: 'catchAThought' } }]),
  },

  // --- Grow ---
  {
    section: 'habitBuilder',
    area: 'grow',
    title: 'Habits',
    perDay: ({ stats }, d) => stats.minutesByDay[d]?.habits ?? 0,
    build: ({ data, stats, today }) => {
      const habits = growDetails(data, stats, today).habits;
      return recap('habitBuilder', 'Habits', stats.habitCompletions > 0 || habits.length > 0, [{ label: 'Habit check-ins', value: String(stats.habitCompletions), open: { section: 'habitBuilder' } }], {
        items: habits.map((h) => ({
          id: h.id,
          title: h.name,
          caption: [h.rate !== null ? `${Math.round(h.rate * 100)}%` : `${h.done} done`, h.longest > 0 ? `Longest run: ${h.longest} ${h.unit === 'week' ? 'weeks' : 'days'}` : ''].filter(Boolean).join(' · '),
          fraction: h.rate ?? undefined,
          color: sectionAccents.habitBuilder,
          open: { section: 'habitBuilder', params: { openHabitId: h.id } },
        })),
      });
    },
  },
  {
    section: 'quitHabit',
    area: 'grow',
    title: 'Quitting',
    sensitive: true,
    build: ({ data, stats, today }) => {
      // The same journey the Quit section draws, cut to this period: clean
      // days, urges ridden out, hard days (never "failed"), and the time and
      // tools used to ride cravings out.
      const end = stats.range.end < today ? stats.range.end : today;
      const slips = data.quitSlips ?? [];
      const sessions = (data.quitCravingSessions ?? []).filter((c) => inRange(localDateOf(c.startedAt), stats));
      const items: RecapItem[] = [];
      let clean = 0;
      let urges = 0;
      let hard = 0;
      for (const h of data.quitHabits) {
        const days = quitJourneySeries(data.quitTracks, data.quitFeelingEntries, h.id, end, slips).filter((d) => inRange(d.date, stats));
        if (!days.length) continue;
        const ownClean = days.filter((d) => !d.hardDay).length;
        const ownUrges = days.reduce((n, d) => n + d.resistedCount, 0);
        const ownHard = days.filter((d) => d.hardDay).length;
        clean += ownClean;
        urges += ownUrges;
        hard += ownHard;
        const counts = journeyCounts(data.quitTracks, slips, h.id, end);
        items.push({
          id: h.id,
          title: h.name,
          caption: [`Day ${counts.journeyDays} of your journey`, ownUrges ? plural(ownUrges, 'urge ridden out', 'urges ridden out') : '', ownHard ? plural(ownHard, 'hard day', 'hard days') : ''].filter(Boolean).join(' · '),
          open: { section: 'quitHabit', params: { openHabitId: h.id } },
        });
      }
      const seconds = sessions.reduce((n, c) => n + sessionSeconds(c, Date.parse(`${end}T23:59:59`)), 0);
      const tools = new Set(sessions.flatMap((c) => c.tools.map((t) => t.toolId)));
      return recap('quitHabit', 'Quitting', items.length > 0, items.length ? [
        { label: 'Clean days', value: String(clean), open: { section: 'quitHabit' } },
        { label: 'Urges ridden out', value: String(urges) },
        ...(hard ? [{ label: hard === 1 ? 'A hard day' : 'Hard days', value: String(hard) }] : []),
        ...(seconds >= 60 ? [{ label: 'Time riding out cravings', value: formatDuration(Math.round(seconds / 60)) }] : []),
        ...(tools.size ? [{ label: 'Tools tried', value: String(tools.size) }] : []),
      ] : [], { items, notes: hard ? ['A hard day is part of the journey, not a step back.'] : [] });
    },
  },
  {
    section: 'skills',
    area: 'grow',
    title: 'Skills',
    perDay: ({ stats }, d) => stats.minutesByDay[d]?.skills ?? 0,
    build: ({ data, stats }) => {
      const t = buildSkillsTimeBreakdown(data.skills, data.skillSessions, stats.range.start, stats.range.end);
      return recap('skills', 'Skills', stats.skillSessions > 0, [
        { label: 'Practice time', value: formatDuration(t.totalMinutes), open: { section: 'skills' } },
        { label: 'Practice sessions', value: String(stats.skillSessions) },
        ...t.bySkill.map((s) => ({ label: s.skillName, value: formatDuration(s.minutes), open: { section: 'skills', params: { openSkillId: s.skillId } } as RecapOpen })),
      ]);
    },
  },

  // --- Learn ---
  {
    section: 'studySession',
    area: 'learn',
    title: 'Study',
    perDay: ({ stats }, d) => stats.minutesByDay[d]?.study ?? 0,
    build: ({ stats }) =>
      recap('studySession', 'Study', stats.studySessions > 0, [
        { label: 'Focus time', value: formatDuration(stats.minutes.study), open: { section: 'studySession' } },
        { label: 'Sessions', value: String(stats.studySessions) },
      ]),
  },
  {
    section: 'book',
    area: 'learn',
    title: 'Reading',
    perDay: ({ stats }, d) => stats.minutesByDay[d]?.reading ?? 0,
    build: ({ data, stats }) =>
      recap('book', 'Reading', stats.readingSessions + stats.quotesSaved > 0 || stats.pagesRead > 0, [
        { label: 'Pages read', value: String(stats.pagesRead), open: { section: 'book' } },
        { label: 'Reading time', value: formatDuration(stats.minutes.reading) },
        ...(stats.quotesSaved ? [{ label: 'Quotes saved', value: String(stats.quotesSaved) }] : []),
      ], {
        items: learnDetails(data, stats).books.map((b) => ({ id: b.id, title: b.title, caption: b.progress, fraction: b.fraction, color: sectionAccents.book, open: { section: 'book', params: { openEntryId: b.id } } })),
      }),
  },
  {
    section: 'songwriting',
    area: 'learn',
    title: 'Songwriting',
    build: ({ data, stats }) => {
      const worked = data.songs.filter((s) => inRange(s.updatedAt.slice(0, 10), stats) || inRange(s.createdAt.slice(0, 10), stats)).length;
      return recap('songwriting', 'Songwriting', worked > 0, [{ label: 'Songs worked on', value: String(worked), open: { section: 'songwriting' } }]);
    },
  },
  {
    section: 'mindGames',
    area: 'learn',
    title: 'Mind Games',
    build: ({ stats }) => recap('mindGames', 'Mind Games', stats.gamesPlayed > 0, [{ label: 'Games played', value: String(stats.gamesPlayed), open: { section: 'mindGames' } }]),
  },
];

export const contributorFor = (section: SectionId) => RECAP_CONTRIBUTORS.find((c) => c.section === section);
export const AREA_ORDER: AreaId[] = ['plan', 'reflect', 'grow', 'learn'];

// What's left to show: sections the person hid from Recap, and (with "Hide
// sensitive areas on Home") Feelings and Quit, are left out entirely.
export function visibleContributors(hidden: SectionId[], hideSensitive: boolean): RecapContributor[] {
  return RECAP_CONTRIBUTORS.filter((c) => !hidden.includes(c.section) && !(hideSensitive && c.sensitive));
}

export function sectionRecaps(area: AreaId, ctx: RecapContext, hidden: SectionId[], hideSensitive: boolean): SectionRecap[] {
  return visibleContributors(hidden, hideSensitive).filter((c) => c.area === area).map((c) => c.build(ctx));
}

export interface AreaTile {
  area: AreaId;
  title: string;
  stats: { label: string; value: string }[];
  bars: number[];
  hasData: boolean;
}

// Home's four area tiles: each section's first number, in registry order.
export function areaTiles(ctx: RecapContext, hidden: SectionId[], hideSensitive: boolean): AreaTile[] {
  const visible = visibleContributors(hidden, hideSensitive);
  return AREA_ORDER.filter((area) => visible.some((c) => c.area === area)).map((area) => {
    const mine = visible.filter((c) => c.area === area);
    const built = mine.map((c) => c.build(ctx));
    const withData = built.filter((r) => r.hasData && r.rows.length > 0);
    const daily = mine.filter((c) => c.perDay);
    return {
      area,
      title: AREA_TITLES[area],
      stats: withData.slice(0, 3).map((r) => ({ label: r.rows[0].label, value: r.rows[0].value })),
      bars: daily.length ? bucketSeries(ctx.stats, (d) => daily.reduce((n, c) => n + c.perDay!(ctx, d), 0)) : [],
      hasData: withData.length > 0,
    };
  });
}

// Home's summary sentence (and the story's opening card): the sections with
// something in the period, in registry order. No list of its own, so a new
// section is in the sentence as soon as it registers.
export function recapSentence(ctx: RecapContext, period: RecapPeriod, isCurrent: boolean, hidden: SectionId[], hideSensitive: boolean): string {
  const titles = visibleContributors(hidden, hideSensitive).filter((c) => c.build(ctx).hasData).map((c) => c.title);
  return summarySentence(titles, period, isCurrent);
}
