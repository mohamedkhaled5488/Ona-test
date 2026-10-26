// A feeling from the journal or Quit is on the person's own local day, in
// any time zone, never the UTC date: a journal entry keeps its date (even
// written at 23:30 where UTC is already tomorrow), and an older Quit moment
// is on the local day of its moment. IDs: docs/test-cases/integration.md (FEEL-TZ-*)
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));

import { useFeelingsStore } from '../../store/useFeelingsStore';
import { useJournalStore } from '../../store/useJournalStore';
import { useQuitHabitsStore } from '../../store/useQuitHabitsStore';
import { bringFeelingsTogether, journalFeelingId, quitFeelingId, syncJournalFeeling } from '../../feelings/fromSections';
import { localDateOf } from '../../quit/journey';
import { makeQuitHabit, makeTrack, resetAll, useClock, restoreClock } from '../../test-utils';

// The zone this run is in. CI runs this file three times: as is, then with
// TZ=Pacific/Auckland and TZ=America/Los_Angeles (.github/workflows/ci.yml),
// since a time zone can't be changed inside a Jest run.
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
afterEach(() => restoreClock());

// The calendar date of an instant in a time zone, from Intl (independent of the code under test).
const dayIn = (iso: string, timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

describe(`in ${tz}`, () => {
  beforeEach(async () => {
    await resetAll();
    useFeelingsStore.setState({ entries: [] } as never);
    useJournalStore.setState({ entries: [] } as never);
    useQuitHabitsStore.setState({ habits: [makeQuitHabit({ id: 'q1', name: 'Vaping' })], tracks: [makeTrack({ id: 't1', quitHabitId: 'q1', startDate: '2026-08-01' })], feelingEntries: [], slips: [], cravingSessions: [] } as never);
  });

  test('FEEL-TZ-001 a journal entry written at 23:30 local time: its feeling is on that day (also where UTC is already the next)', () => {
    useClock('2026-10-27T23:30');
    useJournalStore.getState().upsertEntry('2026-10-27', 'tense', 'Late', [], { feelingChosen: true });
    const id = useJournalStore.getState().entries[0].id;
    syncJournalFeeling(id);
    const f = useFeelingsStore.getState().entries.find((e) => e.id === journalFeelingId(id))!;
    expect(f.date).toBe('2026-10-27');
    expect(dayIn(f.createdAt, tz)).toBe('2026-10-27');
    if (tz === 'America/Los_Angeles') expect(f.createdAt.slice(0, 10)).toBe('2026-10-28'); // UTC is already tomorrow there
  });

  test('FEEL-TZ-002 an older journal entry (a date, no time): its feeling keeps the date', () => {
    useClock('2026-10-27T08:00');
    useJournalStore.setState({ entries: [{ id: 'j1', date: '2026-09-02', zone: 'low', text: 'old', tags: [] }] } as never);
    bringFeelingsTogether();
    const f = useFeelingsStore.getState().entries[0];
    expect(f.date).toBe('2026-09-02');
    expect(dayIn(f.createdAt, tz)).toBe('2026-09-02');
  });

  test('FEEL-TZ-003 an older Quit moment: its feeling is on the local day of the moment, which can differ from the UTC date', () => {
    useClock('2026-10-27T08:00');
    const at = '2026-09-10T13:00:00.000Z'; // Auckland: 01:00 on the 11th; Los Angeles: 06:00 on the 10th
    useQuitHabitsStore.setState({ feelingEntries: [{ id: 'm1', trackId: 't1', isRelapseMoment: false, isResistedUrge: true, zone: 'tense', createdAt: at }] } as never);
    bringFeelingsTogether();
    const f = useFeelingsStore.getState().entries.find((e) => e.id === quitFeelingId('m1'))!;
    expect(f.date).toBe(dayIn(at, tz));
    expect(f.date).toBe(localDateOf(at));
    if (tz === 'Pacific/Auckland') expect(f.date).toBe('2026-09-11');
    if (tz === 'America/Los_Angeles') expect(f.date).toBe('2026-09-10');
  });
});
