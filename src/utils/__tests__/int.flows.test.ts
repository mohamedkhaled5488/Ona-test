// Integration 2–13: sections working together through the real stores. The
// same numbers wherever they appear; deleting something updates every place
// that referred to it, without orphans or crashes. IDs: docs/test-cases/integration.md
const mockReminders: string[] = [];
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));
jest.mock('../reminders', () => ({ ...jest.requireActual('../reminders'), syncWeeklyStoryReminder: jest.fn(async () => mockReminders.push('weeklyStory')) }));
jest.mock('../audioEngine', () => ({ ...jest.requireActual('../audioEngine'), configureAudio: jest.fn(async () => {}) }));

import { resetAll, useClock, restoreClock, makeCheckIn } from '../../test-utils';
import { useDailyPlanningStore } from '../../store/useDailyPlanningStore';
import { useFeelingsStore } from '../../store/useFeelingsStore';
import { useHabitsStore } from '../../store/useHabitsStore';
import { useSkillsStore } from '../../store/useSkillsStore';
import { useQuitHabitsStore } from '../../store/useQuitHabitsStore';
import { useReadingListStore } from '../../store/useReadingListStore';
import { useStudyStore } from '../../store/useStudyStore';
import { useBudgetStore, totalForBudget } from '../../store/useBudgetStore';
import { useDietStore } from '../../store/useDietStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useSleepStore } from '../../store/useSleepStore';
import { useJournalStore } from '../../store/useJournalStore';
import { usePlanStore } from '../../store/usePlanStore';
import { useThoughtsStore } from '../../store/useThoughtsStore';
import { useSongwritingStore } from '../../store/useSongwritingStore';
import { useMindGamesStore } from '../../store/useMindGamesStore';
import { useRecapStore } from '../../store/useRecapStore';
import { logTaskFeeling, deleteFeelingEntry } from '../taskFeelings';
import { logItemFeeling } from '../itemFeelings';
import { sourceBreakdown, filterBySource, tagInsight } from '../feelingsInsights';
import { dailyTrendPoints, datesInRange } from '../feelingsStats';
import { describeFeelingSource, type FeelingSourceLookup } from '../feelingSource';
import { periodStats, withoutHidden, buildHighlights, buildStory, shareableStoryCards, type RecapData } from '../recapStats';
import { buildExport, LOCAL_DATA } from '../localData';
import { startSettingsEffects } from '../settingsEffects';
import { getCalendarWeekStart, setCalendarWeekStart, formatClockTime } from '../date';
import { frequencyStreak } from '../habitFrequency';
import { planningInsightsAll } from './int.helpers';

const TODAY = '2026-10-18';

beforeEach(async () => {
  await resetAll();
  mockReminders.length = 0;
  useClock(`${TODAY}T18:00`);
});
afterEach(() => {
  restoreClock();
  setCalendarWeekStart(1);
});

// The same data the Recap screen reads (RecapScreen's useRecapData).
function recapData(): RecapData {
  return {
    tasks: useDailyPlanningStore.getState().tasks,
    journalEntries: useJournalStore.getState().entries,
    thoughts: useThoughtsStore.getState().thoughts,
    studySessions: useStudyStore.getState().sessions,
    meals: useDietStore.getState().plannedMeals,
    songs: useSongwritingStore.getState().songs,
    gameResults: useMindGamesStore.getState().results,
    feelingCheckIns: useFeelingsStore.getState().entries,
    sleepLogs: useSleepStore.getState().logs,
    readingEntries: useReadingListStore.getState().entries,
    readingSessions: useReadingListStore.getState().sessions,
    quotes: useReadingListStore.getState().quotes,
    plans: usePlanStore.getState().plans,
    skills: useSkillsStore.getState().skills,
    skillSessions: useSkillsStore.getState().sessions,
    habits: useHabitsStore.getState().habits,
    habitCheckIns: useHabitsStore.getState().checkIns,
    budgets: useBudgetStore.getState().budgets,
    budgetEntries: useBudgetStore.getState().entries,
    quitHabits: useQuitHabitsStore.getState().habits,
    quitTracks: useQuitHabitsStore.getState().tracks,
    quitFeelingEntries: useQuitHabitsStore.getState().feelingEntries,
    bestMoments: useRecapStore.getState().bestMoments,
  } as RecapData;
}

// The labels the Feelings log shows (useFeelingSourceLookup, without React).
const lookup = (): FeelingSourceLookup => ({
  task: (id) => {
    const t = useDailyPlanningStore.getState().tasks.find((x) => x.id === id);
    return t ? t.title || '' : undefined;
  },
  book: (id) => useReadingListStore.getState().entries.find((x) => x.id === id)?.book.title,
  habit: (id) => useHabitsStore.getState().habits.find((x) => x.id === id)?.name,
  quitHabit: (id) => useQuitHabitsStore.getState().habits.find((x) => x.id === id)?.name,
  skill: (id) => useSkillsStore.getState().skills.find((x) => x.id === id)?.name,
  study: (id) => (useStudyStore.getState().sessions.find((x) => x.id === id) ? 'Study' : undefined),
  journal: (id) => {
    const e = useJournalStore.getState().entries.find((x) => x.id === id);
    return e ? e.date : undefined;
  },
});

describe('INT-FEEL: feelings from every section reach the log, the graph and Analysis', () => {
  test('INT-FEEL-001 a task\'s feeling carries the task\'s tags and shows in "After tasks", the graph and the tag insight', () => {
    const tag = useDailyPlanningStore.getState().addTag('Work')!;
    const task = useDailyPlanningStore.getState().addTask(TODAY, 'Report', { tagIds: [tag] })!;
    useDailyPlanningStore.getState().toggleTask(task, TODAY);
    logTaskFeeling({ taskId: task, date: TODAY, phase: 'after', zone: 'tense', feelingIds: [] });
    const entries = useFeelingsStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].reasonTags).toEqual(['Work']);
    expect(filterBySource(entries, 'tasks')).toHaveLength(1);
    expect(dailyTrendPoints(entries, datesInRange(TODAY, TODAY))).toHaveLength(1);
    expect(tagInsight(entries, 'Work')?.n).toBe(1);
    expect(describeFeelingSource(entries[0].source, lookup())?.text).toBe('After a task: Report');
  });

  test('INT-FEEL-002 deleting it from the Feelings log also clears it from the task', () => {
    const task = useDailyPlanningStore.getState().addTask(TODAY, 'Call')!;
    const id = logTaskFeeling({ taskId: task, date: TODAY, phase: 'after', zone: 'calm', feelingIds: [] })!;
    deleteFeelingEntry(id);
    expect(useFeelingsStore.getState().entries).toEqual([]);
    expect(useDailyPlanningStore.getState().tasks[0].feelingLinks[TODAY]?.after).toBeUndefined();
  });

  test('INT-FEEL-003 habits, practice and Quit moments each count under their own source, and the counts add up', () => {
    const h = useHabitsStore.getState().addHabit({ name: 'Walk', targetDays: 30 } as never);
    const s = useSkillsStore.getState().addSkill('Guitar', '#000', 'musical-notes-outline', undefined, '2026-09-01');
    const { habitId: q, trackId } = useQuitHabitsStore.getState().addQuitHabit('Scrolling', undefined);
    logItemFeeling({ source: { kind: 'habit', refId: h }, zone: 'calm' });
    logItemFeeling({ source: { kind: 'habit', refId: h }, zone: 'lively' });
    logItemFeeling({ source: { kind: 'skill', refId: s }, zone: 'okay' });
    logItemFeeling({ source: { kind: 'quitHabit', refId: q, trackId, slip: false }, zone: 'tense' });
    useFeelingsStore.getState().addEntry('low', [], undefined, undefined); // standalone
    const counts = Object.fromEntries(sourceBreakdown(useFeelingsStore.getState().entries).map((g) => [g.group, g.count]));
    expect(counts).toEqual({ all: 5, standalone: 1, habits: 2, practice: 1, quit: 1 });
  });
});

describe('INT-REC: Recap totals equal the sections\' own data', () => {
  test('INT-REC-001 time invested: study + skills + reading + timed habit sessions, each equal to the section\'s sum', () => {
    useStudyStore.setState({
      sessions: [
        { id: 's1', date: TODAY, focusMinutes: 25, breakMinutes: 5, appBlockingEnabled: false, ambientSound: 'none' },
        { id: 's2', date: '2026-10-14', focusMinutes: 50, breakMinutes: 10, appBlockingEnabled: false, ambientSound: 'rain' },
      ] as never,
    });
    const skill = useSkillsStore.getState().addSkill('Guitar', '#000', 'musical-notes-outline', undefined, '2026-09-01');
    useSkillsStore.getState().addSession(skill, { minutes: 30 });
    useSkillsStore.getState().addSession(skill, { minutes: 0 }); // untimed: no minutes
    const book = useReadingListStore.getState().addManualBook('Dune', 'Herbert', 'reading', 600);
    useReadingListStore.getState().addSession(book, 40, undefined, TODAY);
    const h = useHabitsStore.getState().addHabit({ name: 'Run', targetDays: 30 } as never);
    useHabitsStore.getState().setCheckIn(h, TODAY, true, undefined, undefined, undefined, 20);
    const s = periodStats(recapData(), { start: '2026-10-12', end: TODAY });
    expect(s.minutes).toEqual({ study: 75, skills: 30, reading: 40, habits: 20 });
    expect(s.totalMinutes).toBe(165);
    expect(s.skillSessions).toBe(2);
    expect(s.studySessions).toBe(2);
    expect(s.habitCompletions).toBe(1);
  });

  test('INT-REC-002 a shared story leaves Feelings and Quit out unless you include them', () => {
    useFeelingsStore.getState().addEntry('calm', [], undefined, undefined);
    const { trackId } = useQuitHabitsStore.getState().addQuitHabit('Scrolling', undefined);
    useQuitHabitsStore.getState().addFeelingEntry(trackId, undefined, undefined, undefined, false, true);
    const data = withoutHidden(recapData(), []);
    const s = periodStats(data, { start: '2026-10-12', end: TODAY });
    const story = buildStory(data, s, buildHighlights(data, s), 'week', true, TODAY, 'This week');
    const shared = shareableStoryCards(story, false).map((c) => c.id);
    expect(shared).not.toContain('feelings');
    expect(shared).not.toContain('urges');
    expect(shareableStoryCards(story, true).length).toBe(story.length);
  });

  test('INT-REC-003 a hidden section disappears from every Recap number', () => {
    const skill = useSkillsStore.getState().addSkill('Guitar', '#000', 'musical-notes-outline', undefined, '2026-09-01');
    useSkillsStore.getState().addSession(skill, { minutes: 30 });
    const s = periodStats(withoutHidden(recapData(), ['skills']), { start: '2026-10-12', end: TODAY });
    expect(s.minutes.skills).toBe(0);
    expect(s.skillSessions).toBe(0);
  });
});

describe('INT-CUR: Budget and Diet money', () => {
  test('INT-CUR-001 each budget keeps its own currency; Diet\'s currency is separate and changing it touches no budget', () => {
    const a = useBudgetStore.getState().addBudget({ name: 'Trip', mode: 'limit', targetAmount: 800, currency: 'EUR', recurrence: 'none' });
    useBudgetStore.getState().addBudget({ name: 'Food', mode: 'limit', targetAmount: 3000, currency: 'EGP', recurrence: 'monthly' });
    useDietStore.getState().setCurrency('USD');
    useDietStore.getState().setCurrency('GBP');
    expect(useBudgetStore.getState().budgets.map((b) => b.currency).sort()).toEqual(['EGP', 'EUR']);
    expect(useBudgetStore.getState().budgets.find((b) => b.id === a)!.targetAmount).toBe(800);
  });

  test('INT-CUR-002 decimal amounts add up to the cent (no 0.30000000000000004)', () => {
    const id = useBudgetStore.getState().addBudget({ name: 'Coffee', mode: 'limit', targetAmount: 10, currency: 'USD', recurrence: 'none' });
    for (const amount of [0.1, 0.2, 2.75, 1.05]) useBudgetStore.getState().addEntry(id, { amount });
    const total = totalForBudget(useBudgetStore.getState().budgets[0], useBudgetStore.getState().entries, TODAY);
    expect(Math.round(total * 100) / 100).toBe(4.1);
    expect(total).toBeCloseTo(4.1, 9);
  });
});

describe('INT-SET: a setting changed once reaches everything', () => {
  test('INT-SET-001 week start: the date code, habit weeks and the weekly story reminder follow it', async () => {
    useSettingsStore.getState().set('weekStartsOn', 1);
    useSettingsStore.getState().setNotify('weeklyStory', true);
    const stop = startSettingsEffects();
    expect(getCalendarWeekStart()).toBe(1);
    const list = ['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20'].map((date) => makeCheckIn({ habitId: 'h', date }));
    const freq = { kind: 'perWeek', count: 3 } as const;
    expect(frequencyStreak(list, 'h', freq, '2026-10-20').current).toBe(0);
    useSettingsStore.getState().set('weekStartsOn', 0);
    expect(getCalendarWeekStart()).toBe(0);
    expect(frequencyStreak(list, 'h', freq, '2026-10-20').current).toBe(1);
    expect(mockReminders).toEqual(['weeklyStory']);
    stop();
  });

  test('INT-SET-002 time format: 12-hour and 24-hour everywhere times are shown', () => {
    const stop = startSettingsEffects();
    useSettingsStore.getState().set('timeFormat', '24h');
    expect(formatClockTime('18:30')).toBe('18:30');
    useSettingsStore.getState().set('timeFormat', '12h');
    expect(formatClockTime('18:30')).toMatch(/6:30\s?PM/i);
    stop();
  });

  // The timer is remembered as this setting (owner's decision 2026-10-25).
  test("INT-SET-003 Sleep's timer setting is what the next session uses, and changing it in Settings never moves a running timer", async () => {
    const { startSleepSession, stopSleepSession, sleepTimeLeft } = require('../../audio/sleepSession') as typeof import('../../audio/sleepSession');
    useSleepStore.setState({ mix: [{ soundId: 'rain', volume: 0.5 }] } as never);
    useSettingsStore.getState().set('defaultSleepTimerMinutes', 45);
    await startSleepSession();
    expect(sleepTimeLeft()).toBeGreaterThan(44 * 60_000);
    useSettingsStore.getState().set('defaultSleepTimerMinutes', 15);
    expect(sleepTimeLeft()).toBeGreaterThan(44 * 60_000);
    stopSleepSession();
  });
});

describe('INT-DEL: deleting something updates every place that referred to it', () => {
  test('INT-DEL-001 a tag: removed from tasks and templates; Insights and feelings still work', () => {
    const tag = useDailyPlanningStore.getState().addTag('Errands')!;
    const task = useDailyPlanningStore.getState().addTask(TODAY, 'Post office', { tagIds: [tag] })!;
    logTaskFeeling({ taskId: task, date: TODAY, phase: 'after', zone: 'okay', feelingIds: [] });
    useDailyPlanningStore.getState().deleteTag(tag);
    expect(useDailyPlanningStore.getState().tasks[0].tagIds).toEqual([]);
    expect(() => planningInsightsAll()).not.toThrow();
    // The feeling keeps the tag name it was logged with (it's history).
    expect(useFeelingsStore.getState().entries[0].reasonTags).toEqual(['Errands']);
  });

  test('INT-DEL-002 a habit: its check-ins go; its feelings stay, labelled "From a deleted habit"; Recap stops counting it', () => {
    const h = useHabitsStore.getState().addHabit({ name: 'Walk', targetDays: 30 } as never);
    useHabitsStore.getState().setCheckIn(h, TODAY, true);
    logItemFeeling({ source: { kind: 'habit', refId: h }, zone: 'calm' });
    useHabitsStore.getState().deleteHabit(h);
    expect(useHabitsStore.getState().checkIns).toEqual([]);
    expect(describeFeelingSource(useFeelingsStore.getState().entries[0].source, lookup())).toEqual({ text: 'From a deleted habit', deleted: true });
    expect(periodStats(withoutHidden(recapData(), []), { start: '2026-10-12', end: TODAY }).habitCompletions).toBe(0);
  });

  test('INT-DEL-003 a skill: its sessions go (and its Recap minutes); its feelings stay labelled', () => {
    const s = useSkillsStore.getState().addSkill('Guitar', '#000', 'musical-notes-outline', undefined, '2026-09-01');
    useSkillsStore.getState().addSession(s, { minutes: 30 });
    logItemFeeling({ source: { kind: 'skill', refId: s }, zone: 'lively' });
    useSkillsStore.getState().deleteSkill(s);
    expect(periodStats(recapData(), { start: '2026-10-12', end: TODAY }).minutes.skills).toBe(0);
    expect(describeFeelingSource(useFeelingsStore.getState().entries[0].source, lookup())?.text).toBe('From a deleted skill');
  });

  test('INT-DEL-004 a book: its quotes and sessions go, and its reading minutes leave Recap', () => {
    const b = useReadingListStore.getState().addManualBook('Dune', 'Herbert', 'reading', 600);
    useReadingListStore.getState().addQuote(b, { text: 'Fear is the mind-killer.' } as never);
    useReadingListStore.getState().addSession(b, 30, undefined, TODAY);
    useReadingListStore.getState().removeEntry(b);
    expect(useReadingListStore.getState().quotes).toEqual([]);
    expect(useReadingListStore.getState().sessions).toEqual([]);
    expect(periodStats(recapData(), { start: '2026-10-12', end: TODAY }).minutes.reading).toBe(0);
  });

  test('INT-DEL-005 a Quit habit: its tracks and moments go; feelings in the log stay, labelled', () => {
    const { habitId, trackId } = useQuitHabitsStore.getState().addQuitHabit('Scrolling', undefined);
    logItemFeeling({ source: { kind: 'quitHabit', refId: habitId, trackId, slip: false }, zone: 'tense' });
    useQuitHabitsStore.getState().deleteQuitHabit(habitId);
    expect(useQuitHabitsStore.getState().tracks).toEqual([]);
    expect(useQuitHabitsStore.getState().feelingEntries).toEqual([]);
    expect(describeFeelingSource(useFeelingsStore.getState().entries[0].source, lookup())?.text).toBe('From a deleted quit habit');
  });

  test('INT-DEL-006 a task with a feeling: the feeling stays in the log, labelled "From a deleted task"', () => {
    const task = useDailyPlanningStore.getState().addTask(TODAY, 'Dentist')!;
    logTaskFeeling({ taskId: task, date: TODAY, phase: 'after', zone: 'tense', feelingIds: [] });
    useDailyPlanningStore.getState().deleteTask(task);
    expect(describeFeelingSource(useFeelingsStore.getState().entries[0].source, lookup())?.text).toBe('From a deleted task');
  });
});

describe('INT-EXP: export', () => {
  test('INT-EXP-001 the export holds exactly what each section has (counts match)', () => {
    useDailyPlanningStore.getState().addTask(TODAY, 'A');
    useDailyPlanningStore.getState().addTask(TODAY, 'B');
    useJournalStore.getState().upsertEntry(TODAY, 'calm', 'x', []);
    useFeelingsStore.getState().addEntry('calm', [], undefined, undefined);
    const h = useHabitsStore.getState().addHabit({ name: 'Walk', targetDays: 30 } as never);
    useHabitsStore.getState().setCheckIn(h, TODAY, true);
    const exp = buildExport(undefined, new Date());
    for (const [section, { store, keys }] of Object.entries(LOCAL_DATA)) {
      const state = store.getState() as Record<string, unknown>;
      for (const k of keys) {
        const v = state[k];
        if (Array.isArray(v)) expect((exp.sections[section] as Record<string, unknown[]>)[k]).toHaveLength(v.length);
      }
    }
    expect((exp.sections.dailyPlanning as { tasks: unknown[] }).tasks).toHaveLength(2);
  });
});
