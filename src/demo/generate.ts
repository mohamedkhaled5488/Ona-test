// Demo mode's sample data: about eight weeks of a calm, ordinary life in Ona,
// built relative to `today` so every chart looks full and recent. A seeded
// generator: the same seed and day give exactly the same data.
//
// The persona has no name. Content is neutral and gentle: work, a walk,
// family time, learning guitar. Nothing distressing. Gaps are realistic
// (missed days, a paused streak, a slip on the quit journey that's part of
// the journey, not a reset).
//
// Nothing is dated in the future except planned tasks and planned meals.
import type {
  BestMoment,
  Budget,
  BudgetEntry,
  CapturedThought,
  DailyTask,
  FeelingCheckIn,
  FeelingZone,
  GameResult,
  Habit,
  HabitCheckIn,
  JournalEntry,
  PersonalFeeling,
  Plan,
  PlanStep,
  PlannedMeal,
  PracticeSession,
  QuitFeelingEntry,
  QuitHabit,
  QuitTrack,
  Quote,
  ReadingListEntry,
  ReadingSession,
  Skill,
  SleepLogEntry,
  Song,
  StudySession,
  TaskTag,
  TaskTemplate,
  FavoriteMeal,
  GroceryItem,
} from '../types/sections';
import { addDaysISO, weekdayOfISO } from '../utils/date';
import { normalizeTask } from '../utils/taskMigration';
import { songTypes } from '../data/songTypes';

export const DEMO_SEED = 'ona-demo-1';
export const DEMO_DAYS = 56; // about eight weeks of history

export interface DemoImages {
  sketchEarly: string;
  sketchLatest: string;
  bookPage: string;
  practiceNotes: string;
}

export interface GenerateOptions {
  today: string; // ISO date
  now?: number; // ms; no sample timestamp is later than this (defaults to the real now)
  seed?: string;
  currency?: string;
  images: DemoImages;
}

export type DemoSections = Record<string, Record<string, unknown>>;

// --- Seeded randomness -----------------------------------------------------------
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDemoData(opts: GenerateOptions): DemoSections {
  const { today, images } = opts;
  const seed = opts.seed ?? DEMO_SEED;
  const rand = mulberry32(hashString(seed));
  const chance = (p: number) => rand() < p;
  const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
  let counter = 0;
  const id = (prefix: string) => `${prefix}-demo-${++counter}`;
  const ago = (n: number) => addDaysISO(today, -n);
  const ahead = (n: number) => addDaysISO(today, n);
  // A local time on a date, as an ISO datetime, never later than now (so
  // nothing in the sample data is dated in the future).
  const now = opts.now ?? Date.now();
  const at = (date: string, h: number, m = 0) => {
    const [y, mo, d] = date.split('-').map(Number);
    // ...and never before the start of its own day (just after midnight).
    const dayStart = new Date(y, mo - 1, d).getTime();
    return new Date(Math.max(dayStart, Math.min(new Date(y, mo - 1, d, h, m).getTime(), now))).toISOString();
  };
  const isWeekend = (date: string) => [0, 6].includes(weekdayOfISO(date));

  // ===== Feelings (the most charts depend on this) ====================================
  const WORDS: Record<FeelingZone, string[]> = {
    lively: ['joyful-energetic', 'lively-motivated', 'powerful-proud', 'joyful-cheerful', 'lively-focused', 'powerful-hopeful', 'joyful-creative'],
    calm: ['peaceful-content', 'peaceful-relaxed', 'calm-rested', 'peaceful-thankful', 'powerful-satisfied', 'peaceful-serene'],
    tense: ['tense-stressed', 'scared-anxious', 'tense-overwhelmed', 'mad-frustrated', 'tense-worried', 'tense-restless'],
    low: ['low-tired', 'low-drained', 'low-disappointed', 'sad-lonely', 'low-unmotivated'],
    okay: ['okay-okay', 'okay-distracted', 'peaceful-sleepy', 'okay-unsure'],
  };
  const REASONS: Record<FeelingZone, string[]> = {
    lively: ['Work', 'Social plans', 'Health/Body', 'Weather'],
    calm: ['Alone time', 'Family', 'Sleep', 'Weather'],
    tense: ['Work', 'Money', 'Sleep', 'News/world events'],
    low: ['Sleep', 'Health/Body', 'Weather', 'Alone time'],
    okay: ['Work', 'Not sure', 'Alone time'],
  };
  const NOTES: Partial<Record<FeelingZone, string[]>> = {
    lively: ['Good walk at lunch.', 'Finished the slides early.', 'Nice catch-up with a friend.'],
    calm: ['Quiet evening with a book.', 'Slow Sunday morning.', 'Tea and a long call with my sister.'],
    tense: ['Busy day of meetings.', 'Deadline moved up.', 'Too many tabs open, in every sense.'],
    low: ['Short night of sleep.', 'Grey day, stayed in.'],
    okay: ['Ordinary day.', 'Nothing much to report.'],
  };
  const zoneFor = (date: string): FeelingZone => {
    const wd = weekdayOfISO(date);
    const r = rand();
    if (isWeekend(date)) return r < 0.35 ? 'lively' : r < 0.75 ? 'calm' : r < 0.9 ? 'okay' : 'low';
    if (wd === 1) return r < 0.35 ? 'tense' : r < 0.55 ? 'okay' : r < 0.75 ? 'calm' : r < 0.9 ? 'lively' : 'low';
    return r < 0.22 ? 'lively' : r < 0.5 ? 'calm' : r < 0.7 ? 'okay' : r < 0.9 ? 'tense' : 'low';
  };

  const feelingEntries: FeelingCheckIn[] = [];
  const addFeeling = (date: string, zone: FeelingZone, extra: Partial<FeelingCheckIn> = {}, hour = int(8, 21)) => {
    const two = chance(0.3);
    const ids = two ? [pick(WORDS[zone]), pick(WORDS[zone])].filter((v, i, a) => a.indexOf(v) === i) : [pick(WORDS[zone])];
    const entry: FeelingCheckIn = {
      id: id('feeling'),
      zone,
      feelingIds: ids,
      intensities: Object.fromEntries(ids.map((f) => [f, int(2, 5) as 1 | 2 | 3 | 4 | 5])),
      reasonTags: chance(0.75) ? [...new Set([pick(REASONS[zone]), ...(chance(0.35) ? [pick(REASONS[zone])] : [])])] : undefined,
      date,
      createdAt: at(date, hour, int(0, 59)),
      ...(chance(0.35) && NOTES[zone] ? { note: pick(NOTES[zone]!) } : {}),
      ...extra,
    };
    feelingEntries.push(entry);
    return entry;
  };

  // About 40 check-ins over eight weeks, with real gaps. Days 25 to the end of
  // last month are always covered, so a month graph shows its whole month.
  const lastMonthEnd = addDaysISO(`${today.slice(0, 7)}-01`, -1);
  const monthTail = new Set(Array.from({ length: Number(lastMonthEnd.slice(8)) - 24 }, (_, i) => `${lastMonthEnd.slice(0, 8)}${25 + i}`).filter((d) => d >= ago(DEMO_DAYS)));
  for (let n = DEMO_DAYS; n >= 0; n--) {
    const date = ago(n);
    if (monthTail.has(date) || n === 0 || chance(0.62)) addFeeling(date, zoneFor(date));
  }
  const personalFeelings: PersonalFeeling[] = [{ id: 'personal-demo-cozy', name: 'Cozy', zone: 'calm', createdAt: at(ago(30), 20) }];
  const cozyDay = ago(12);
  addFeeling(cozyDay, 'calm', { feelingIds: ['personal-demo-cozy'], intensities: { 'personal-demo-cozy': 4 }, note: 'Rainy evening, blanket, soup.' }, 20);

  // ===== Habits (build) =====================================================
  const habits: Habit[] = [
    {
      id: 'habit-demo-walk',
      name: 'Morning walk',
      cueRoutine: 'After my first coffee',
      identity: 'someone who starts the day outside',
      minimumVersion: 'Walk to the end of the street and back',
      why: 'I think more clearly after some air.',
      targetDays: 30,
      createdAt: ago(55),
      reminderEnabled: false,
      reminderNotificationIds: [],
      frequency: { kind: 'daily' },
      graduatedAt: ago(24),
      graduationChoice: 'maintenance',
    },
    {
      id: 'habit-demo-read',
      name: 'Read 10 pages',
      cueRoutine: 'After dinner',
      minimumVersion: 'Read one page',
      why: 'Books used to be my favourite part of the day.',
      targetDays: 66,
      createdAt: ago(50),
      reminderEnabled: false,
      reminderNotificationIds: [],
      frequency: { kind: 'weekdays', days: [1, 2, 3, 4, 5] },
      pairedQuitHabitId: 'quit-demo-scroll',
    },
    {
      id: 'habit-demo-stretch',
      name: 'Stretch',
      minimumVersion: 'Two minutes of neck and shoulders',
      targetDays: 30,
      createdAt: ago(42),
      reminderEnabled: false,
      reminderNotificationIds: [],
      frequency: { kind: 'perWeek', count: 3 },
    },
    {
      id: 'habit-demo-water',
      name: 'Glass of water before coffee',
      cueRoutine: 'When I put the kettle on',
      targetDays: 21,
      createdAt: ago(38),
      reminderEnabled: false,
      reminderNotificationIds: [],
      frequency: { kind: 'daily' },
    },
  ];
  const checkIns: HabitCheckIn[] = [];
  const check = (habitId: string, date: string, done: boolean, extra: Partial<HabitCheckIn> = {}) =>
    checkIns.push({ id: id('checkin'), habitId, date, done, createdAt: at(date, done ? int(7, 21) : 21, int(0, 59)), ...extra });
  for (let n = 55; n >= 0; n--) {
    const date = ago(n);
    const wd = weekdayOfISO(date);
    // Morning walk: most days; a few "minimum version" days; the odd miss.
    if (n > 0 || chance(0.5)) {
      const r = rand();
      if (r < 0.74) check('habit-demo-walk', date, true, chance(0.3) ? { durationMinutes: int(15, 40) } : {});
      else if (r < 0.84) check('habit-demo-walk', date, true, { note: 'Minimum version today: just to the end of the street.' });
      else if (r < 0.95) check('habit-demo-walk', date, false, { reasonTags: [pick(['Weather', 'Sleep', 'Work'])] });
    }
    // Read 10 pages: weekdays, a bit patchier.
    if (n <= 50 && wd >= 1 && wd <= 5) {
      const r = rand();
      if (r < 0.66) check('habit-demo-read', date, true, chance(0.4) ? { durationMinutes: int(10, 30) } : {});
      else if (r < 0.76) check('habit-demo-read', date, true, { note: 'Minimum version: one page, then bed.' });
      else if (r < 0.85) check('habit-demo-read', date, false, { reasonTags: ['Sleep'] });
    }
    // Stretch: about three times a week.
    if (n <= 42 && chance(0.45)) check('habit-demo-stretch', date, true);
    // Water: steady, then a pause for the last four days (a paused streak).
    if (n <= 38 && n >= 4 && chance(0.88)) check('habit-demo-water', date, true);
  }
  // A few "how did that feel?" moments after a habit.
  for (const n of [40, 33, 26, 19, 11, 5, 2]) {
    const date = ago(n);
    const walk = checkIns.find((c) => c.habitId === 'habit-demo-walk' && c.date === date && c.done);
    if (walk) addFeeling(date, chance(0.6) ? 'calm' : 'lively', { source: { kind: 'habit', refId: 'habit-demo-walk' }, reasonTags: ['Health/Body'] }, 8);
  }

  // ===== Daily Planning ============================================================
  const tags: TaskTag[] = [
    { id: 'tag-demo-work', name: 'Work', color: '#5B8FC7', createdAt: at(ago(56), 9) },
    { id: 'tag-demo-home', name: 'Home', color: '#7FAE68', createdAt: at(ago(56), 9) },
    { id: 'tag-demo-health', name: 'Health', color: '#C97B5A', createdAt: at(ago(56), 9) },
    { id: 'tag-demo-learning', name: 'Learning', color: '#B072A0', createdAt: at(ago(56), 9) },
  ];
  const TASKS: { title: string; tag: string; priority: DailyTask['priority']; energy: DailyTask['energy']; estimate: number; subtasks?: string[] }[] = [
    { title: 'Prepare slides for the team update', tag: 'tag-demo-work', priority: 'high', energy: 'high', estimate: 90, subtasks: ['Outline', 'Charts', 'Practice once'] },
    { title: 'Reply to project emails', tag: 'tag-demo-work', priority: 'medium', energy: 'low', estimate: 30 },
    { title: 'Review the quarterly plan', tag: 'tag-demo-work', priority: 'medium', energy: 'high', estimate: 60 },
    { title: 'One-to-one with a colleague', tag: 'tag-demo-work', priority: 'medium', energy: 'medium', estimate: 30 },
    { title: 'Groceries', tag: 'tag-demo-home', priority: 'low', energy: 'low', estimate: 45, subtasks: ['Vegetables', 'Bread', 'Coffee'] },
    { title: 'Laundry', tag: 'tag-demo-home', priority: 'none', energy: 'low', estimate: 20 },
    { title: 'Call Mum', tag: 'tag-demo-home', priority: 'medium', energy: 'low', estimate: 30 },
    { title: 'Tidy the desk', tag: 'tag-demo-home', priority: 'low', energy: 'low', estimate: 15 },
    { title: 'Book a dentist check-up', tag: 'tag-demo-health', priority: 'medium', energy: 'low', estimate: 10 },
    { title: 'Yoga class', tag: 'tag-demo-health', priority: 'medium', energy: 'medium', estimate: 60 },
    { title: 'Meal prep for the week', tag: 'tag-demo-health', priority: 'low', energy: 'medium', estimate: 60 },
    { title: 'Guitar practice', tag: 'tag-demo-learning', priority: 'medium', energy: 'medium', estimate: 30 },
    { title: 'Online course: one lesson', tag: 'tag-demo-learning', priority: 'medium', energy: 'high', estimate: 45 },
    { title: 'Read a chapter', tag: 'tag-demo-learning', priority: 'low', energy: 'low', estimate: 30 },
  ];
  const tasks: DailyTask[] = [];
  const raw = (t: Partial<DailyTask> & { title: string; date: string }) => {
    // Planned-ahead tasks were created today, not on their future date.
    const created = t.date > today ? at(today, 8) : at(t.date, 8);
    const task = normalizeTask({ id: id('task'), done: false, repeat: 'none', order: tasks.filter((x) => x.date === t.date).length, createdAt: created, ...t });
    tasks.push(task);
    return task;
  };
  // History: two to four tasks a day, about seven in ten finished.
  for (let n = DEMO_DAYS; n >= 1; n--) {
    const date = ago(n);
    const count = isWeekend(date) ? int(1, 2) : int(2, 4);
    for (let i = 0; i < count; i++) {
      const tpl = pick(TASKS.filter((t) => !isWeekend(date) || t.tag !== 'tag-demo-work'));
      const done = chance(0.72);
      const hour = tpl.energy === 'high' ? int(9, 12) : int(9, 20);
      const timed = done && chance(0.35);
      const task = raw({
        title: tpl.title,
        date,
        done,
        tagIds: [tpl.tag],
        priority: tpl.priority,
        energy: tpl.energy,
        estimateMinutes: tpl.estimate,
        subtasks: (tpl.subtasks ?? []).map((s) => ({ id: id('subtask'), title: s, done })),
        completedAt: done ? { [date]: at(date, hour, int(0, 59)) } : {},
        // Things usually take a bit longer than planned.
        actualMinutes: timed ? { [date]: Math.round(tpl.estimate * (0.9 + rand() * 0.7)) } : {},
        completionNotes: done && chance(0.3) ? { [date]: { difficulty: pick(['easier', 'asExpected', 'asExpected', 'harder'] as const) } } : {},
      });
      // Some finished tasks have a feeling attached (linked both ways).
      if (done && (tpl.priority === 'high' || tpl.priority === 'medium') && chance(0.3)) {
        const zone: FeelingZone = tpl.tag === 'tag-demo-learning' || tpl.tag === 'tag-demo-health' ? pick(['calm', 'lively', 'calm'] as const) : pick(['calm', 'tense', 'okay', 'lively'] as const);
        const entry = addFeeling(date, zone, { source: { kind: 'task', refId: task.id, date, phase: 'after' }, reasonTags: [tags.find((t) => t.id === tpl.tag)!.name], feelingIds: [WORDS[zone][0]], intensities: { [WORDS[zone][0]]: 3 } }, hour + 1);
        task.feelingLinks = { [date]: { after: entry.id } };
      }
    }
  }
  // Repeating tasks.
  let firstMonday = ago(55);
  while (weekdayOfISO(firstMonday) !== 1) firstMonday = addDaysISO(firstMonday, 1);
  const weekly = raw({ title: 'Plan the week', date: firstMonday, repeat: 'weekly', tagIds: ['tag-demo-work'], priority: 'medium', energy: 'medium', estimateMinutes: 20, scheduledTime: '09:00' });
  weekly.completedDates = Array.from({ length: 8 }, (_, i) => addDaysISO(firstMonday, i * 7)).filter((d) => d < today && chance(0.85));
  weekly.completedAt = Object.fromEntries(weekly.completedDates.map((d) => [d, at(d, 9, 25)]));
  const inbox = raw({ title: 'Inbox to zero', date: ago(40), repeat: 'weekdays', tagIds: ['tag-demo-work'], priority: 'low', energy: 'low', estimateMinutes: 15 });
  inbox.completedDates = Array.from({ length: 40 }, (_, i) => ago(40 - i)).filter((d) => !isWeekend(d) && chance(0.7));
  inbox.completedAt = Object.fromEntries(inbox.completedDates.map((d) => [d, at(d, 17, 30)]));
  // Carried over: still open from earlier days, one moved a few times, one let go.
  raw({ title: 'Return the library book', date: ago(2), tagIds: ['tag-demo-home'], priority: 'low', energy: 'low', estimateMinutes: 15, moveCount: 1 });
  raw({ title: 'Sort out the photo backup', date: ago(1), tagIds: ['tag-demo-home'], priority: 'medium', energy: 'medium', estimateMinutes: 60, moveCount: 4, notes: 'Phone, laptop, then the old hard drive.' });
  raw({ title: 'Learn a new card game', date: ago(9), tagIds: ['tag-demo-learning'], priority: 'none', energy: 'low', estimateMinutes: 30, letGoDates: [ago(9)] });
  // Today: a realistic plan, one thing done already.
  raw({ title: 'Team stand-up', date: today, tagIds: ['tag-demo-work'], priority: 'medium', energy: 'medium', estimateMinutes: 15, scheduledTime: '09:30', durationMinutes: 15, done: true, completedAt: { [today]: at(today, 9, 47) } });
  raw({
    title: 'Prepare slides for the team update',
    date: today,
    tagIds: ['tag-demo-work'],
    priority: 'high',
    energy: 'high',
    estimateMinutes: 90,
    scheduledTime: '10:30',
    durationMinutes: 90,
    subtasks: [
      { id: id('subtask'), title: 'Outline', done: true },
      { id: id('subtask'), title: 'Charts', done: false },
      { id: id('subtask'), title: 'Practice once', done: false },
    ],
    why: 'So the team can decide on the next quarter.',
  });
  raw({ title: 'Walk at lunch', date: today, tagIds: ['tag-demo-health'], priority: 'low', energy: 'low', estimateMinutes: 30, scheduledTime: '13:00', durationMinutes: 30, context: 'Outside' });
  raw({ title: 'Call Mum', date: today, tagIds: ['tag-demo-home'], priority: 'medium', energy: 'low', estimateMinutes: 30, scheduledTime: '18:30', context: 'Phone call' });
  // Next week: planned ahead.
  raw({ title: 'Dentist check-up', date: ahead(3), tagIds: ['tag-demo-health'], priority: 'medium', energy: 'low', estimateMinutes: 60, scheduledTime: '15:00' });
  raw({ title: 'Present the team update', date: ahead(5), tagIds: ['tag-demo-work'], priority: 'high', energy: 'high', estimateMinutes: 45, scheduledTime: '11:00' });
  raw({ title: 'Picnic if it is sunny', date: ahead(6), tagIds: ['tag-demo-home'], priority: 'none', energy: 'medium', estimateMinutes: 120 });
  // A step pulled from Plan Builder (live link).
  raw({ title: '', date: today, linkedPlan: { planId: 'plan-demo-10k', path: ['step-demo-10k-2'] }, why: 'Feel strong and run without stopping.' });

  const taskTemplates: TaskTemplate[] = [
    {
      id: 'tpl-demo-week',
      name: 'Weekly reset',
      createdAt: at(ago(30), 10),
      fields: { title: 'Weekly reset', tagIds: ['tag-demo-home'], priority: 'low', energy: 'low', estimateMinutes: 45, subtaskTitles: ['Laundry', 'Fridge check', 'Plan meals'], reminders: [] },
    },
  ];
  const dayReflections: Record<string, string> = {
    [ago(1)]: 'Slow start, good afternoon.',
    [ago(3)]: 'Too many meetings, but the walk helped.',
    [ago(8)]: 'Quiet, productive day.',
  };

  // ===== Plan Builder =================================================================
  const step = (sid: string, title: string, extra: Partial<PlanStep> = {}): PlanStep => ({ id: sid, title, attachments: [], alternatives: [], subSteps: [], ...extra });
  const plans: Plan[] = [
    {
      id: 'plan-demo-10k',
      title: 'Run a 10k in spring',
      motive: 'Feel strong and run without stopping.',
      status: 'active',
      color: '#4F9B82',
      tags: ['health', 'running'],
      createdAt: ago(48),
      reviewIntervalDays: 14,
      steps: [
        step('step-demo-10k-1', 'Run 3 km without stopping', { done: true, priority: 'high', color: '#4F9B82', timeEstimate: '3 weeks', notes: 'Run-walk intervals first.' }),
        step('step-demo-10k-2', 'Run 5 km comfortably', {
          priority: 'high',
          color: '#5B8FC7',
          timeEstimate: '4 weeks',
          resources: 'Running shoes, a free couch-to-5k app',
          risks: 'Knees complain if I add distance too fast.',
          alternatives: [{ id: 'alt-demo-1', label: 'Join the Saturday park run instead' }],
          subSteps: [step('sub-demo-1', 'Three runs a week', { done: true }), step('sub-demo-2', 'One longer run on Sundays')],
        }),
        step('step-demo-10k-3', 'Sign up for a spring 10k', { priority: 'medium', color: '#D98F4E', dueDate: ahead(30), attachments: [{ id: 'att-demo-1', label: 'Local race calendar (bookmarked)' }] }),
      ],
    },
    {
      id: 'plan-demo-cook',
      title: 'Learn to cook five new dishes',
      motive: 'Eat better and enjoy evenings in.',
      status: 'active',
      color: '#D98F4E',
      tags: ['home', 'food'],
      createdAt: ago(35),
      steps: [
        step('step-demo-cook-1', 'Lentil soup', { done: true, priority: 'low' }),
        step('step-demo-cook-2', 'Vegetable curry', { done: true, priority: 'medium' }),
        step('step-demo-cook-3', 'Fresh pasta', { priority: 'medium', alternatives: [{ id: 'alt-demo-2', label: 'Gnocchi if pasta is too fiddly' }] }),
        step('step-demo-cook-4', 'Bread', { priority: 'low', subSteps: [step('sub-demo-3', 'Buy flour and yeast'), step('sub-demo-4', 'Try a no-knead loaf')] }),
        step('step-demo-cook-5', 'Something for guests', { priority: 'low' }),
      ],
    },
    {
      id: 'plan-demo-reset',
      title: 'Monthly home reset',
      motive: 'A calm, tidy flat without a big weekend clean.',
      status: 'active',
      color: '#B072A0',
      tags: ['home', 'recurring'],
      createdAt: ago(56),
      reviewIntervalDays: 30,
      steps: [step('step-demo-reset-1', 'Clear the hallway', { done: true }), step('step-demo-reset-2', 'Sort the paperwork', { done: true }), step('step-demo-reset-3', 'Donate clothes I no longer wear')],
    },
  ];

  // ===== Journaling ================================================================
  const JOURNAL: { n: number; zone: FeelingZone; feeling?: string; text: string; tags: string[]; font?: JournalEntry['font'] }[] = [
    { n: 54, zone: 'lively', feeling: 'lively-motivated', text: 'Started the running plan today. Only a short run-walk, but it felt like the start of something.', tags: ['running'] },
    { n: 50, zone: 'calm', feeling: 'peaceful-content', text: 'Dinner with the family. Everyone talking at once, the good kind of noise.', tags: ['family'] },
    { n: 46, zone: 'tense', feeling: 'tense-stressed', text: 'Work was a lot this week. Writing it down helps me see it is only three things, not thirty.', tags: ['work'] },
    { n: 42, zone: 'okay', text: 'An ordinary Tuesday. Coffee, emails, a walk, an early night.', tags: [] },
    { n: 38, zone: 'calm', feeling: 'peaceful-relaxed', text: 'Long walk by the river. Saw a heron standing very still, which felt like a hint.', tags: ['walk'], font: 'caveat' },
    { n: 34, zone: 'low', feeling: 'low-tired', text: 'Slept badly. Took it slow and that was the right call.', tags: ['sleep'] },
    { n: 30, zone: 'lively', feeling: 'joyful-creative', text: 'Tried a new chord progression on the guitar and it actually sounded like music.', tags: ['guitar'] },
    { n: 26, zone: 'calm', feeling: 'peaceful-thankful', text: 'Grateful for small things: warm socks, a friend checking in, the soup turning out well.', tags: ['gratitude'], font: 'patrickHand' },
    { n: 22, zone: 'tense', feeling: 'scared-anxious', text: 'Nervous before the presentation. It went fine. Most things do.', tags: ['work'] },
    { n: 18, zone: 'okay', feeling: 'okay-distracted', text: 'Scattered day. Made a short list and did two things on it.', tags: [] },
    { n: 14, zone: 'lively', feeling: 'powerful-proud', text: 'Ran 5 km without stopping for the first time!', tags: ['running'] },
    { n: 10, zone: 'calm', feeling: 'calm-rested', text: 'Weekend with no plans. Read in the park.', tags: ['reading'] },
    { n: 6, zone: 'low', feeling: 'low-disappointed', text: 'The bread did not rise. Next time, warmer water.', tags: ['cooking'] },
    { n: 3, zone: 'calm', feeling: 'peaceful-serene', text: 'Morning walk in the fog. Very quiet streets.', tags: ['walk'] },
    { n: 1, zone: 'lively', feeling: 'joyful-cheerful', text: 'Lunch with an old friend. We laughed a lot.', tags: ['friends'] },
  ];
  const journalEntries: JournalEntry[] = JOURNAL.map((j) => ({ id: id('journal'), date: ago(j.n), zone: j.zone, preciseFeelingId: j.feeling, text: j.text, tags: j.tags, ...(j.font ? { font: j.font } : {}) }));

  // ===== Quit a habit ===========================================================
  const quitHabits: QuitHabit[] = [{ id: 'quit-demo-scroll', name: 'Late-night scrolling', why: 'I want to fall asleep with a calmer head.', createdAt: ago(45), replacementHabitId: 'habit-demo-read' }];
  const tracks: QuitTrack[] = [
    {
      id: 'track-demo-1',
      quitHabitId: 'quit-demo-scroll',
      startDate: ago(45),
      createdAt: at(ago(45), 22),
      endDate: ago(24),
      status: 'archived',
      relapseReflection: 'A stressful week and the phone was right there by the bed. Moving the charger to the hallway.',
      relapseReasonTags: ['Work', 'Sleep'],
    },
    { id: 'track-demo-2', quitHabitId: 'quit-demo-scroll', startDate: ago(23), createdAt: at(ago(23), 21) },
  ].map((t) => ({ status: 'active' as const, ...t })) as QuitTrack[];
  const APPROACHES = ['Riding it out', 'Doing something instead', 'Checking the facts', 'Reaching out'];
  const quitFeelings: QuitFeelingEntry[] = [];
  for (const n of [42, 38, 33, 29, 26, 20, 16, 12, 8, 5, 2]) {
    const date = ago(n);
    quitFeelings.push({
      id: id('quitfeeling'),
      trackId: n > 23 ? 'track-demo-1' : 'track-demo-2',
      feelingId: pick(['tense-restless', 'low-tired', 'okay-distracted']),
      zone: pick(['tense', 'low', 'okay'] as const),
      isRelapseMoment: false,
      isResistedUrge: true,
      approach: pick(APPROACHES),
      urgePassed: chance(0.8),
      createdAt: at(date, int(21, 23), int(0, 59)),
    });
  }
  quitFeelings.push({ id: id('quitfeeling'), trackId: 'track-demo-1', feelingId: 'low-drained', zone: 'low', note: 'Scrolled until late. Tomorrow is a new start.', isRelapseMoment: true, isResistedUrge: false, createdAt: at(ago(24), 23, 40) });
  quitFeelings.push({ id: id('quitfeeling'), trackId: 'track-demo-2', feelingId: 'calm-rested', zone: 'calm', note: 'Book instead of phone. Asleep by eleven.', isRelapseMoment: false, isResistedUrge: false, createdAt: at(ago(4), 22, 50) });

  // ===== Skills ===================================================================
  const guitarStart = ago(56);
  const skills: Skill[] = [
    {
      id: 'skill-demo-guitar',
      name: 'Guitar',
      color: '#D98F4E',
      icon: 'musical-notes-outline',
      type: 'music',
      startDate: guitarStart,
      reminderEnabled: false,
      reminderNotificationIds: [],
      startingLevel: 'starting',
      currentLevel: 'some',
      levelHistory: [
        { id: 'lvl-demo-1', date: guitarStart, to: 'starting' },
        { id: 'lvl-demo-2', date: ago(20), from: 'starting', to: 'some', afterMilestoneId: 'ms-demo-2' },
      ],
      goal: 'Play three songs all the way through',
      goalTargetDate: ahead(60),
      weeklyGoalMinutes: 120,
      subSkills: [
        { id: 'sub-demo-chords', name: 'Chord changes', level: 3, createdAt: guitarStart },
        { id: 'sub-demo-strum', name: 'Strumming', level: 2, createdAt: guitarStart },
        { id: 'sub-demo-finger', name: 'Fingerpicking', level: 1, createdAt: ago(30) },
      ],
      metrics: [{ id: 'metric-demo-changes', name: 'Clean chord changes', unit: 'per minute', direction: 'higher', role: 'primary', createdAt: guitarStart }],
      milestones: [
        { id: 'ms-demo-1', text: 'Play G, C and D cleanly', achieved: true, achievedAt: ago(40) },
        { id: 'ms-demo-2', text: 'First full song', achieved: true, achievedAt: ago(20), reflection: 'Slow, but all the way through!' },
        { id: 'ms-demo-3', text: 'Barre an F chord', achieved: false, targetDate: ahead(30) },
      ],
      resources: [
        { id: 'res-demo-1', name: 'Beginner course videos', type: 'video', status: 'inProgress', createdAt: guitarStart },
        { id: 'res-demo-2', name: 'Chord book', type: 'book', status: 'done', doneAt: ago(15), createdAt: guitarStart },
      ],
    },
    {
      id: 'skill-demo-sketch',
      name: 'Sketching',
      color: '#5B8FC7',
      icon: 'color-palette-outline',
      type: 'art',
      startDate: ago(42),
      reminderEnabled: false,
      reminderNotificationIds: [],
      startingLevel: 'starting',
      currentLevel: 'starting',
      levelHistory: [{ id: 'lvl-demo-3', date: ago(42), to: 'starting' }],
      goal: 'Fill one sketchbook',
      subSkills: [
        { id: 'sub-demo-lines', name: 'Confident lines', level: 2, createdAt: ago(42) },
        { id: 'sub-demo-shade', name: 'Shading', level: 1, createdAt: ago(42) },
      ],
      metrics: [{ id: 'metric-demo-self', name: 'Overall', unit: '1-10', direction: 'higher', role: 'primary', createdAt: ago(42), selfRating: true }],
      milestones: [{ id: 'ms-demo-4', text: 'Draw something every day for a week', achieved: true, achievedAt: ago(28) }],
      resources: [],
    },
  ];
  const practice: PracticeSession[] = [];
  let changes = 6;
  for (let n = 55; n >= 0; n -= int(2, 3)) {
    const date = ago(n);
    // Steady progress, then a plateau over the last two weeks.
    changes = n > 14 ? changes + rand() * 1.6 : changes + (rand() - 0.5) * 0.6;
    const plateau = n <= 14;
    practice.push({
      id: id('practice'),
      skillId: 'skill-demo-guitar',
      date,
      minutes: int(15, 40),
      createdAt: at(date, 19, int(0, 59)),
      hasVoiceMemo: false,
      focusSubSkillIds: [pick(['sub-demo-chords', 'sub-demo-strum'])],
      difficulty: plateau ? pick(['challenging', 'justRight'] as const) : pick(['justRight', 'justRight', 'tooEasy'] as const),
      metricValues: { 'metric-demo-changes': Math.round(changes) },
      ...(plateau && chance(0.4) ? { struggledSubSkillIds: ['sub-demo-chords'], struggledText: 'Stuck on the change into F. Same number as last week.' } : {}),
      ...(n === 20 ? { breakthrough: true, notes: 'Played a whole song through. Felt great.' } : {}),
      ...(n === 34 ? { photoUri: images.practiceNotes, notes: 'Chord shapes I keep mixing up.' } : {}),
    });
  }
  const sketchDays = [42, 38, 35, 30, 27, 21, 16, 12, 7, 3];
  sketchDays.forEach((n, i) => {
    const date = ago(n);
    practice.push({
      id: id('practice'),
      skillId: 'skill-demo-sketch',
      date,
      minutes: int(10, 30),
      createdAt: at(date, 20, int(0, 59)),
      hasVoiceMemo: false,
      metricValues: { 'metric-demo-self': Math.min(8, 3 + Math.floor(i / 2)) },
      ...(i === 0 ? { photoUri: images.sketchEarly, notes: 'First go: a coffee cup.' } : {}),
      ...(i === sketchDays.length - 1 ? { photoUri: images.sketchLatest, notes: 'Same cup, much better lines.' } : {}),
    });
  });

  // ===== Study =====================================================================
  const SUBJECTS = ['Spanish', 'Statistics course', 'Guitar theory'];
  const studySessions: StudySession[] = [];
  for (let n = 13; n >= 0; n--) {
    if (n !== 0 && !chance(0.65)) continue;
    const date = ago(n);
    const deep = chance(0.4);
    const cycles = int(1, 3);
    const focus = (deep ? 50 : 25) * cycles - (chance(0.3) ? int(1, 10) : 0);
    // Ends no later than now (today's session has just finished).
    const length = (focus + (deep ? 10 : 5) * cycles) * 60_000;
    const endMs = Math.min(Date.parse(at(date, int(8, 19), 0)) + length, now);
    const start = new Date(endMs - length).toISOString();
    studySessions.push({
      id: id('study'),
      date,
      subject: pick(SUBJECTS),
      focusMinutes: focus,
      breakMinutes: (deep ? 10 : 5) * cycles,
      appBlockingEnabled: chance(0.5),
      ambientSound: pick(['none', 'rain', 'white-noise'] as const),
      presetLabel: deep ? 'Deep Work 50/10' : 'Classic 25/5',
      cyclesCompleted: cycles,
      startedAt: start,
      endedAt: new Date(endMs).toISOString(),
      ...(chance(0.6) ? { notes: pick(['Went well, kept focus.', 'Flash cards, then a short reading.', 'Hard to start, easier after ten minutes.', 'Finished the exercises.']) } : {}),
      ...(chance(0.25) ? { comments: [{ id: id('comment'), text: 'Review this part again on Friday.', createdAt: at(date, 21) }] } : {}),
    });
  }

  // ===== Sleep =====================================================================
  const sleepLogs: SleepLogEntry[] = [];
  for (let n = 21; n >= 1; n--) {
    if (!chance(0.7)) continue;
    const date = ago(n);
    const quality = (isWeekend(date) ? int(3, 5) : int(2, 5)) as SleepLogEntry['quality'];
    sleepLogs.push({ id: id('sleep'), date, quality, createdAt: at(addDaysISO(date, 1), 7, int(0, 50)), ...(chance(0.35) ? { note: pick(['Phone in the hallway helped.', 'Woke up once, back asleep quickly.', 'Late dinner, restless.', 'Rain sounds, slept well.']) } : {}) });
  }
  // A saved sound mix (not playing; Demo mode never auto-plays audio).
  const sleepMix = [
    { soundId: 'rain', volume: 0.6 },
    { soundId: 'brown-noise', volume: 0.3 },
  ];

  // ===== Book =====================================================================
  const reading: ReadingListEntry = {
    id: 'book-demo-1',
    bookId: 'b-demo-1',
    status: 'reading',
    book: { id: 'b-demo-1', title: 'The Quiet Garden', authors: ['A. Rowan'] },
    addedAt: at(ago(30), 20),
    updatedAt: at(ago(1), 22),
    totalPages: 320,
    currentPage: 146,
    progressPercent: 46,
  };
  const finished: ReadingListEntry = {
    id: 'book-demo-2',
    bookId: 'b-demo-2',
    status: 'finished',
    book: { id: 'b-demo-2', title: 'Small Steps, Long Roads', authors: ['M. Okafor'] },
    addedAt: at(ago(55), 20),
    updatedAt: at(ago(33), 21),
    totalPages: 240,
    currentPage: 240,
    rating: 4,
    notes: 'Gentle and practical. Chapter 6 stuck with me.',
  };
  const bookSessions: ReadingSession[] = [];
  let page = 0;
  for (let n = 30; n >= 1; n -= int(2, 4)) {
    const pages = int(8, 22);
    bookSessions.push({ id: id('reading'), entryId: 'book-demo-1', date: ago(n), minutes: Math.round(pages * 2.2), pagesRead: pages, startPage: page + 1, endPage: page + pages });
    page += pages;
  }
  reading.currentPage = Math.min(page, 300);
  reading.progressPercent = Math.round((reading.currentPage / 320) * 100);
  const quotes: Quote[] = [
    { id: id('quote'), entryId: 'book-demo-1', text: 'A garden is never finished, and neither are we.', pageNumber: 23, favorite: true, createdAt: at(ago(25), 21) },
    { id: id('quote'), entryId: 'book-demo-1', text: '', pageNumber: 112, note: 'The passage about patience.', photoUri: images.bookPage, favorite: false, createdAt: at(ago(12), 22) },
    { id: id('quote'), entryId: 'book-demo-2', text: 'Start smaller than you think you should.', pageNumber: 41, favorite: true, createdAt: at(ago(45), 21) },
  ];

  // ===== Budget =====================================================================
  const currency = opts.currency ?? 'USD';
  const monthStart = `${today.slice(0, 7)}-01`;
  const budgets: Budget[] = [
    {
      id: 'budget-demo-month',
      name: 'Monthly spending',
      mode: 'limit',
      targetAmount: 1200,
      currency,
      recurrence: 'monthly',
      createdAt: ago(56),
      categories: [
        { id: 'cat-demo-groceries', label: 'Groceries' },
        { id: 'cat-demo-transport', label: 'Transport' },
        { id: 'cat-demo-home', label: 'Home' },
        { id: 'cat-demo-fun', label: 'Fun' },
      ],
    },
    { id: 'budget-demo-eatout', name: 'Eating out', mode: 'limit', targetAmount: 150, currency, recurrence: 'monthly', createdAt: ago(56), categories: [] },
    { id: 'budget-demo-trip', name: 'Summer trip', mode: 'goal', targetAmount: 900, currency, recurrence: 'none', deadline: ahead(120), createdAt: ago(50), categories: [] },
  ];
  const budgetEntries: BudgetEntry[] = [];
  const spend = (budgetId: string, date: string, amount: number, categoryId?: string, note?: string) =>
    budgetEntries.push({ id: id('spend'), budgetId, date, amount: Math.round(amount * 100) / 100, categoryId, note, createdAt: at(date, 18) });
  // This month and last: groceries weekly, transport, the odd treat. This
  // month ends up a little close to the limit (a gentle warning).
  for (let n = DEMO_DAYS; n >= 0; n--) {
    const date = ago(n);
    if (weekdayOfISO(date) === 6) spend('budget-demo-month', date, 60 + rand() * 30, 'cat-demo-groceries', 'Weekly shop');
    if (!isWeekend(date) && chance(0.4)) spend('budget-demo-month', date, 3 + rand() * 4, 'cat-demo-transport');
    if (chance(0.08)) spend('budget-demo-month', date, 15 + rand() * 50, 'cat-demo-home', pick(['Lamp', 'Plants', 'Kitchen bits']));
    if (chance(0.1)) spend('budget-demo-month', date, 10 + rand() * 30, 'cat-demo-fun', pick(['Cinema', 'Concert ticket', 'Board game']));
    if (chance(0.12)) spend('budget-demo-eatout', date, 12 + rand() * 25, undefined, pick(['Lunch out', 'Dinner with friends', 'Coffee and cake']));
    if (date.endsWith('-01') || n === DEMO_DAYS) spend('budget-demo-trip', date, 150, undefined, 'Monthly saving');
  }
  // Rent-sized item early this month keeps "Monthly spending" near its limit.
  if (monthStart <= today) spend('budget-demo-month', monthStart, 0.82 * 1200 - budgetEntries.filter((e) => e.budgetId === 'budget-demo-month' && e.date >= monthStart).reduce((s, e) => s + e.amount, 0), 'cat-demo-home', 'Bills');

  // ===== Diet =====================================================================
  const MEALS: { slot: PlannedMeal['slot']; name: string; cost: number; source: PlannedMeal['source'] }[] = [
    { slot: 'breakfast', name: 'Porridge with berries', cost: 1.5, source: 'home-cooked' },
    { slot: 'breakfast', name: 'Toast and eggs', cost: 2, source: 'home-cooked' },
    { slot: 'lunch', name: 'Lentil soup', cost: 2.5, source: 'home-cooked' },
    { slot: 'lunch', name: 'Sandwich from the cafe', cost: 7, source: 'restaurant' },
    { slot: 'dinner', name: 'Vegetable curry', cost: 4, source: 'home-cooked' },
    { slot: 'dinner', name: 'Pasta with tomato sauce', cost: 3, source: 'home-cooked' },
    { slot: 'dinner', name: 'Takeaway pizza', cost: 16, source: 'delivery' },
    { slot: 'snack', name: 'Apple and nuts', cost: 1, source: 'grocery' },
  ];
  const meals: PlannedMeal[] = [];
  for (let n = -3; n <= 3; n++) {
    const date = addDaysISO(today, n);
    for (const slot of ['breakfast', 'lunch', 'dinner'] as const) {
      const m = pick(MEALS.filter((x) => x.slot === slot));
      meals.push({ id: id('meal'), date, slot, name: m.name, cost: m.cost, source: m.source, tags: [] });
    }
    if (chance(0.4)) meals.push({ id: id('meal'), date, slot: 'snack', name: 'Apple and nuts', cost: 1, source: 'grocery', tags: [] });
  }
  const favorites: FavoriteMeal[] = [
    { id: id('fav'), name: 'Vegetable curry', cost: 4, source: 'home-cooked', tags: ['batch'] },
    { id: id('fav'), name: 'Lentil soup', cost: 2.5, source: 'home-cooked', tags: ['quick'] },
  ];
  const groceries: GroceryItem[] = ['Oats', 'Berries', 'Lentils', 'Tomatoes', 'Coffee'].map((label, i) => ({ id: id('grocery'), label, checked: i < 2 }));

  // ===== Songwriting ===============================================================
  const folk = songTypes.find((s) => s.id === 'folk') ?? songTypes[0];
  const pop = songTypes.find((s) => s.id === 'pop') ?? songTypes[0];
  const LINES = ['Morning light on the kitchen floor', 'Kettle singing like it knows', 'We said we would take it slow', 'And the river keeps its own time', 'Hold the door, the rain can wait', 'Every road bends back toward home'];
  const sections = (structure: string[], filled: number) => structure.map((label, i) => ({ id: id('songpart'), label, text: i < filled ? `${pick(LINES)}\n${pick(LINES)}` : '' }));
  const finishedSections = sections(folk.structure, folk.structure.length);
  const songs: Song[] = [
    {
      id: 'song-demo-1',
      title: 'Kitchen Floor',
      songTypeId: folk.id,
      status: 'finished',
      sections: finishedSections,
      versions: [{ id: id('songversion'), savedAt: at(ago(20), 21), label: 'First full draft', sections: finishedSections }],
      inspiration: ['Slow mornings', 'The sound of rain on the window'],
      hasVoiceMemo: false,
      createdAt: at(ago(35), 20),
      updatedAt: at(ago(18), 21),
    },
    {
      id: 'song-demo-2',
      title: 'Bend Back Home',
      songTypeId: pop.id,
      status: 'in-progress',
      sections: sections(pop.structure, 3),
      versions: [],
      inspiration: ['A long train ride'],
      hasVoiceMemo: false,
      createdAt: at(ago(6), 21),
      updatedAt: at(ago(2), 22),
    },
  ];

  // ===== Mind games ================================================================
  const gameResults: GameResult[] = [];
  for (const n of [40, 33, 25, 18, 12, 7, 4, 1]) {
    const gameId = pick(['memory', 'reaction', 'math', 'word'] as const);
    const score = gameId === 'reaction' ? int(260, 380) : gameId === 'memory' ? int(14, 24) : int(8, 20);
    gameResults.push({ id: id('game'), gameId, difficulty: pick(['easy', 'medium'] as const), score, playedAt: at(ago(n), int(12, 21), int(0, 59)) });
  }

  // ===== Catch a thought ==============================================================
  const THOUGHTS: [ThoughtKindLike, string, ('plan' | 'journal')?][] = [
    ['idea', 'Try running the river loop backwards', 'plan'],
    ['idea', 'Birthday gift: a plant for the office'],
    ['feeling', 'Nervous about Monday, but prepared', 'journal'],
    ['random', 'Remember to water the basil'],
    ['idea', 'Song title: "Bend Back Home"'],
    ['feeling', 'Really enjoyed the quiet this morning'],
    ['idea', 'Batch-cook soup on Sundays', 'plan'],
    ['random', 'That cafe on the corner does good cake'],
    ['feeling', 'Proud of the 5 km run', 'journal'],
    ['random', 'Look up a beginner pottery class'],
  ];
  const thoughts: CapturedThought[] = THOUGHTS.map(([kind, text, promotedTo], i) => ({ id: id('thought'), createdAt: at(ago(50 - i * 5), int(9, 21), int(0, 59)), kind, text, ...(promotedTo ? { promotedTo } : {}) }));

  // ===== Recap: best moments ========================================================
  const bestMoments: BestMoment[] = [
    { date: ago(14), sourceSection: 'journaling', label: 'Ran 5 km without stopping', refId: journalEntries[10].id },
    { date: ago(20), sourceSection: 'skills', label: 'First full song on guitar' },
    { date: ago(1), sourceSection: 'journaling', label: 'Lunch with an old friend', refId: journalEntries[14].id },
  ];

  // Sorted the way the stores keep them (newest first where they do).
  feelingEntries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return {
    planBuilder: { plans, personalTemplates: [] },
    dailyPlanning: { tasks, tags, taskTemplates, hiddenStarterTemplates: [], dayTemplates: [], dayReflections, dayOrder: {} },
    journaling: { entries: journalEntries },
    catchAThought: { thoughts },
    studySession: { sessions: studySessions.reverse(), active: null, pendingSummary: null },
    dietPlanning: { plannedMeals: meals, favorites, groceryItems: groceries, currency },
    songwriting: { songs },
    mindGames: { results: gameResults },
    feelings: { entries: feelingEntries, personalFeelings, bookmarks: ['peaceful-content', 'calm-rested'], guidanceVotes: {}, customReasonTags: ['Exercise'] },
    sleep: { logs: sleepLogs.reverse(), mix: sleepMix },
    book: { entries: [reading, finished], quotes, sessions: bookSessions.reverse() },
    skills: { skills, sessions: practice.sort((a, b) => b.date.localeCompare(a.date)) },
    habits: { habits, checkIns },
    budget: { budgets, entries: budgetEntries },
    quitHabit: { habits: quitHabits, tracks, feelingEntries: quitFeelings },
    recap: { bestMoments },
  };
}

type ThoughtKindLike = CapturedThought['kind'];

// The phone's currency, when Ona supports it (the Budget section's list).
export function localeCurrency(): string {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const region = (locale.split('-').find((p) => /^[A-Z]{2}$/.test(p)) ?? '').toUpperCase();
    const map: Record<string, string> = { US: 'USD', GB: 'GBP', EG: 'EGP', SA: 'SAR', AE: 'AED', TR: 'TRY', IN: 'INR', CA: 'CAD', AU: 'AUD', JP: 'JPY', CN: 'CNY' };
    const euro = ['DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'AT', 'IE', 'PT', 'FI', 'GR'];
    return map[region] ?? (euro.includes(region) ? 'EUR' : 'USD');
  } catch {
    return 'USD';
  }
}
