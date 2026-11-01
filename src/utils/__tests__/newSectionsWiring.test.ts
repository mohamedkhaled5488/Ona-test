// Reflection, Letters to Myself and Support for this feeling, wired in like
// every other section, checked with them turned on as they will be once live
// (they're held until the owner's review): Settings, the plan table, the
// tour, Demo, the export, Recap (private: "Hide sensitive areas", never on a
// shared story, counts only), reminders, the plan limits, and analytics.
// IDs: docs/test-cases/integration.md (WIRE-*)
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));
jest.mock('../../data/sectionsMeta', () => {
  const actual = jest.requireActual('../../data/sectionsMeta');
  for (const id of ['reflection', 'letters', 'support']) actual.sectionsMeta.find((m: { id: string }) => m.id === id).status = 'live';
  return actual;
});

import { SETTINGS_SECTIONS } from '../../screens/settings/pages';
import { PLAN_COMPARISON, FREE_CAPS, FREE_REFLECT_THEMES } from '../../config/plans';
import { TOUR } from '../../discover/content';
import { generateDemoData } from '../../demo/generate';
import { buildExport, exportedSections } from '../localData';
import { RECAP_CONTRIBUTORS, contributorFor, visibleContributors } from '../../recap/registry';
import { SENSITIVE_SECTIONS, buildStory, periodStats, shareableStoryCards, type RecapData } from '../recapStats';
import { liveNotificationFeatures } from '../reminders';
import { ALLOWED_EVENTS } from '../analytics';
import { canCreate } from '../../plans/access';
import { themesFor, writtenThemes } from '../../reflect/questions';
import { useLettersStore } from '../../store/useLettersStore';
import { useReflectionStore } from '../../store/useReflectionStore';
import { useSupportStore } from '../../store/useSupportStore';
import { resetAll } from '../../test-utils';
import type { Letter, ReflectSession, SectionId } from '../../types/sections';

const NEW: SectionId[] = ['reflection', 'letters', 'support'];
beforeEach(async () => {
  await resetAll();
});

test('WIRE-001 every new section is in Settings (its own page or its reminders), the plan table, the tour and the export', () => {
  expect(SETTINGS_SECTIONS).toEqual(expect.arrayContaining(['reflection', 'support']));
  expect(liveNotificationFeatures()).toEqual(expect.arrayContaining(['letters', 'support', 'reflection']));
  for (const id of NEW) {
    expect({ id, inTable: PLAN_COMPARISON.some((r) => r.sections?.includes(id)) }).toEqual({ id, inTable: true });
    expect({ id, toured: TOUR.some((s) => s.id === id) }).toEqual({ id, toured: true });
    expect({ id, exported: exportedSections().includes(id) }).toEqual({ id, exported: true });
  }
  // Support and its crisis lines are never limited.
  expect(PLAN_COMPARISON.find((r) => r.sections?.includes('support'))).toMatchObject({ free: 'Everything, always' });
});

test('WIRE-002 Demo has sample reflections and letters (Support keeps nothing to show)', () => {
  const d = generateDemoData({ today: '2026-11-01', images: {} } as never);
  expect((d.reflection as { sessions: ReflectSession[] }).sessions.length).toBeGreaterThan(0);
  expect((d.letters as { letters: Letter[] }).letters.length).toBeGreaterThan(0);
  expect(JSON.stringify(d.reflection)).toContain('-demo-');
});

describe('Recap', () => {
  const session = (over: Partial<ReflectSession> = {}): ReflectSession => ({ id: 'r1', mode: 'guided', theme: 'know-myself', title: 'Know myself', status: 'done', startedAt: '2026-10-28T19:00:00.000Z', updatedAt: '2026-10-28T19:20:00.000Z', seconds: 1200, position: 1, tags: [], answers: [{ id: 'a', question: 'Q?', answer: 'A private answer' }], ...over });
  const letter: Letter = { id: 'l1', kind: 'feeling', zones: ['low'], feelingIds: [], text: 'A private letter', createdAt: '2026-10-27T19:00:00.000Z', updatedAt: '2026-10-27T19:00:00.000Z', timesShown: 1, readOn: ['2026-10-29'] };
  const data = (): RecapData => ({ tasks: [], journalEntries: [], thoughts: [], studySessions: [], meals: [], songs: [], gameResults: [], feelingCheckIns: [], sleepLogs: [], readingEntries: [], readingSessions: [], quotes: [], plans: [], skills: [], skillSessions: [], habits: [], habitCheckIns: [], budgets: [], budgetEntries: [], quitHabits: [], quitTracks: [], quitFeelingEntries: [], quitSlips: [], quitCravingSessions: [], bestMoments: [], reflectionSessions: [session(), session({ id: 'r2', theme: 'where-i-am', status: 'draft' })], letters: [letter] }) as RecapData;
  const range = { start: '2026-10-26', end: '2026-11-01' };
  const ctx = () => ({ data: data(), stats: periodStats(data(), range), today: '2026-11-01' });

  test('WIRE-010 counts only: reflections (finished), time, themes explored; letters written and read; never a word of them', () => {
    const r = contributorFor('reflection')!.build(ctx());
    expect(r.rows.map((x) => [x.label, x.value])).toEqual([['Reflections', '1'], ['Time reflecting', '20 min'], ['Themes explored', '1']]);
    const l = contributorFor('letters')!.build(ctx());
    expect(l.rows.map((x) => [x.label, x.value])).toEqual([['Letters written', '1'], ['Letters read', '1']]);
    const shown = JSON.stringify([r, l]);
    expect(shown).not.toMatch(/private|Know myself|know-myself/);
  });

  test('WIRE-011 private: "Hide sensitive areas" takes them off Home; a shared story never has them, even with sensitive areas included', () => {
    expect(SENSITIVE_SECTIONS).toEqual(expect.arrayContaining(['reflection', 'letters']));
    expect(visibleContributors([], true).map((c) => c.section)).not.toEqual(expect.arrayContaining(['reflection']));
    expect(visibleContributors([], true).map((c) => c.section)).not.toContain('letters');
    expect(RECAP_CONTRIBUTORS.filter((c) => c.section === 'reflection' || c.section === 'letters').every((c) => c.sensitive)).toBe(true);
    const c = ctx();
    const story = shareableStoryCards(buildStory(c.data, c.stats, [], 'week', true, '2026-11-01', 'This week'), true);
    expect(JSON.stringify(story)).not.toMatch(/private|reflect|letter/i);
  });
});

test('WIRE-020 the export holds sessions, letters and Support\'s memory (every word is the person\'s own)', () => {
  useReflectionStore.setState({ sessions: [{ id: 'r1', mode: 'free', title: 'Mine', status: 'done', startedAt: '2026-10-28T19:00:00.000Z', updatedAt: '2026-10-28T19:00:00.000Z', seconds: 60, position: 0, tags: [], answers: [] }] });
  useLettersStore.setState({ letters: [{ id: 'l1', kind: 'proud', zones: [], feelingIds: [], text: 'Well done', createdAt: '2026-10-28T19:00:00.000Z', updatedAt: '2026-10-28T19:00:00.000Z', timesShown: 0 }] });
  useSupportStore.setState({ votes: { x: { yes: 1, aLittle: 0, notReally: 0 } } });
  const exp = buildExport(undefined, new Date('2026-11-01T10:00:00Z'));
  expect((exp.sections.reflection as { sessions: unknown[] }).sessions).toHaveLength(1);
  expect((exp.sections.letters as { letters: unknown[] }).letters).toHaveLength(1);
  expect((exp.sections.support as { votes: object }).votes).toEqual({ x: { yes: 1, aLittle: 0, notReally: 0 } });
});

test('WIRE-030 Essentials mode: five reflection themes with unlimited sessions; up to five active letters, paused ones don\'t count and stay', () => {
  expect(FREE_REFLECT_THEMES).toHaveLength(5);
  expect(themesFor(false).every((t) => FREE_REFLECT_THEMES.includes(t.id))).toBe(true);
  expect(themesFor(true)).toEqual(writtenThemes());
  const l = (i: number, paused = false): Letter => ({ id: `l${i}`, kind: 'proud', zones: [], feelingIds: [], text: 'x', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', timesShown: 0, ...(paused ? { paused: true } : {}) });
  useLettersStore.setState({ letters: [1, 2, 3, 4].map((i) => l(i)) });
  expect(canCreate('activeLetters', false)).toBe(true);
  useLettersStore.setState({ letters: [1, 2, 3, 4, 5].map((i) => l(i)) });
  expect(canCreate('activeLetters', false)).toBe(false);
  expect(canCreate('activeLetters', true)).toBe(true);
  useLettersStore.setState({ letters: [...[1, 2, 3, 4].map((i) => l(i)), l(5, true), l(6, true)] });
  expect(canCreate('activeLetters', false)).toBe(true);
  expect(FREE_CAPS.activeLetters).toBe(5);
});

test('WIRE-040 nothing about them can reach analytics: no event on the allowlist names them', () => {
  expect(ALLOWED_EVENTS.filter((e) => /reflect|letter|support|session|feeling/i.test(e))).toEqual([]);
});
