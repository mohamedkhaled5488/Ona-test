import { todayISO, addDaysISO } from '../utils/date';
import { nearestZoneForScore } from '../utils/feelingsStats';
import type { LegacyDailyTask } from '../utils/taskMigration';
import type {
  Plan,
  DailyTask,
  JournalEntry,
  CapturedThought,
  StudySession,
  PlannedMeal,
  FavoriteMeal,
  Song,
  FeelingCheckIn,
  FeelingZone,
} from '../types/sections';

export const mockPlans: Plan[] = [
  {
    id: 'plan-1',
    title: 'Perform my own songs live',
    motive: 'Get comfortable performing my own songs live',
    status: 'active',
    color: '#D98F4E',
    tags: ['music', 'confidence'],
    createdAt: addDaysISO(todayISO(), -30),
    reviewIntervalDays: 14,
    steps: [
      {
        id: 'step-1',
        title: 'Write 5 solid original songs',
        color: '#3F6B5C',
        done: true,
        priority: 'high',
        timeEstimate: '3 weeks',
        attachments: [],
        alternatives: [{ id: 'alt-1', label: 'Co-write with a friend instead' }],
        subSteps: [
          { id: 'sub-1', title: 'Finish lyrics for "Low Tide"', attachments: [], alternatives: [], subSteps: [] },
          { id: 'sub-2', title: 'Record rough demos', attachments: [], alternatives: [], subSteps: [] },
        ],
      },
      {
        id: 'step-2',
        title: 'Practice performing weekly',
        color: '#D98F4E',
        done: false,
        priority: 'medium',
        resources: 'A quiet room, my guitar, a phone to record practice runs',
        risks: 'Might lose momentum if I skip more than a week',
        attachments: [],
        alternatives: [{ id: 'alt-2', label: 'Join an open mic instead of solo practice' }],
        subSteps: [
          { id: 'sub-3', title: 'Set up a practice corner at home', attachments: [], alternatives: [], subSteps: [] },
        ],
      },
      {
        id: 'step-3',
        title: 'Book a small open mic slot',
        done: false,
        priority: 'low',
        dueDate: addDaysISO(todayISO(), 21),
        attachments: [],
        alternatives: [],
        subSteps: [],
      },
    ],
  },
  {
    id: 'plan-2',
    title: 'Read one book a month',
    motive: 'Read one book a month this year',
    status: 'archived',
    color: '#5B8FC7',
    tags: ['reading', 'habit'],
    createdAt: addDaysISO(todayISO(), -200),
    reflection: {
      worked: 'Setting a recurring reminder and keeping a shortlist ready to start.',
      differently: 'I would pick shorter books for busier months instead of stalling.',
    },
    steps: [
      {
        id: 'step-4',
        title: 'Finish "Atomic Habits"',
        done: true,
        priority: 'medium',
        attachments: [],
        alternatives: [],
        subSteps: [],
      },
    ],
  },
];

// Saved in the pre-v2 shape on purpose: the store loads them through
// normalizeTask, the same path old saved data takes.
export const mockDailyTasks: LegacyDailyTask[] = [
  {
    id: 'task-1',
    date: todayISO(),
    title: '',
    done: false,
    scheduledTime: '18:00',
    reminderMinutesBefore: 10,
    linkedPlan: { planId: 'plan-1', path: ['step-2'] },
    subtasks: [],
    notificationIds: [],
    completionNotes: {},
    repeat: 'none',
    completedDates: [],
    skippedDates: [],
    order: 0,
  },
  {
    id: 'task-2',
    date: todayISO(),
    title: 'Reply to landlord email',
    done: true,
    subtasks: [],
    notificationIds: [],
    completionNotes: {},
    repeat: 'none',
    completedDates: [],
    skippedDates: [],
    order: 1,
  },
  {
    id: 'task-3',
    date: todayISO(),
    title: 'Grocery run',
    done: false,
    scheduledTime: '10:00',
    subtasks: [
      { id: 'gsub-1', title: 'Milk, eggs, bread', done: false },
      { id: 'gsub-2', title: 'Restock coffee', done: false },
    ],
    notificationIds: [],
    completionNotes: {},
    repeat: 'weekly',
    completedDates: [],
    skippedDates: [],
    order: 2,
  },
  {
    id: 'task-4',
    date: addDaysISO(todayISO(), 1),
    title: '',
    done: false,
    linkedPlan: { planId: 'plan-1', path: ['step-3'] },
    subtasks: [],
    notificationIds: [],
    completionNotes: {},
    repeat: 'none',
    completedDates: [],
    skippedDates: [],
    order: 0,
  },
];

export const mockJournalEntries: JournalEntry[] = [
  { id: 'j-1', date: '2026-09-14', zone: 'lively', text: 'Great writing session, finished a whole verse.', tags: ['music'] },
  { id: 'j-2', date: '2026-09-15', zone: 'calm', text: 'Quiet day, read a lot.', tags: ['rest'] },
  { id: 'j-3', date: '2026-09-16', zone: 'low', text: 'Tired and unmotivated.', tags: [] },
  { id: 'j-4', date: '2026-09-17', zone: 'calm', text: 'Thought a lot about where this year is heading.', tags: ['big-event'] },
  { id: 'j-5', date: '2026-09-18', zone: 'tense', text: 'Stressful day at work, deadline pressure.', tags: ['work', 'worry'] },
  { id: 'j-6', date: '2026-09-19', zone: 'calm', text: 'Went for a long walk, felt settled.', tags: ['gratitude'] },
];

export const mockThoughts: CapturedThought[] = [
  { id: 't-1', createdAt: '2026-09-19T10:00:00Z', kind: 'idea', text: 'Song idea: write something about tide pools and patience.' },
  { id: 't-2', createdAt: '2026-09-18T21:15:00Z', kind: 'feeling', text: 'Felt really proud after finishing that demo.' },
  { id: 't-3', createdAt: '2026-09-17T08:30:00Z', kind: 'idea', text: 'Maybe restructure the chorus to come in earlier.' },
  { id: 't-4', createdAt: addDaysISO(todayISO(), -12) + 'T09:00:00Z', kind: 'random', text: 'What if practice sessions were themed by mood instead of by skill?' },
];

export const mockStudySessions: StudySession[] = [
  {
    id: 's-1',
    date: addDaysISO(todayISO(), -1),
    subject: 'Music theory',
    focusMinutes: 25,
    breakMinutes: 5,
    appBlockingEnabled: false,
    ambientSound: 'none',
    notes: 'Reviewed chord progressions, still shaky on modes.',
  },
  {
    id: 's-2',
    date: addDaysISO(todayISO(), -2),
    subject: 'Guitar practice',
    focusMinutes: 50,
    breakMinutes: 10,
    appBlockingEnabled: true,
    ambientSound: 'rain',
  },
];

export const mockPlannedMeals: PlannedMeal[] = [
  {
    id: 'm-1',
    date: todayISO(),
    slot: 'breakfast',
    name: 'Oatmeal with banana',
    cost: 2.5,
    source: 'home-cooked',
    tags: ['vegetarian'],
  },
  {
    id: 'm-2',
    date: todayISO(),
    slot: 'lunch',
    name: 'Grilled chicken salad',
    cost: 7.0,
    source: 'restaurant',
    tags: [],
  },
  {
    id: 'm-3',
    date: todayISO(),
    slot: 'dinner',
    name: 'Pasta with veggies',
    cost: 5.25,
    source: 'home-cooked',
    notes: 'Use the garlic that is about to go bad',
    tags: ['vegetarian'],
  },
  {
    id: 'm-4',
    date: addDaysISO(todayISO(), 1),
    slot: 'breakfast',
    name: 'Oatmeal with banana',
    cost: 2.5,
    source: 'home-cooked',
    tags: ['vegetarian'],
  },
];

export const mockFavoriteMeals: FavoriteMeal[] = [
  { id: 'fav-1', name: 'Oatmeal with banana', cost: 2.5, source: 'home-cooked', tags: ['vegetarian'] },
  { id: 'fav-2', name: 'Chicken stir fry', cost: 6.0, source: 'home-cooked', tags: [] },
];

export const mockSongs: Song[] = [
  {
    id: 'song-1',
    title: 'Low Tide',
    songTypeId: 'pop',
    status: 'in-progress',
    createdAt: addDaysISO(todayISO(), -10),
    updatedAt: addDaysISO(todayISO(), -1),
    inspiration: ['Bon Iver - Holocene (space in the production)', 'The feeling of walking on a beach at low tide'],
    collaborator: undefined,
    hasVoiceMemo: true,
    sections: [
      { id: 'sec-1', label: 'Verse 1', text: 'Woke up early, tide was out\nFound the things I used to doubt' },
      { id: 'sec-2', label: 'Pre-Chorus', text: '' },
      { id: 'sec-3', label: 'Chorus', text: 'We were low tide, holding on\nTo the shapes the water left when it was gone' },
      { id: 'sec-4', label: 'Verse 2', text: '' },
      { id: 'sec-5', label: 'Pre-Chorus', text: '' },
      { id: 'sec-6', label: 'Chorus', text: 'We were low tide, holding on\nTo the shapes the water left when it was gone' },
      { id: 'sec-7', label: 'Bridge', text: '' },
      { id: 'sec-8', label: 'Chorus', text: 'We were low tide, holding on\nTo the shapes the water left when it was gone' },
    ],
    versions: [
      {
        id: 'ver-1',
        savedAt: addDaysISO(todayISO(), -5) + 'T10:00:00Z',
        label: 'First chorus idea',
        sections: [
          { id: 'sec-1', label: 'Verse 1', text: 'Woke up early, tide was out' },
          { id: 'sec-2', label: 'Pre-Chorus', text: '' },
          { id: 'sec-3', label: 'Chorus', text: 'Low tide, holding on' },
          { id: 'sec-4', label: 'Verse 2', text: '' },
          { id: 'sec-5', label: 'Pre-Chorus', text: '' },
          { id: 'sec-6', label: 'Chorus', text: 'Low tide, holding on' },
          { id: 'sec-7', label: 'Bridge', text: '' },
          { id: 'sec-8', label: 'Chorus', text: 'Low tide, holding on' },
        ],
      },
    ],
  },
];

// A demo spread for the Patterns trend chart, not real data: ~11 weeks back
// to yesterday, with a wave shape (weekend lift, a rough patch mid-way, a
// recovery), so Week/Month/Year all show a real up-and-down line instead of
// a flat one. Deterministic (no Math.random) so it renders the same every
// run.
const feelingPoolByZone: Record<FeelingZone, string[]> = {
  lively: ['joyful-cheerful', 'powerful-hopeful', 'joyful-excited', 'lively-motivated', 'powerful-confident'],
  calm: ['peaceful-content', 'calm-calm', 'peaceful-relaxed', 'peaceful-thankful'],
  okay: ['okay-okay', 'okay-distracted', 'okay-unsure'],
  tense: ['tense-stressed', 'mad-irritated', 'scared-anxious', 'tense-overwhelmed', 'mad-frustrated'],
  low: ['sad-lonely', 'low-tired', 'low-drained', 'sad-bored', 'low-disappointed'],
};

function buildDemoCheckIns(): FeelingCheckIn[] {
  const entries: FeelingCheckIn[] = [];
  const totalDays = 78; // ~11 weeks, plus today itself so the current month has no gaps

  for (let i = 0; i <= totalDays; i++) {
    const offset = -(totalDays - i); // oldest first, up to 0 (today)
    const date = addDaysISO(todayISO(), offset);
    const weekday = new Date(`${date}T00:00:00`).getDay(); // 0 Sun .. 6 Sat
    const isWeekend = weekday === 0 || weekday === 6;

    // A slow wave plus a genuinely rough patch around day 18-27, then a
    // gradual recovery toward the present.
    const wave = Math.sin(i / 6) * 1.3;
    const roughPatch = i >= 18 && i <= 27 ? -1.6 : 0;
    const weekendLift = isWeekend ? 0.8 : 0;
    const recentRecovery = i > 60 ? (i - 60) * 0.04 : 0;

    const score = Math.max(-2, Math.min(2, wave + roughPatch + weekendLift + recentRecovery));
    const zone = nearestZoneForScore(score);
    const pool = feelingPoolByZone[zone];
    const feelingId = pool[i % pool.length];

    const intensities = i % 4 === 0 ? { [feelingId]: (1 + (i % 5)) as 1 | 2 | 3 | 4 | 5 } : undefined;
    const reasonTags =
      zone === 'tense' && i % 3 === 0
        ? ['Work']
        : zone === 'low' && i % 5 === 0
          ? ['Sleep']
          : zone === 'lively' && isWeekend
            ? ['Social plans']
            : undefined;

    entries.push({
      id: `feel-demo-${i}`,
      feelingIds: [feelingId],
      zone,
      intensities,
      reasonTags,
      date,
      createdAt: `${date}T20:00:00Z`,
    });
  }

  return entries;
}

export const mockFeelingCheckIns: FeelingCheckIn[] = buildDemoCheckIns();
