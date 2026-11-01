// Letters to Myself, below the screen: which letter matches a feeling, in
// what order, the strong-feeling rule, dated letters, the reminder (no words,
// no feeling; 9:00 local on the day, whatever daylight saving does), the store,
// and two phones (both versions kept, reminders stay on their own phone).
// Also run with TZ=America/Los_Angeles in CI (daylight saving ends 2026-11-01).
// IDs: docs/test-cases/integration.md (LETTER-*)
jest.mock('../../utils/notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleAt: jest.fn(async () => ['n1']) }));
jest.mock('../../data/sectionsMeta', () => {
  const actual = jest.requireActual('../../data/sectionsMeta');
  actual.sectionsMeta.find((m: { id: string }) => m.id === 'letters').status = 'live';
  return actual;
});

import { DOUBT_FEELINGS, LETTER_REMINDER, PROUD_FEELINGS, letterMatches, lettersDue, lettersFor, reminderTime } from '../delivery';
import { syncLetterReminder } from '../reminders';
import { useLettersStore } from '../../store/useLettersStore';
import { feelings as wheel, feelingZones } from '../../data/feelingsWheel';
import { cancelReminders, scheduleAt } from '../../utils/notifications';
import { DEVICE_ONLY_FIELDS, syncedCollections, toRecords } from '../../sync/records';
import { KEEP_BOTH } from '../../sync/engine';
import { LETTERS } from '../../content';
import type { FeelingCheckIn, Letter } from '../../types/sections';

const letter = (over: Partial<Letter>): Letter => ({ id: 'l1', kind: 'feeling', zones: [], feelingIds: [], text: 'You have done hard things before.', createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z', timesShown: 0, ...over });
const feeling = (over: Partial<FeelingCheckIn>): FeelingCheckIn => ({ id: 'f1', zone: 'low', feelingIds: [], date: '2026-11-01', createdAt: '2026-11-01T18:00:00.000Z', ...over });

beforeEach(() => {
  useLettersStore.setState({ letters: [], later: [], offeredFor: undefined });
  jest.clearAllMocks();
});

describe('which letter', () => {
  test('LETTER-001 "When I feel…" by colour or specific feeling; doubt and pride by their feelings; a hard day is Low or Tense; a dated letter never by a feeling', () => {
    expect(letterMatches(letter({ zones: ['low'] }), feeling({ zone: 'low' }))).toBe(true);
    expect(letterMatches(letter({ zones: ['low'] }), feeling({ zone: 'tense' }))).toBe(false);
    expect(letterMatches(letter({ feelingIds: ['sad-lonely'] }), feeling({ zone: 'low', feelingIds: ['sad-lonely'] }))).toBe(true);
    expect(letterMatches(letter({ kind: 'doubt' }), feeling({ feelingIds: ['scared-insecure'] }))).toBe(true);
    expect(letterMatches(letter({ kind: 'doubt' }), feeling({ feelingIds: ['sad-lonely'] }))).toBe(false);
    expect(letterMatches(letter({ kind: 'proud' }), feeling({ zone: 'lively', feelingIds: ['powerful-proud'] }))).toBe(true);
    expect(letterMatches(letter({ kind: 'hardDay' }), feeling({ zone: 'tense' }))).toBe(true);
    expect(letterMatches(letter({ kind: 'hardDay' }), feeling({ zone: 'calm' }))).toBe(false);
    expect(letterMatches(letter({ kind: 'date', deliverOn: '2026-11-01' }), feeling({}))).toBe(false);
    // The doubt and pride words are real feelings in the wheel.
    for (const id of [...DOUBT_FEELINGS, ...PROUD_FEELINGS]) expect(wheel.some((f) => f.id === id)).toBe(true);
  });

  test('LETTER-002 several match: the one not shown for longest first; never paused, hidden, empty, the other phone\'s copy, or written after the feeling', () => {
    const list = [
      letter({ id: 'seen', zones: ['low'], lastShownAt: '2026-10-20T10:00:00.000Z' }),
      letter({ id: 'never', zones: ['low'], createdAt: '2026-10-05T10:00:00.000Z' }),
      letter({ id: 'old', zones: ['low'], lastShownAt: '2026-09-01T10:00:00.000Z' }),
      letter({ id: 'paused', zones: ['low'], paused: true }),
      letter({ id: 'hidden', zones: ['low'], hidden: true }),
      letter({ id: 'empty', zones: ['low'], text: '  ' }),
      letter({ id: 'copy', zones: ['low'], conflictCopyOf: 'never' }),
      letter({ id: 'after', zones: ['low'], createdAt: '2026-11-01T19:00:00.000Z' }),
    ];
    expect(lettersFor(feeling({}), list).map((l) => l.id)).toEqual(['never', 'old', 'seen']);
  });

  test('LETTER-003 a very strong feeling (4 or 5 of 5): only letters the person said may be shown then', () => {
    const quiet = letter({ id: 'quiet', zones: ['tense'] });
    const ok = letter({ id: 'ok', zones: ['tense'], showWhenIntense: true });
    expect(lettersFor(feeling({ zone: 'tense', intensities: { x: 5 } }), [quiet, ok]).map((l) => l.id)).toEqual(['ok']);
    expect(lettersFor(feeling({ zone: 'tense', intensities: { x: 3 } }), [quiet, ok]).map((l) => l.id).sort()).toEqual(['ok', 'quiet']);
  });

  test('LETTER-004 a dated letter waits from its day until it\'s opened', () => {
    const d = letter({ id: 'd', kind: 'date', deliverOn: '2026-11-01' });
    expect(lettersDue([d], '2026-10-31')).toEqual([]);
    expect(lettersDue([d], '2026-11-01').map((l) => l.id)).toEqual(['d']);
    expect(lettersDue([{ ...d, deliveredAt: '2026-11-01T09:00:00.000Z' }], '2026-11-02')).toEqual([]);
    expect(lettersDue([{ ...d, paused: true }], '2026-11-02')).toEqual([]);
  });
});

describe('the reminder for a dated letter', () => {
  test('LETTER-005 its words say nothing of the letter or of any feeling', () => {
    const words = `${LETTER_REMINDER.title} ${LETTER_REMINDER.body}`.toLowerCase();
    for (const f of wheel) expect({ word: f.name, in: words.includes(f.name.toLowerCase()) }).toEqual({ word: f.name, in: false });
    for (const z of feelingZones) expect({ zone: z.label, in: new RegExp(`\\b${z.label.toLowerCase()}\\b`).test(words) }).toEqual({ zone: z.label, in: false });
    expect(words).not.toMatch(/letter|feel|sad|low|anxious|hard day|doubt|proud/);
  });

  test.each(['2026-03-08', '2026-03-29', '2026-11-01', '2026-10-25', '2026-12-31', '2027-01-01'])('LETTER-006 on %s it\'s 9:00 on that day, on the phone\'s own clock (daylight saving changes included)', (day) => {
    const at = reminderTime(day);
    expect(at.getHours()).toBe(9);
    expect([at.getFullYear(), at.getMonth() + 1, at.getDate()]).toEqual(day.split('-').map(Number));
  });

  test('LETTER-007 scheduled only when asked for, for a dated letter, on the "letters" switch; moved when the day changes; gone when paused, hidden or opened', async () => {
    const id = useLettersStore.getState().addLetter({ kind: 'date', zones: [], feelingIds: [], text: 'Hello, future me', deliverOn: '2026-12-24', remind: true });
    const get = () => useLettersStore.getState().letters.find((l) => l.id === id)!;
    await syncLetterReminder(get());
    expect(scheduleAt).toHaveBeenCalledWith(reminderTime('2026-12-24'), 'letters', LETTER_REMINDER.title, LETTER_REMINDER.body);
    expect(get().notificationIds).toEqual(['n1']);
    // Nothing of the letter in what was scheduled.
    expect(JSON.stringify((scheduleAt as jest.Mock).mock.calls)).not.toContain('future me');
    useLettersStore.getState().setPaused(id, true);
    await syncLetterReminder(get());
    expect(cancelReminders).toHaveBeenLastCalledWith(['n1']);
    expect(get().notificationIds).toBeUndefined();
    // Not asked for: nothing scheduled.
    (scheduleAt as jest.Mock).mockClear();
    const quiet = useLettersStore.getState().addLetter({ kind: 'date', zones: [], feelingIds: [], text: 'x', deliverOn: '2026-12-24', remind: false });
    await syncLetterReminder(useLettersStore.getState().letters.find((l) => l.id === quiet)!);
    expect(scheduleAt).not.toHaveBeenCalled();
  });
});

describe('the store and sync', () => {
  const st = () => useLettersStore.getState();
  test('LETTER-008 write, edit (a new kind clears what no longer applies), pause, hide, delete; a new day for a dated letter waits again', () => {
    const id = st().addLetter({ kind: 'feeling', zones: ['low'], feelingIds: ['sad-lonely'], text: 'Call Sam' });
    expect(st().letters[0]).toMatchObject({ kind: 'feeling', zones: ['low'], feelingIds: ['sad-lonely'], timesShown: 0 });
    st().updateLetter(id, { kind: 'date', deliverOn: '2026-12-01' });
    expect(st().letters[0]).toMatchObject({ kind: 'date', deliverOn: '2026-12-01' });
    st().markDelivered(id);
    st().updateLetter(id, { deliverOn: '2027-01-01' });
    expect(st().letters[0].deliveredAt).toBeUndefined();
    st().updateLetter(id, { kind: 'hardDay', zones: ['calm'] });
    expect(st().letters[0]).toMatchObject({ kind: 'hardDay', zones: [], deliverOn: undefined });
    st().markShown(id);
    expect(st().letters[0].timesShown).toBe(1);
    st().saveForLater(id);
    st().deleteLetter(id);
    expect(st().letters).toEqual([]);
    expect(st().later).toEqual([]);
  });

  test('LETTER-009 synced like the journal (a conflict keeps both); reminder ids, "saved for later" and the last offer stay on this phone', () => {
    expect(KEEP_BOTH.has('letters.letters')).toBe(true);
    const keys = syncedCollections().map((c) => c.key);
    expect(keys).toContain('letters.letters');
    expect(keys).not.toContain('letters.later');
    expect(keys).not.toContain('letters.offeredFor');
    expect(DEVICE_ONLY_FIELDS['letters.letters']).toEqual(['notificationIds']);
    const rec = toRecords('letters.letters', [letter({ notificationIds: ['n1'] })]).get('l1') as Record<string, unknown>;
    expect(rec.notificationIds).toBeUndefined();
    expect(rec.text).toBe('You have done hard things before.');
  });

  test('LETTER-010 the starters: every kind in the app has its own, and they\'re only suggestions (the text starts empty)', () => {
    for (const k of ['feeling', 'doubt', 'proud', 'hardDay', 'date'] as const) expect(LETTERS.kinds.find((x) => x.kind === k)!.starters.texts.length).toBeGreaterThan(0);
    const id = st().addLetter({ kind: 'proud', zones: [], feelingIds: [], text: 'Mine' });
    expect(st().letters.find((l) => l.id === id)!.text).toBe('Mine');
  });
});
