// A2: Recap shows every section, through one registry. A section without a
// contributor fails here; logging, editing and deleting in any section
// changes Recap; Quit appears as a gentle journey with the Quit section's own
// numbers; Feelings and Quit stay out of the shared story by default and
// leave Home with "Hide sensitive areas on Home". IDs: docs/test-cases/integration.md (RECAP-REG-*)
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));

import { sectionsMeta } from '../../data/sectionsMeta';
import { RECAP_CONTRIBUTORS, areaTiles, contributorFor, sectionRecaps, visibleContributors, type RecapContext } from '../../recap/registry';
import { AREA_SECTIONS, periodStats, shareableStoryCards, buildStory, type RecapData } from '../recapStats';
import { quitJourneySeries } from '../habitStats';
import { buildSkillsTimeBreakdown } from '../recap';
import { makeTask, makeHabit, makeCheckIn, makeSkill, makeSession, makeQuitHabit, makeTrack, makeQuitEntry, useClock, restoreClock } from '../../test-utils';
import type { SectionId } from '../../types/sections';

const TODAY = '2026-10-24';
const WEEK = { start: '2026-10-19', end: '2026-10-25' };
beforeEach(() => useClock(`${TODAY}T12:00`));
afterEach(() => restoreClock());

function emptyData(): RecapData {
  return {
    tasks: [], journalEntries: [], thoughts: [], studySessions: [], meals: [], songs: [], gameResults: [], feelingCheckIns: [], sleepLogs: [], readingEntries: [],
    plans: [], skills: [], skillSessions: [], habits: [], habitCheckIns: [], budgets: [], budgetEntries: [], quitHabits: [], quitTracks: [], quitFeelingEntries: [],
    readingSessions: [], quotes: [], bestMoments: [],
  } as RecapData;
}
const ctx = (data: RecapData, range = WEEK): RecapContext => ({ data, stats: periodStats(data, range as never), today: TODAY });
const at = (d: string) => `${d}T09:00:00.000Z`;

// One item per section, logged this week (what a person does in each section).
const ADD: Record<Exclude<SectionId, 'recap'>, (d: RecapData) => void> = {
  dailyPlanning: (d) => void d.tasks.push(makeTask({ id: 't1', date: '2026-10-22', done: true, completedDates: ['2026-10-22'] } as never)),
  planBuilder: (d) => void d.plans.push({ id: 'p1', title: 'Run a 10K', motive: '', status: 'active', color: '#3D8B7A', tags: [], createdAt: at('2026-10-01'), steps: [{ id: 's1', title: 'Shoes', done: true, subSteps: [] }, { id: 's2', title: 'Train', done: false, subSteps: [] }] } as never),
  dietPlanning: (d) => void d.meals.push({ id: 'm1', date: '2026-10-22', slot: 'lunch', name: 'Soup', tags: [] } as never),
  budget: (d) => {
    d.budgets.push({ id: 'b1', name: 'Food', currency: 'EUR', mode: 'limit', targetAmount: 100, createdAt: at('2026-10-01') } as never);
    d.budgetEntries.push({ id: 'e1', budgetId: 'b1', amount: 12.5, date: '2026-10-22', createdAt: at('2026-10-22') } as never);
  },
  journaling: (d) => void d.journalEntries.push({ id: 'j1', date: '2026-10-22', zone: 'calm', text: 'A quiet day', tags: [], createdAt: at('2026-10-22'), updatedAt: at('2026-10-22') } as never),
  moodCheck: (d) => void d.feelingCheckIns.push({ id: 'f1', date: '2026-10-22', zone: 'calm', feelingIds: [], createdAt: at('2026-10-22') } as never),
  sleep: (d) => void d.sleepLogs.push({ id: 'sl1', date: '2026-10-22', quality: 'rested', createdAt: at('2026-10-22') } as never),
  catchAThought: (d) => void d.thoughts.push({ id: 'th1', kind: 'idea', text: 'An idea', createdAt: at('2026-10-22') } as never),
  habitBuilder: (d) => {
    d.habits.push(makeHabit({ id: 'h1', name: 'Walk', createdAt: '2026-10-01' }));
    d.habitCheckIns.push(makeCheckIn({ habitId: 'h1', date: '2026-10-22', done: true }));
  },
  quitHabit: (d) => {
    d.quitHabits.push(makeQuitHabit({ id: 'q1', name: 'Scrolling' }));
    d.quitTracks.push(makeTrack({ id: 'tr1', quitHabitId: 'q1', startDate: '2026-10-20' }));
  },
  skills: (d) => {
    d.skills.push(makeSkill({ id: 'sk1', name: 'Guitar' }));
    d.skillSessions.push(makeSession({ skillId: 'sk1', date: '2026-10-22', minutes: 30 }));
  },
  studySession: (d) => void d.studySessions.push({ id: 'st1', date: '2026-10-22', focusMinutes: 25, breakMinutes: 5, createdAt: at('2026-10-22') } as never),
  book: (d) => {
    d.readingEntries.push({ id: 'r1', bookId: 'bk', status: 'reading', book: { id: 'bk', title: 'A book', pageCount: 200 }, addedAt: at('2026-10-01') } as never);
    d.readingSessions.push({ id: 'rs1', entryId: 'r1', date: '2026-10-22', pagesRead: 20, minutes: 30, createdAt: at('2026-10-22') } as never);
  },
  songwriting: (d) => void d.songs.push({ id: 'so1', title: 'Song', createdAt: at('2026-10-22'), updatedAt: at('2026-10-22') } as never),
  mindGames: (d) => void d.gameResults.push({ id: 'g1', gameId: 'memory', difficulty: 'easy', score: 10, playedAt: at('2026-10-22') } as never),
};

test('RECAP-REG-001 every section has exactly one Recap contributor, in one of the four areas', () => {
  const sections = sectionsMeta.map((s) => s.id).filter((id) => id !== 'recap');
  expect(RECAP_CONTRIBUTORS.map((c) => c.section).sort()).toEqual([...sections].sort());
  for (const c of RECAP_CONTRIBUTORS) expect({ section: c.section, inArea: AREA_SECTIONS[c.area].includes(c.section) }).toEqual({ section: c.section, inArea: true });
  expect(Object.keys(ADD).sort()).toEqual([...sections].sort()); // and this test covers each one
});

test('RECAP-REG-002 with nothing logged, every section is empty and every area says so calmly', () => {
  const c = ctx(emptyData());
  for (const contributor of RECAP_CONTRIBUTORS) expect({ section: contributor.section, hasData: contributor.build(c).hasData }).toEqual({ section: contributor.section, hasData: false });
  expect(areaTiles(c, [], false).every((t) => !t.hasData)).toBe(true);
});

describe.each(Object.entries(ADD) as [SectionId, (d: RecapData) => void][])('RECAP-REG-003 %s', (section, add) => {
  test('logging something shows in Recap; deleting it takes it away', () => {
    const data = emptyData();
    add(data);
    const built = contributorFor(section)!.build(ctx(data));
    expect(built.hasData).toBe(true);
    expect(built.rows.length + built.items.length).toBeGreaterThan(0);
    // The area tile on Home shows it too.
    const tile = areaTiles(ctx(data), [], false).find((t) => t.area === contributorFor(section)!.area)!;
    expect(tile.hasData).toBe(true);
    // Deleted (the same data without it): gone again.
    expect(contributorFor(section)!.build(ctx(emptyData())).hasData).toBe(false);
  });
});

test('RECAP-REG-004 an edit changes the number: a second habit check-in, a longer practice session', () => {
  const data = emptyData();
  ADD.habitBuilder(data);
  const before = contributorFor('habitBuilder')!.build(ctx(data)).rows[0].value;
  data.habitCheckIns.push(makeCheckIn({ habitId: 'h1', date: '2026-10-23', done: true }));
  expect(contributorFor('habitBuilder')!.build(ctx(data)).rows[0].value).not.toBe(before);
  ADD.skills(data);
  const skillMinutes = () => contributorFor('skills')!.build(ctx(data)).rows[0].value;
  const first = skillMinutes();
  data.skillSessions[0] = { ...data.skillSessions[0], minutes: 90 };
  expect(skillMinutes()).not.toBe(first);
});

describe('RECAP-REG: Quit, gently, with the Quit section\'s own numbers', () => {
  function quitData() {
    const data = emptyData();
    data.quitHabits.push(makeQuitHabit({ id: 'q1', name: 'Scrolling' }));
    // A chapter that ended on Oct 21 (a slip), and a new one from the same day.
    data.quitTracks.push(makeTrack({ id: 'tr1', quitHabitId: 'q1', startDate: '2026-10-10', endDate: '2026-10-21', status: 'archived', createdAt: at('2026-10-10') } as never));
    data.quitTracks.push(makeTrack({ id: 'tr2', quitHabitId: 'q1', startDate: '2026-10-21', createdAt: '2026-10-21T20:00:00.000Z' } as never));
    data.quitFeelingEntries.push(makeQuitEntry({ trackId: 'tr2', date: '2026-10-23', isResistedUrge: true }));
    return data;
  }

  test('RECAP-REG-010 the numbers are the Quit journey\'s: days on the journey, urges ridden out, new chapters', () => {
    const data = quitData();
    const r = contributorFor('quitHabit')!.build(ctx(data));
    const days = quitJourneySeries(data.quitTracks, data.quitFeelingEntries, 'q1', TODAY).filter((d) => d.date >= WEEK.start && d.date <= WEEK.end);
    expect(r.rows).toEqual([
      expect.objectContaining({ label: 'Days on your journey', value: String(days.filter((d) => !d.relapse).length) }),
      expect.objectContaining({ label: 'Urges ridden out', value: '1' }),
      expect.objectContaining({ label: 'New chapters started', value: '1' }),
    ]);
    expect(r.items[0].caption).toMatch(/^Day \d+ of chapter 2/);
  });

  test('RECAP-REG-011 a slip reads as part of the journey, never as failing', () => {
    const text = JSON.stringify(contributorFor('quitHabit')!.build(ctx(quitData())));
    expect(text).toMatch(/new chapter/i);
    expect(text).not.toMatch(/fail|relapse|broke|lost|reset|streak ended|back to zero/i);
  });
});

test('RECAP-REG-020 Skills in Recap match the Skills page (the same breakdown)', () => {
  const data = emptyData();
  ADD.skills(data);
  const t = buildSkillsTimeBreakdown(data.skills, data.skillSessions, WEEK.start, WEEK.end);
  const r = contributorFor('skills')!.build(ctx(data));
  expect(r.rows.find((x) => x.label === 'Guitar')).toBeDefined();
  expect(t.totalMinutes).toBe(30);
});

test('RECAP-REG-030 Feelings and Quit: on Home by default; hidden with "Hide sensitive areas on Home"; out of the shared story unless included', () => {
  const data = emptyData();
  ADD.moodCheck(data);
  ADD.quitHabit(data);
  const shown = visibleContributors([], false).map((c) => c.section);
  expect(shown).toEqual(expect.arrayContaining(['moodCheck', 'quitHabit']));
  const hidden = visibleContributors([], true).map((c) => c.section);
  expect(hidden).not.toContain('moodCheck');
  expect(hidden).not.toContain('quitHabit');
  expect(sectionRecaps('grow', ctx(data), [], true).map((r) => r.section)).not.toContain('quitHabit');
  const story = buildStory(data, ctx(data).stats, [], 'week' as never, true, TODAY);
  expect(shareableStoryCards(story.filter(Boolean) as never, false).some((c: { sensitive: boolean }) => c.sensitive)).toBe(false);
});

test('RECAP-REG-040 Recap never ranks: no "busiest", "most", "best" in anything a contributor says', () => {
  const data = emptyData();
  for (const add of Object.values(ADD)) add(data);
  const text = JSON.stringify(RECAP_CONTRIBUTORS.map((c) => c.build(ctx(data))));
  expect(text).not.toMatch(/\b(busiest|most|best|least|top)\b/i);
});

test('RECAP-REG-050 a month covers its last day (an entry on Oct 31 is in October)', () => {
  const data = emptyData();
  data.journalEntries.push({ id: 'j31', date: '2026-10-31', zone: 'calm', text: 'Last day', tags: [], createdAt: at('2026-10-31'), updatedAt: at('2026-10-31') } as never);
  expect(contributorFor('journaling')!.build(ctx(data, { start: '2026-10-01', end: '2026-10-31' })).rows[0].value).toBe('1');
});
