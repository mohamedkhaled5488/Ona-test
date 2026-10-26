// Feelings, Part C: Analysis from the first entry with wording that grows
// with the data, and optional feelings after habits, practice and Quit
// moments, written once to the Feelings log and linked both ways.
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []) }));

import type { FeelingCheckIn, FeelingZone } from '../../types/sections';
import { confidenceFor, CONFIDENCE_NOTE, FEELINGS_CONFIDENCE } from '../../config/feelingsAnalysis';
import { basedOn, filterBySource, itemFeelingInsight, overviewInsight, sourceBreakdown, sourceGroupOf, tagInsight } from '../feelingsInsights';
import { deleteQuitMoment, logItemFeeling, mirrorFeelingEdit, shouldAskItemFeeling, SOMETIMES_GAP_DAYS } from '../itemFeelings';
import { deleteFeelingEntry } from '../taskFeelings';
import { describeFeelingSource } from '../feelingSource';
import { useFeelingsStore } from '../../store/useFeelingsStore';
import { useHabitsStore } from '../../store/useHabitsStore';
import { useSkillsStore } from '../../store/useSkillsStore';
import { useQuitHabitsStore } from '../../store/useQuitHabitsStore';
import { DEFAULT_SETTINGS, migrateSettings, useSettingsStore } from '../../store/useSettingsStore';
import { setAnalyticsTransport, track } from '../analytics';
import { todayISO, addDaysISO } from '../date';
import { tagImpactRanking } from '../feelingsStats';
import { useClock, restoreClock } from '../../test-utils';
import { bringFeelingsTogether } from '../../feelings/fromSections';

// A fixed time, so nothing here depends on the real date (see src/test-utils/time.ts).
beforeEach(() => {
  useClock('2026-10-18T12:00');
});
afterEach(() => restoreClock());

let n = 0;
const e = (date: string, zone: FeelingZone, tags: string[] = [], extra: Partial<FeelingCheckIn> = {}): FeelingCheckIn => ({
  id: `f${++n}`,
  zone,
  feelingIds: [],
  date,
  createdAt: `${date}T12:00:00.000Z`,
  ...(tags.length ? { reasonTags: tags } : {}),
  ...extra,
});
const nameOf = (id: string) => ({ content: 'Content', relieved: 'Relieved' } as Record<string, string>)[id];
const BANNED = /\bcaus(e|es|ed|ing)\b|\bbecause\b|\bmakes? you\b|\bleads? to\b|\bdue to\b|\bresults? in\b|\bstrongest\b|\bimpact\b|\bmost\b|\btends? to\b|\busually\b|\bbest\b/i;

describe('C1. Confidence thresholds (one config)', () => {
  test('1–2 the entries themselves, 3–6 counts marked "so far", 7+ counts', () => {
    expect([1, 2, 3, 6, 7, 30].map(confidenceFor)).toEqual(['facts', 'facts', 'soFar', 'soFar', 'tends', 'tends']);
    expect(FEELINGS_CONFIDENCE).toEqual({ factsMax: 2, soFarMax: 6 });
    expect(CONFIDENCE_NOTE).toMatch(/not a ranking/);
    expect(CONFIDENCE_NOTE).toMatch(/"so far"/);
  });
});

describe('C1. Analysis from the first entry', () => {
  test('no entries: nothing to claim', () => {
    expect(overviewInsight([], nameOf)).toBeUndefined();
  });

  test('1 entry: the fact, with its word and tags', () => {
    const i = overviewInsight([e('2026-10-01', 'calm', ['Work'], { feelingIds: ['content'] })], nameOf)!;
    expect(i).toMatchObject({ n: 1, level: 'facts', headline: 'You logged Calm once (content), tagged Work.' });
    expect(basedOn(i.n)).toBe('Based on 1 entry');
  });

  test('2 entries on the same day: still facts, no pattern', () => {
    const i = overviewInsight([e('2026-10-01', 'calm'), e('2026-10-01', 'tense')], nameOf)!;
    expect(i.level).toBe('facts');
    expect(i.headline).toBe("You've logged 2 feelings: Calm once and Tense once.");
    expect(i.headline).not.toMatch(/most|tend|so far/i);
  });

  test('3 entries across a month end: the counts, marked "so far"', () => {
    const i = overviewInsight([e('2026-09-30', 'calm'), e('2026-10-01', 'calm'), e('2026-10-02', 'low')], nameOf)!;
    expect(i).toMatchObject({ level: 'soFar', headline: 'So far, across 3 entries: Calm 2 · Low 1.' });
    expect(basedOn(i.n)).toBe('Based on 3 entries');
  });

  test('7 entries: the counts, in the zone order (not sorted by count), never "tends to" or "most"', () => {
    const list = [e('2026-10-06', 'tense'), e('2026-10-07', 'okay')].concat([...Array(5)].map((_, k) => e(`2026-10-0${k + 1}`, 'calm')));
    const h = overviewInsight(list, nameOf)!.headline;
    expect(h).toBe('Across 7 entries: Calm 5 · Tense 1 · Okay 1.');
    expect(h).not.toMatch(/most|tend|usually|best/i);
  });

  test('a lopsided or an even spread is shown the same way: just the counts', () => {
    expect(overviewInsight([e('2026-10-01', 'calm'), e('2026-10-02', 'tense'), e('2026-10-03', 'calm'), e('2026-10-04', 'tense')], nameOf)!.headline).toBe(
      'So far, across 4 entries: Calm 2 · Tense 2.'
    );
  });

  test('tags: facts at first use, a pattern only with repeats', () => {
    expect(tagInsight([e('2026-10-01', 'tense', ['Work'])], 'Work')!.headline).toBe('Work: tagged once, with Tense.');
    const four = [e('2026-10-01', 'tense', ['Work']), e('2026-10-02', 'tense', ['Work']), e('2026-10-03', 'tense', ['Work']), e('2026-10-04', 'calm', ['Work'])];
    expect(tagInsight(four, 'Work')!.headline).toBe('Work (4 entries so far): Calm 1 · Tense 3.');
    const eight = [...four, ...four.map((x) => ({ ...x, id: x.id + 'b' }))];
    expect(tagInsight(eight, 'Work')!.headline).toBe('Work (8 entries): Calm 2 · Tense 6.');
  });

  test('"Furthest from your usual" never ranks a tag that matches your usual', () => {
    const allCalm = [...Array(6)].map((_, k) => e(addDaysISO('2026-10-01', k), 'calm', ['Health/Body']));
    expect(tagImpactRanking(allCalm, 3)).toEqual([]);
    const mixed = [...allCalm, ...[...Array(6)].map((_, k) => e(addDaysISO('2026-10-10', k), 'tense', ['Work']))];
    expect(tagImpactRanking(mixed, 3).map((t) => t.tag).sort()).toEqual(['Health/Body', 'Work']);
  });

  test('no causal or ranking words at any size', () => {
    const lines: string[] = [];
    for (const size of [1, 2, 3, 5, 7, 12]) {
      const list = [...Array(size)].map((_, k) => e(addDaysISO('2026-09-25', k), (['calm', 'tense', 'calm', 'low'] as FeelingZone[])[k % 4], ['Work']));
      lines.push(overviewInsight(list, nameOf)!.headline, tagInsight(list, 'Work')!.headline, itemFeelingInsight(list, 'after this habit')!.headline);
    }
    lines.push(CONFIDENCE_NOTE.replace('never what caused what', ''));
    lines.forEach((l) => expect(l).not.toMatch(BANNED));
    const src = require('fs').readFileSync(require('path').join(process.cwd(), 'src/screens/MoodCheckScreen.tsx'), 'utf8') as string;
    expect(src).not.toMatch(/strongest link|Keep logging — Analysis|needs \{minCount\} to show/);
  });
});

describe('C2. Where a feeling came from', () => {
  const list = [
    e('2026-10-01', 'calm'),
    e('2026-10-01', 'lively', [], { source: { kind: 'habit', refId: 'h' } }),
    e('2026-10-02', 'okay', [], { source: { kind: 'skill', refId: 's' } }),
    e('2026-10-02', 'tense', [], { source: { kind: 'task', refId: 't' } }),
    e('2026-10-03', 'low', [], { source: { kind: 'quitHabit', refId: 'q' } }),
    e('2026-10-03', 'calm', [], { source: { kind: 'book', refId: 'b' } }),
  ];

  test('groups: Standalone, After habits, After practice, After tasks, Quit moments, Other', () => {
    expect(list.map((x) => sourceGroupOf(x.source))).toEqual(['standalone', 'habits', 'practice', 'tasks', 'quit', 'other']);
    expect(sourceBreakdown(list).map((g) => `${g.group}:${g.count}`)).toEqual(['all:6', 'standalone:1', 'habits:1', 'practice:1', 'tasks:1', 'quit:1', 'other:1']);
    expect(filterBySource(list, 'habits')).toHaveLength(1);
    expect(filterBySource(list, 'all')).toHaveLength(6);
  });

  test('labels read "Habit: …", "Quit: …", "Skill: …"', () => {
    const lookup = { task: () => 'T', book: () => 'B', habit: () => 'Reading', quitHabit: () => 'Late-night scrolling', skill: () => 'Guitar', study: () => 'S', journal: () => 'Oct 21' };
    expect(describeFeelingSource({ kind: 'journal', refId: 'x' }, lookup)!.text).toBe('Journal: Oct 21');
    expect(describeFeelingSource({ kind: 'habit', refId: 'x' }, lookup)!.text).toBe('Habit: Reading');
    expect(describeFeelingSource({ kind: 'quitHabit', refId: 'x' }, lookup)!.text).toBe('Quit: Late-night scrolling');
    expect(describeFeelingSource({ kind: 'skill', refId: 'x' }, lookup)!.text).toBe('Skill: Guitar');
  });

  test('"Feelings after" uses the same thresholds', () => {
    expect(itemFeelingInsight([e('2026-10-01', 'calm')], 'after this habit')!.headline).toBe('After this habit, you logged Calm once.');
    expect(itemFeelingInsight([e('2026-10-01', 'calm'), e('2026-10-02', 'calm'), e('2026-10-03', 'okay')], 'after practicing')!.headline).toBe(
      'After practicing (3 entries so far): Calm 2 · Okay 1.'
    );
  });
});

describe('C2. When to ask', () => {
  const today = '2026-10-18';
  const noted = (date: string) => e(date, 'calm', [], { source: { kind: 'habit', refId: 'h1' } });

  test('Always, Never, and Sometimes (only after a quiet few days)', () => {
    expect(shouldAskItemFeeling('always', [noted(today)], 'habit', 'h1', today)).toBe(true);
    expect(shouldAskItemFeeling('never', [], 'habit', 'h1', today)).toBe(false);
    expect(shouldAskItemFeeling('sometimes', [noted(today)], 'habit', 'h1', today)).toBe(false);
    expect(shouldAskItemFeeling('sometimes', [noted(addDaysISO(today, -(SOMETIMES_GAP_DAYS - 1)))], 'habit', 'h1', today)).toBe(false);
    expect(shouldAskItemFeeling('sometimes', [noted(addDaysISO(today, -SOMETIMES_GAP_DAYS))], 'habit', 'h1', today)).toBe(true);
    // Another habit's feeling doesn't count.
    expect(shouldAskItemFeeling('sometimes', [{ ...noted(today), source: { kind: 'habit', refId: 'other' } }], 'habit', 'h1', today)).toBe(true);
  });

  test('defaults: ask after habits and practice, not in Quit; older saved settings get them too', () => {
    expect(DEFAULT_SETTINGS.habitFeelingAsk).toBe('always');
    expect(DEFAULT_SETTINGS.skillFeelingAsk).toBe('always');
    expect(DEFAULT_SETTINGS.quitFeelingAsk).toBe('never');
    const old = migrateSettings({ theme: 'dark' }, 3);
    expect([old.habitFeelingAsk, old.skillFeelingAsk, old.quitFeelingAsk]).toEqual(['always', 'always', 'never']);
  });
});

describe('C2. One record in the Feelings log, linked both ways', () => {
  beforeEach(() => {
    useFeelingsStore.setState({ entries: [] });
    useHabitsStore.setState({ habits: [{ id: 'h1', name: 'Reading', targetDays: 30, createdAt: '2026-10-01', reminderEnabled: false, reminderNotificationIds: [] }], checkIns: [] });
    useSkillsStore.setState({ skills: [{ id: 's1', name: 'Guitar' } as never], sessions: [] });
    useQuitHabitsStore.setState({
      habits: [{ id: 'q1', name: 'Late-night scrolling', createdAt: '2026-10-01' }],
      tracks: [{ id: 't1', quitHabitId: 'q1', startDate: '2026-10-01', createdAt: '2026-10-01T08:00:00Z', status: 'active' }],
      feelingEntries: [],
    });
  });

  test('a habit feeling: source, the habit name as a tag, the note; no second copy anywhere', () => {
    const id = logItemFeeling({ source: { kind: 'habit', refId: 'h1' }, zone: 'calm', reasonTags: ['Work'], note: ' felt good ' });
    const [entry] = useFeelingsStore.getState().entries;
    expect(entry).toMatchObject({ id, zone: 'calm', reasonTags: ['Reading', 'Work'], note: 'felt good', source: { kind: 'habit', refId: 'h1' }, date: todayISO() });
    expect(useFeelingsStore.getState().entries).toHaveLength(1);
    expect(useHabitsStore.getState().checkIns).toHaveLength(0); // nothing duplicated on the habit side
  });

  test('a skill feeling is tagged with the skill', () => {
    logItemFeeling({ source: { kind: 'skill', refId: 's1' }, zone: 'lively' });
    expect(useFeelingsStore.getState().entries[0].reasonTags).toEqual(['Guitar']);
  });

  test('a resisted urge counts without a feeling; noting one links both ways', () => {
    const urge = useQuitHabitsStore.getState().addFeelingEntry('t1', undefined, undefined, undefined, false, true, 'Ride it out', true);
    expect(useQuitHabitsStore.getState().feelingEntries[0]).toMatchObject({ id: urge, isResistedUrge: true, zone: undefined });
    const fid = logItemFeeling({ source: { kind: 'quitHabit', refId: 'q1', linkId: urge }, zone: 'tense' });
    expect(useQuitHabitsStore.getState().feelingEntries[0]).toMatchObject({ feelingEntryId: fid, zone: 'tense' });
    expect(useFeelingsStore.getState().entries[0].reasonTags).toEqual(['Late-night scrolling']);

    // Edited in the Feelings log -> the Quit journey shows the same.
    useFeelingsStore.getState().updateEntry(fid, { zone: 'calm' });
    mirrorFeelingEdit(fid);
    expect(useQuitHabitsStore.getState().feelingEntries[0].zone).toBe('calm');

    // Deleted from the Feelings log -> the urge stays, only its feeling goes.
    deleteFeelingEntry(fid);
    expect(useFeelingsStore.getState().entries).toHaveLength(0);
    expect(useQuitHabitsStore.getState().feelingEntries[0]).toMatchObject({ id: urge, isResistedUrge: true, zone: undefined, feelingEntryId: undefined });
  });

  test('a feeling noted after a slip creates its slip entry; deleting that moment removes the feeling too', () => {
    const fid = logItemFeeling({ source: { kind: 'quitHabit', refId: 'q1', trackId: 't1', slip: true }, zone: 'low' });
    const [moment] = useQuitHabitsStore.getState().feelingEntries;
    expect(moment).toMatchObject({ trackId: 't1', isRelapseMoment: true, isResistedUrge: false, zone: 'low', feelingEntryId: fid });
    deleteQuitMoment(moment.id);
    expect(useQuitHabitsStore.getState().feelingEntries).toHaveLength(0);
    expect(useFeelingsStore.getState().entries).toHaveLength(0);
  });

  // Owner, 2026-10-27: every feeling, older ones too, is in the Feelings log
  // (was "no backfill"). The full rules: feelingsFromSections.test.ts.
  test('older Quit feelings are brought into the Feelings log', () => {
    useQuitHabitsStore.getState().addFeelingEntry('t1', 'scared-anxious', 'tense', 'old one', false, true);
    expect(useFeelingsStore.getState().entries).toHaveLength(0);
    bringFeelingsTogether();
    expect(useFeelingsStore.getState().entries.filter((e) => e.source?.kind === 'quitHabit')).toEqual([expect.objectContaining({ zone: 'tense', note: 'old one' })]);
  });
});

describe('C2. Privacy', () => {
  afterEach(() => setAnalyticsTransport(null));
  test('analytics events never carry feelings, tags, notes or habit names', () => {
    const sent: unknown[] = [];
    setAnalyticsTransport((ev) => sent.push(ev));
    useSettingsStore.getState().setConsent({ storeData: true, analytics: true });
    track('paywall_viewed', { zone: 'low', tags: ['Work'], note: 'private', habit: 'Late-night scrolling', feeling: 'anxious' });
    expect(JSON.stringify(sent)).not.toMatch(/low|Work|private|scrolling|anxious/);
  });

  test('the feeling flows never call analytics', () => {
    const fs = require('fs') as { readFileSync: (p: string, e: string) => string };
    for (const f of ['src/utils/itemFeelings.ts', 'src/components/ItemFeelingSheet.tsx', 'src/utils/feelingsInsights.ts']) {
      expect(fs.readFileSync(require('path').join(process.cwd(), f), 'utf8')).not.toMatch(/\btrack\(/);
    }
  });
});
