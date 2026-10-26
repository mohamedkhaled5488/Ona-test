// Every feeling noted in any section is in the Feelings log, and so in the
// Feelings section and its Analysis (owner, 2026-10-27): journal entries'
// chosen colours, from now on and from before, and Quit moments noted before
// they were linked. Never twice, never a feeling nobody chose, and never back
// after it was deleted. IDs: docs/test-cases/integration.md (FEEL-ALL-*)
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));
jest.setTimeout(30_000);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { setDataSpace } from '../dataSpace';
import { __flushForTests, __resetForTests, startAppData } from '../dataSpaceController';
import { storageKey, DATA_FORMAT_VERSION } from '../localPersistence';
import { useFeelingsStore } from '../../store/useFeelingsStore';
import { useJournalStore } from '../../store/useJournalStore';
import { useQuitHabitsStore } from '../../store/useQuitHabitsStore';
import { useThoughtsStore } from '../../store/useThoughtsStore';
import { bringFeelingsTogether, journalFeelingId, quitFeelingId, quitMomentFeelingId, removeJournalFeeling, syncJournalFeeling } from '../../feelings/fromSections';
import { deleteFeelingEntry } from '../taskFeelings';
import { mirrorFeelingEdit } from '../itemFeelings';
import { basedOn, filterBySource, overviewInsight, sourceBreakdown } from '../feelingsInsights';
import { zoneCounts } from '../feelingsStats';
import { feelings as wheel } from '../../data/feelingsWheel';
import { makeQuitHabit, makeTrack, resetAll, useClock, restoreClock } from '../../test-utils';
import type { JournalEntry, QuitFeelingEntry } from '../../types/sections';

const real = AsyncStorage as unknown as { clear: () => Promise<void>; setItem: (k: string, v: string) => Promise<void> };
const journal = () => useJournalStore.getState();
const log = () => useFeelingsStore.getState().entries;
const entryOn = (date: string) => journal().entries.find((e) => e.date === date)!;
const lively = wheel.find((f) => f.zone === 'lively')!;

beforeEach(async () => {
  await resetAll();
  useClock('2026-10-27T18:00');
  useFeelingsStore.setState({ entries: [] } as never);
  useJournalStore.setState({ entries: [] } as never);
});
afterEach(() => restoreClock());

describe('the journal, from now on', () => {
  test('FEEL-ALL-001 a chosen colour is in the Feelings log, on the entry\'s day, and in Feelings\' Analysis and source filter', () => {
    journal().upsertEntry('2026-10-25', 'tense', 'A long day', [], { feelingChosen: true });
    syncJournalFeeling(entryOn('2026-10-25').id);
    expect(log()).toEqual([expect.objectContaining({ id: journalFeelingId(entryOn('2026-10-25').id), zone: 'tense', date: '2026-10-25', source: { kind: 'journal', refId: entryOn('2026-10-25').id } })]);
    expect(zoneCounts(log()).tense).toBe(1);
    expect(filterBySource(log(), 'journal')).toHaveLength(1);
    expect(sourceBreakdown(log())).toContainEqual({ group: 'journal', count: 1 });
  });

  test('FEEL-ALL-002 a specific feeling goes in with its colour', () => {
    journal().upsertEntry('2026-10-27', 'lively', 'Good', [], { preciseFeelingId: lively.id, feelingChosen: true });
    syncJournalFeeling(entryOn('2026-10-27').id);
    expect(log()[0]).toMatchObject({ zone: 'lively', feelingIds: [lively.id] });
  });

  test('FEEL-ALL-003 no colour chosen: a new entry, and an idea moved from Catch a Thought, have no colour and no feeling', () => {
    journal().upsertEntry('2026-10-26', undefined, 'Just writing', []);
    syncJournalFeeling(entryOn('2026-10-26').id);
    useThoughtsStore.setState({ thoughts: [{ id: 'th1', createdAt: '2026-10-27T09:00:00.000Z', kind: 'idea', text: 'Paint the hall' }] } as never);
    useThoughtsStore.getState().promoteToJournal('th1');
    syncJournalFeeling(entryOn('2026-10-27').id);
    expect(entryOn('2026-10-27')).toMatchObject({ zone: undefined, feelingChosen: false });
    expect(log()).toEqual([]);
  });

  test('FEEL-ALL-004 changing the colour changes the same feeling (never a second); what was added in Feelings stays', () => {
    journal().upsertEntry('2026-10-27', 'calm', 'x', [], { feelingChosen: true });
    const id = entryOn('2026-10-27').id;
    syncJournalFeeling(id);
    useFeelingsStore.getState().updateEntry(journalFeelingId(id), { note: 'added later', reasonTags: ['Work'] });
    journal().upsertEntry('2026-10-27', 'low', 'x', [], { feelingChosen: true });
    syncJournalFeeling(id);
    expect(log()).toHaveLength(1);
    expect(log()[0]).toMatchObject({ zone: 'low', note: 'added later', reasonTags: ['Work'] });
    // Saving again without a change leaves it alone.
    const before = JSON.stringify(log());
    journal().upsertEntry('2026-10-27', 'low', 'more text', []);
    syncJournalFeeling(id);
    expect(JSON.stringify(log())).toBe(before);
  });

  test('FEEL-ALL-005 deleting the entry removes its feeling; undo brings both back', () => {
    journal().upsertEntry('2026-10-27', 'tense', 'x', [], { feelingChosen: true });
    const id = entryOn('2026-10-27').id;
    syncJournalFeeling(id);
    const previous = journal().entries;
    journal().deleteEntry(id);
    removeJournalFeeling(id);
    expect(log()).toEqual([]);
    useJournalStore.setState({ entries: previous });
    syncJournalFeeling(id);
    expect(log()).toHaveLength(1);
  });

  test('FEEL-ALL-006 deleted from the Feelings log: the entry stays, its feeling isn\'t brought back, until a colour is chosen again', () => {
    journal().upsertEntry('2026-10-27', 'tense', 'x', [], { feelingChosen: true });
    const id = entryOn('2026-10-27').id;
    syncJournalFeeling(id);
    deleteFeelingEntry(journalFeelingId(id));
    expect(entryOn('2026-10-27')).toMatchObject({ text: 'x', feelingRemoved: true });
    bringFeelingsTogether();
    syncJournalFeeling(id);
    expect(log()).toEqual([]);
    journal().upsertEntry('2026-10-27', 'calm', 'x', [], { feelingChosen: true });
    syncJournalFeeling(id);
    expect(log()).toEqual([expect.objectContaining({ zone: 'calm' })]);
  });

  test('FEEL-ALL-007 edited in the Feelings log: the journal entry shows the same colour (a word from another colour is dropped)', () => {
    journal().upsertEntry('2026-10-27', 'lively', 'x', [], { preciseFeelingId: lively.id, feelingChosen: true });
    const id = entryOn('2026-10-27').id;
    syncJournalFeeling(id);
    useFeelingsStore.getState().updateEntry(journalFeelingId(id), { zone: 'low', feelingIds: [] });
    mirrorFeelingEdit(journalFeelingId(id));
    expect(entryOn('2026-10-27')).toMatchObject({ zone: 'low', preciseFeelingId: undefined });
  });
});

describe('from before (brought in once, at start and after a sync)', () => {
  const old = (over: Partial<JournalEntry>): JournalEntry => ({ id: `j-${over.date}`, date: '2026-09-01', zone: 'calm', text: 'old', tags: [], ...over });
  const quitHabit = () => {
    useQuitHabitsStore.setState({ habits: [makeQuitHabit({ id: 'q1', name: 'Vaping' })], tracks: [makeTrack({ id: 't1', quitHabitId: 'q1', startDate: '2026-08-01' })], feelingEntries: [], slips: [], cravingSessions: [] } as never);
  };
  const moment = (over: Partial<QuitFeelingEntry>): QuitFeelingEntry => ({ id: 'm1', trackId: 't1', isRelapseMoment: false, isResistedUrge: true, createdAt: '2026-09-10T21:30:00.000Z', ...over });

  test('FEEL-ALL-010 older journal entries: a specific feeling or a colour other than the defaults comes in; plain Calm and the neutral colour don\'t', () => {
    useJournalStore.setState({
      entries: [old({ date: '2026-09-01', zone: 'tense' }), old({ date: '2026-09-02', zone: 'calm', preciseFeelingId: wheel.find((f) => f.zone === 'calm')!.id }), old({ date: '2026-09-03', zone: 'calm' }), old({ date: '2026-09-04', zone: 'okay' })],
    } as never);
    expect(bringFeelingsTogether()).toEqual({ journal: 2, quit: 0 });
    expect(log().map((e) => [e.date, e.zone]).sort()).toEqual([['2026-09-01', 'tense'], ['2026-09-02', 'calm']]);
  });

  test('FEEL-ALL-011 older Quit moments with a feeling come in, linked both ways, with the habit as a tag and their own date', () => {
    quitHabit();
    useQuitHabitsStore.setState({ feelingEntries: [moment({ feelingId: 'scared-anxious', zone: 'tense', note: 'after work' }), moment({ id: 'm2' }), moment({ id: 'm3', feelingId: lively.id })] } as never);
    expect(bringFeelingsTogether()).toEqual({ journal: 0, quit: 2 });
    expect(log().find((e) => e.id === quitFeelingId('m1'))).toMatchObject({ zone: 'tense', feelingIds: ['scared-anxious'], reasonTags: ['Vaping'], note: 'after work', createdAt: '2026-09-10T21:30:00.000Z', source: { kind: 'quitHabit', refId: 'q1', linkId: 'm1' } });
    expect(log().find((e) => e.id === quitFeelingId('m3'))!.zone).toBe('lively'); // the colour from its feeling
    // Linked by its own id; bringing it in never edits the moment (FEEL-2P-003).
    const m = (id: string) => useQuitHabitsStore.getState().feelingEntries.find((q) => q.id === id)!;
    expect(quitMomentFeelingId(m('m1'))).toBe(quitFeelingId('m1'));
    expect(m('m1').feelingEntryId).toBeUndefined();
    expect(quitMomentFeelingId(m('m2'))).toBeUndefined(); // no feeling noted
  });

  test('FEEL-ALL-012 a Quit feeling deleted from the Feelings log isn\'t brought back', () => {
    quitHabit();
    useQuitHabitsStore.setState({ feelingEntries: [moment({ feelingId: 'scared-anxious', zone: 'tense' })] } as never);
    bringFeelingsTogether();
    deleteFeelingEntry(quitFeelingId('m1'));
    expect(bringFeelingsTogether()).toEqual({ journal: 0, quit: 0 });
    expect(log()).toEqual([]);
  });

  test('FEEL-ALL-013 running it again changes nothing; two phones make the very same records (so a sync never doubles them)', () => {
    quitHabit();
    const journalData = [old({ date: '2026-09-01', zone: 'tense' })];
    const quitData = [moment({ feelingId: 'scared-anxious', zone: 'tense' })];
    const phone = () => {
      useFeelingsStore.setState({ entries: [] } as never);
      useJournalStore.setState({ entries: structuredClone(journalData) } as never);
      useQuitHabitsStore.setState({ feelingEntries: structuredClone(quitData) } as never);
      bringFeelingsTogether();
      return JSON.stringify(log());
    };
    const a = phone();
    restoreClock();
    useClock('2026-11-02T08:00'); // the other phone, another day
    const b = phone();
    expect(b).toBe(a);
    bringFeelingsTogether();
    expect(JSON.stringify(log())).toBe(b);
  });

  test('FEEL-ALL-014 at start: data saved by an older version is brought in when Ona opens', async () => {
    await real.clear();
    __resetForTests();
    setDataSpace('real');
    await real.setItem(storageKey('journaling', 'real'), JSON.stringify({ v: DATA_FORMAT_VERSION, state: { entries: [old({ date: '2026-09-05', zone: 'low' })] } }));
    await startAppData(real as never, false);
    await __flushForTests();
    expect(log().filter((e) => e.source?.kind === 'journal').map((e) => [e.date, e.zone])).toEqual([['2026-09-05', 'low']]);
  });
});

describe('"Based on N" counts what was brought in, with the usual sample-size wording', () => {
  const nameOf = (id: string) => wheel.find((f) => f.id === id)?.name;
  const journalOn = (dates: string[]) =>
    useJournalStore.setState({ entries: dates.map((date, i) => ({ id: `j${i}`, date, zone: i % 2 ? 'low' : 'tense', text: 'old', tags: [] })) } as never);
  const dates = (n: number) => Array.from({ length: n }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);

  test('FEEL-ALL-020 one brought-in feeling: "Based on 1 entry", told as the entry itself', () => {
    journalOn(dates(1));
    bringFeelingsTogether();
    const o = overviewInsight(log(), nameOf)!;
    expect(o).toMatchObject({ n: 1, level: 'facts' });
    expect(o.headline).toBe('You logged Tense once.');
    expect(basedOn(o.n)).toBe('Based on 1 entry');
  });

  test('FEEL-ALL-021 three to six: counts, "so far"; seven and more: counts; brought-in and new feelings counted together', () => {
    journalOn(dates(4));
    bringFeelingsTogether();
    let o = overviewInsight(log(), nameOf)!;
    expect(o).toMatchObject({ n: 4, level: 'soFar', headline: 'So far, across 4 entries: Tense 2 · Low 2.' });
    // Three more, noted today in the journal (chosen): 7 in all.
    for (const d of ['2026-10-25', '2026-10-26', '2026-10-27']) {
      journal().upsertEntry(d, 'calm', 'new', [], { feelingChosen: true });
      syncJournalFeeling(entryOn(d).id);
    }
    o = overviewInsight(log(), nameOf)!;
    expect(o.n).toBe(7);
    expect(o.level).toBe('tends');
    expect(o.headline).toMatch(/^Across 7 entries: /);
    expect(o.headline).not.toMatch(/tends to|usually|most/);
    expect(basedOn(o.n)).toBe('Based on 7 entries');
  });

  test('FEEL-ALL-022 under "From your journal": the brought-in ones on their own, with their own count', () => {
    journalOn(dates(2));
    bringFeelingsTogether();
    useFeelingsStore.getState().putEntry({ id: 'standalone', zone: 'calm', feelingIds: [], date: '2026-10-27', createdAt: '2026-10-27T09:00:00.000Z' });
    const o = overviewInsight(filterBySource(log(), 'journal'), nameOf)!;
    expect(o.n).toBe(2);
    expect(basedOn(overviewInsight(log(), nameOf)!.n)).toBe('Based on 3 entries');
  });
});

