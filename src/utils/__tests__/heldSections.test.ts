// Held sections don't exist for the person (owner, 2026-11-01: Settings still
// mentioned Mind Games). The section registry (data/sectionsMeta.ts) gives
// each section a status; everything that lists, links to, counts or exports
// sections reads only live ones. For every held section: its name and route
// are nowhere (Settings, the plan table and store text, the tour, Recap,
// Demo, the export, reminders, navigation). For every live section: it's in
// each of those, so leaving one out fails too. Its data stays on the phone.
// IDs: docs/test-cases/integration.md (HELD-*)
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));

import { heldSectionIds, isLive, liveSections, sectionsMeta } from '../../data/sectionsMeta';
import { folders } from '../../data/folders';
import { PLAN_COMPARISON, planDescriptionText } from '../../config/plans';
import { TOUR, ALL_SLIDES, EXPLORE_GROUPS } from '../../discover/content';
import { RECAP_CONTRIBUTORS, recapSentence, sectionRecaps, areaTiles } from '../../recap/registry';
import { AREA_SECTIONS, RECAP_SECTIONS, periodStats, withoutHidden, type RecapData } from '../recapStats';
import { collectRecapEvents } from '../recap';
import { generateDemoData } from '../../demo/generate';
import { buildExport, exportedSections, LOCAL_DATA } from '../localData';
import { NOTIFICATION_SECTION, liveNotificationFeatures } from '../reminders';
import { SETTINGS_SECTIONS } from '../../screens/settings/pages';
import { seededSections, SEED_REFERENCE_DATE } from '../../test-utils/realSeed';
import { useSongwritingStore } from '../../store/useSongwritingStore';
import { useMindGamesStore } from '../../store/useMindGamesStore';
import type { SectionId } from '../../types/sections';

const HELD = heldSectionIds();
const LIVE = liveSections().map((s) => s.id);
const titleOf = (id: SectionId) => sectionsMeta.find((m) => m.id === id)!.title;
// A held section's name, its route, or its singular ("Mind game").
const mentions = (text: string, id: SectionId) => {
  const t = titleOf(id);
  // A word of its own: "self-reflection" isn't the Reflection section. A
  // route only when it reads as one ("mindGames"): "support" is also a word
  // ("Support and crisis resources"), and the title covers that section.
  const route = /[A-Z]/.test(id) ? `|${id}\\b` : '';
  return new RegExp(`(^|[^-\\w])(${t}|${t.replace(/s$/, '')}\\b${route})`, 'i').test(text);
};
const heldIn = (text: string) => HELD.filter((id) => mentions(text, id));

test('HELD-001 the registry: every section has a status; Songwriting, Mind Games, and Reflection, Letters and Support (until the owner reviews them) are held', () => {
  for (const m of sectionsMeta) expect(['live', 'held']).toContain(m.status);
  expect([...HELD].sort()).toEqual(['letters', 'mindGames', 'reflection', 'songwriting', 'support']);
});

test('HELD-002 Home: folders list only live sections, and every live one is reachable', () => {
  const listed = folders.flatMap((f) => f.sections);
  for (const id of HELD) expect(listed).not.toContain(id);
  // Reachable: in a folder, inside a card ('habits': Build and Quit; Catch a
  // Feeling or Idea is in Journaling), or Home itself (Recap).
  const reachable = new Set<string>([...listed, 'habitBuilder', 'quitHabit', 'catchAThought', 'recap']);
  for (const id of LIVE) expect({ id, reachable: reachable.has(id) }).toEqual({ id, reachable: true });
});

test('HELD-003 Settings lists: section settings, Recap\'s "Choose what Recap shows", notifications', () => {
  for (const id of HELD) {
    expect(SETTINGS_SECTIONS).not.toContain(id);
    expect(RECAP_SECTIONS).not.toContain(id);
  }
  // Every live section Recap shows is in the choice list.
  for (const c of RECAP_CONTRIBUTORS) expect(RECAP_SECTIONS).toContain(c.section);
  for (const f of liveNotificationFeatures()) expect(isLive(NOTIFICATION_SECTION[f])).toBe(true);
});

test('HELD-004 the plan table and the store text name no held section, and cover every live one', () => {
  // What's shown: the store text, and each row's words (not its section ids).
  const text = planDescriptionText() + JSON.stringify(PLAN_COMPARISON.map((r) => [r.feature, r.free, r.plus]));
  expect(heldIn(text)).toEqual([]);
  const covered = new Set(PLAN_COMPARISON.flatMap((r) => r.sections ?? []));
  for (const id of LIVE.filter((x) => x !== 'recap')) expect({ id, inTable: covered.has(id) }).toEqual({ id, inTable: true });
  expect(PLAN_COMPARISON.some((r) => r.feature === 'Study, Catch a Thought')).toBe(true);
});

test('HELD-005 Discover and the tour: no held section, every live one (Catch a Feeling or Idea is in Journaling\'s slides)', () => {
  const text = JSON.stringify({ TOUR, ALL_SLIDES, EXPLORE_GROUPS });
  expect(heldIn(text)).toEqual([]);
  const toured = new Set(TOUR.map((s) => s.id));
  for (const id of LIVE.filter((x) => x !== 'catchAThought')) expect({ id, toured: toured.has(id) }).toEqual({ id, toured: true });
});

describe('HELD-006 Recap, with songs and games on the phone (from an earlier build)', () => {
  const raw = (): RecapData => {
    const s = seededSections();
    const g = (section: string, key: string) => ((s[section] as Record<string, unknown>)?.[key] ?? []) as never;
    return {
      tasks: g('dailyPlanning', 'tasks'), journalEntries: g('journaling', 'entries'), thoughts: g('catchAThought', 'thoughts'), studySessions: g('studySession', 'sessions'), meals: g('dietPlanning', 'plannedMeals'),
      songs: [{ id: 'so1', title: 'Old song', createdAt: '2026-10-20T10:00:00.000Z', updatedAt: '2026-10-20T10:00:00.000Z' }] as never,
      gameResults: [{ id: 'g1', gameId: 'memory', difficulty: 'easy', score: 10, playedAt: '2026-10-20T10:00:00.000Z' }] as never,
      feelingCheckIns: g('feelings', 'entries'), sleepLogs: g('sleep', 'logs'), readingEntries: g('book', 'entries'), readingSessions: g('book', 'sessions'), quotes: g('book', 'quotes'), plans: g('planBuilder', 'plans'),
      skills: g('skills', 'skills'), skillSessions: g('skills', 'sessions'), habits: g('habits', 'habits'), habitCheckIns: g('habits', 'checkIns'), budgets: g('budget', 'budgets'), budgetEntries: g('budget', 'entries'),
      quitHabits: g('quitHabit', 'habits'), quitTracks: g('quitHabit', 'tracks'), quitFeelingEntries: g('quitHabit', 'feelingEntries'), quitSlips: g('quitHabit', 'slips'), quitCravingSessions: g('quitHabit', 'cravingSessions'), bestMoments: [],
    } as RecapData;
  };
  const range = { start: '2026-10-01', end: SEED_REFERENCE_DATE };

  test('no contributor, area, row, sentence, timeline event or count for a held section', () => {
    const data = withoutHidden(raw(), []);
    expect(data.songs).toEqual([]);
    expect(data.gameResults).toEqual([]);
    const ctx = { data, stats: periodStats(data, range), today: SEED_REFERENCE_DATE };
    expect(ctx.stats.gamesPlayed).toBe(0);
    for (const id of HELD) {
      expect(RECAP_CONTRIBUTORS.map((c) => c.section)).not.toContain(id);
      expect(Object.values(AREA_SECTIONS).flat()).not.toContain(id);
    }
    const shown = JSON.stringify({
      areas: (['plan', 'reflect', 'grow', 'learn'] as const).map((a) => sectionRecaps(a, ctx, [], false)),
      tiles: areaTiles(ctx, [], false),
      sentence: recapSentence(ctx, 'month', true, [], false),
      events: collectRecapEvents(data),
    });
    expect(heldIn(shown)).toEqual([]);
    expect(shown).not.toContain('Old song');
  });

  test('every live section has its place in Recap (Recap itself is Home)', () => {
    const inRecap = new Set(RECAP_CONTRIBUTORS.map((c) => c.section));
    for (const id of LIVE.filter((x) => x !== 'recap')) expect({ id, inRecap: inRecap.has(id) }).toEqual({ id, inRecap: true });
  });
});

test('HELD-007 Demo: no data for a held section, data for every live one', () => {
  const d = generateDemoData({ today: SEED_REFERENCE_DATE, images: {} } as never);
  for (const id of HELD) expect(d[id]).toBeUndefined();
  expect(heldIn(JSON.stringify(Object.keys(d)))).toEqual([]);
  for (const s of exportedSections()) expect({ s, has: !!d[s] }).toEqual({ s, has: true });
});

test('HELD-008 the export file: no held section, every live one; the held data stays on the phone', () => {
  useSongwritingStore.setState({ songs: [{ id: 'so1', title: 'Old song' }] } as never);
  useMindGamesStore.setState({ results: [{ id: 'g1' }] } as never);
  const exp = buildExport(undefined, new Date('2026-11-01T10:00:00Z'));
  for (const id of HELD) expect(exp.sections[id]).toBeUndefined();
  expect(JSON.stringify(exp)).not.toContain('Old song');
  for (const s of Object.keys(LOCAL_DATA).filter((x) => !HELD.includes(x as SectionId))) expect(Object.keys(exp.sections)).toContain(s);
  // Kept, untouched: turning the section on again brings it back.
  expect(useSongwritingStore.getState().songs).toHaveLength(1);
  expect(useMindGamesStore.getState().results).toHaveLength(1);
});
