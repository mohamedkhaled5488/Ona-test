// Every word of the Discover page and the slide tour, in one place, so it can
// be edited and translated without touching the components. Each slide names
// the feature it describes (`feature`); a test checks every one against the
// app, and another scans all of this for claims Ona doesn't make.
//
// Checked against the build (Parts A–C). Softened or left out because they
// aren't built: sleep-problem guides and "when to talk to a doctor" (Sleep),
// income tracking (Budget: spending limits and savings goals only), a
// "flowchart" (Plan Builder has a list and a map view), Songwriting and Mind
// Games (held back from this launch's navigation).
import type { RootStackParamList } from '../navigation/types';
import { ESSENTIALS_NAME, PLUS_NAME, TRIAL_DAYS, TRIAL_NAME } from '../config/plans';

export type TourGroupId = 'welcome' | 'plan' | 'reflect' | 'grow' | 'learn' | 'recap' | 'data' | 'finish';

// The simple brand-style mock drawn above a slide.
export type MockKind = 'welcome' | 'map' | 'list' | 'task' | 'meals' | 'budget' | 'journal' | 'zones' | 'chart' | 'sleep' | 'pattern' | 'milestone' | 'quit' | 'skill' | 'book' | 'timer' | 'recap' | 'data' | 'finish';

export interface TryIt {
  route: keyof RootStackParamList;
  params?: Record<string, unknown>;
}

export interface Slide {
  key: string;
  title: string;
  body: string;
  feature: string; // what this slide describes, checked by a test
  mock: MockKind;
  tryIt?: TryIt; // shown on the last slide of a section
}

export interface TourSection {
  id: string; // also used by "Explore by section"
  group: TourGroupId;
  title: string;
  accent?: string; // the section's color, when it has one
  slides: Slide[];
}

export const TOUR: TourSection[] = [
  {
    id: 'welcome',
    group: 'welcome',
    title: 'Welcome',
    slides: [
      {
        key: 'welcome-1',
        title: 'Welcome to Ona',
        body: 'Ona helps you stay close to yourself: plan what matters, understand how you feel, and grow without being judged.',
        feature: 'app',
        mock: 'welcome',
      },
      {
        key: 'welcome-2',
        title: 'Simple by default',
        body: 'Every section is calm and simple by default, and goes deeper only when you choose. Everything works offline; sign in to sync across devices.',
        feature: 'offlineSync',
        mock: 'welcome',
      },
    ],
  },

  // --- Plan ---
  {
    id: 'planBuilder',
    group: 'plan',
    title: 'Plan Builder',
    slides: [
      { key: 'pb-1', title: 'Start with why', body: 'Plan Builder holds the bigger picture. Write the motive behind a plan, then break it into steps.', feature: 'planMotive', mock: 'map' },
      {
        key: 'pb-2',
        title: 'Steps, backups and sub-steps',
        body: "Add steps, a backup alternative for when plan A doesn't work out, and sub-steps. Reorder them, mark priorities by color, and switch between a list and a map view.",
        feature: 'planSteps',
        mock: 'map',
      },
      { key: 'pb-3', title: 'From plan to today', body: 'Move any step into Daily Planning, so a big plan turns into something you can do today.', feature: 'planMove', mock: 'list', tryIt: { route: 'planBuilder' } },
    ],
  },
  {
    id: 'dailyPlanning',
    group: 'plan',
    title: 'Daily Planning',
    slides: [
      { key: 'dp-1', title: 'Your day, your way', body: "See today as a list or a timeline. Tasks left open from earlier days stay in view, so nothing quietly disappears.", feature: 'dayView', mock: 'list' },
      {
        key: 'dp-2',
        title: 'A full task page',
        body: 'Tags, priority, energy, time estimates, subtasks, reminders with the sound you choose, repeats, and moving a task to tomorrow. Use as much or as little as you like.',
        feature: 'taskPage',
        mock: 'task',
      },
      {
        key: 'dp-3',
        title: 'What you get back',
        body: 'If you like, note how you feel after a task. Insights show the numbers behind your days, like how many tasks you finished and how you felt after them, always with how many they are based on.',
        feature: 'planningInsights',
        mock: 'chart',
        tryIt: { route: 'dailyPlanning' },
      },
    ],
  },
  {
    id: 'dietPlanning',
    group: 'plan',
    title: 'Diet Planning',
    slides: [
      { key: 'diet-1', title: 'Plan your meals', body: 'Plan meals for each day of the week, at whatever detail suits you.', feature: 'mealPlan', mock: 'meals' },
      { key: 'diet-2', title: 'Costs, if you want them', body: 'Add an optional cost to a meal in your own currency, and note where it comes from.', feature: 'mealCost', mock: 'meals' },
      { key: 'diet-3', title: 'What you get back', body: 'A grocery list and a summary by day, week or month: totals, and the meals you repeated.', feature: 'mealSummary', mock: 'chart', tryIt: { route: 'dietPlanning' } },
    ],
  },
  {
    id: 'budget',
    group: 'plan',
    title: 'Budget',
    slides: [
      { key: 'bud-1', title: 'Limits and goals', body: 'Set a spending limit, or a savings goal with an optional deadline, in your currency.', feature: 'budgetModes', mock: 'budget' },
      { key: 'bud-2', title: 'Log as you go', body: 'Add an amount with a category, a note or a photo of the receipt.', feature: 'budgetEntries', mock: 'budget' },
      { key: 'bud-3', title: 'Gentle notes, no guilt', body: 'See your progress at a glance. Ona quietly points it out as you get close to a limit, at the level you choose.', feature: 'budgetWarn', mock: 'budget', tryIt: { route: 'budget' } },
    ],
  },

  // --- Reflect ---
  {
    id: 'journaling',
    group: 'reflect',
    title: 'Journaling',
    slides: [
      { key: 'jr-1', title: 'Write freely', body: 'A quiet page for whatever is on your mind, with a color for how the day felt.', feature: 'journalZone', mock: 'journal' },
      { key: 'jr-2', title: 'Make it yours', body: 'Choose a handwriting-style font and a page style. Reopen old entries in a calm read mode.', feature: 'journalFont', mock: 'journal' },
      { key: 'jr-3', title: 'On this day', body: 'Now and then, Ona shows what you wrote on this day before.', feature: 'journalOnThisDay', mock: 'journal', tryIt: { route: 'journaling' } },
    ],
  },
  {
    id: 'moodCheck',
    group: 'reflect',
    title: 'Identify the Feeling',
    slides: [
      {
        key: 'feel-1',
        title: 'Name what you feel',
        body: 'Start with one of five zones, each with a plain definition. Go deeper with the feelings wheel and rate how strong it is.',
        feature: 'feelingWheel',
        mock: 'zones',
      },
      { key: 'feel-2', title: 'Ways to respond', body: 'Each feeling comes with research-informed ways to respond, and you can tag what was going on.', feature: 'feelingGuidance', mock: 'zones' },
      {
        key: 'feel-3',
        title: 'Patterns over time',
        body: 'A graph you can zoom, pan and compare. Analysis starts with your first entry and grows carefully as you log more. It is self-reflection, not a medical tool, and support resources are always one tap away.',
        feature: 'feelingAnalysis',
        mock: 'chart',
        tryIt: { route: 'moodCheck' },
      },
    ],
  },
  {
    id: 'sleep',
    group: 'reflect',
    title: 'Sleep',
    slides: [
      { key: 'sl-1', title: 'Wind down', body: 'A wind-down checklist and a bedtime reminder help the evening slow down.', feature: 'sleepWindDown', mock: 'sleep' },
      { key: 'sl-2', title: 'Sounds for sleep', body: 'Mix ambient sounds like rain or brown noise, each at its own volume, with a sleep timer that fades out.', feature: 'sleepSounds', mock: 'sleep' },
      { key: 'sl-3', title: 'Gentle mornings', body: 'Note how you slept, and get a gentle reminder in the morning.', feature: 'sleepLog', mock: 'sleep', tryIt: { route: 'sleep' } },
    ],
  },

  // --- Grow ---
  {
    id: 'habitBuilder',
    group: 'grow',
    title: 'Habits: Build',
    slides: [
      { key: 'hb-1', title: 'Small and steady', body: 'Build a habit around a cue you already have, with a smaller backup version for hard days that still counts.', feature: 'habitMinimum', mock: 'list' },
      { key: 'hb-2', title: 'Streaks that pause', body: 'A missed day pauses a streak instead of wiping it. A clear milestone bar shows where you are.', feature: 'habitMilestones', mock: 'milestone' },
      {
        key: 'hb-3',
        title: 'What you get back',
        body: 'A day-by-day done and missed pattern, a time-of-day view that shows how often it gets done at each time, logs you can open for the comment you left, and optional feelings after.',
        feature: 'habitPattern',
        mock: 'pattern',
        tryIt: { route: 'habitsHub', params: { initialMode: 'build' } },
      },
    ],
  },
  {
    id: 'quitHabit',
    group: 'grow',
    title: 'Habits: Quit',
    slides: [
      { key: 'qh-1', title: 'Ride out a craving', body: 'When a craving comes, pick what might help: breathing, something to do instead, checking the facts, or reaching out. A gentle timer keeps going while you switch.', feature: 'quitUrge', mock: 'quit' },
      { key: 'qh-2', title: 'Every urge you resist counts', body: 'When a craving passes, it counts as an urge ridden out, and they add up on your journey.', feature: 'quitResisted', mock: 'quit' },
      {
        key: 'qh-3',
        title: 'Your journey stays',
        body: 'A slip is a hard day marked on your journey, not a restart. The journey and its day count carry on. No punishment, no reset to zero.',
        feature: 'quitJourney',
        mock: 'pattern',
        tryIt: { route: 'habitsHub', params: { initialMode: 'quit' } },
      },
    ],
  },
  {
    id: 'skills',
    group: 'grow',
    title: 'Skills',
    slides: [
      { key: 'sk-1', title: 'Practice with purpose', body: 'Track a skill with levels and sub-skills. Log practice sessions with notes and photos, with or without the timer.', feature: 'skillSessions', mock: 'skill' },
      { key: 'sk-2', title: 'Steady stretches', body: 'Ona notices when progress levels off, and says plainly that plateaus are a normal part of learning.', feature: 'skillPlateau', mock: 'chart' },
      {
        key: 'sk-3',
        title: 'Your journey',
        body: 'A Journey page with every milestone and breakthrough, a first-versus-latest photo comparison, and optional feelings after practice.',
        feature: 'skillJourney',
        mock: 'skill',
        tryIt: { route: 'skills' },
      },
    ],
  },

  // --- Learn ---
  {
    id: 'book',
    group: 'learn',
    title: 'Book',
    slides: [
      { key: 'bk-1', title: 'Track your reading', body: 'Log pages and see your progress, with an estimate of the time left once you have a few sessions.', feature: 'bookProgress', mock: 'book' },
      { key: 'bk-2', title: 'Keep what matters', body: 'Save quotes by typing them or taking a photo of the page.', feature: 'bookQuotes', mock: 'book' },
      { key: 'bk-3', title: 'Reading sessions', body: 'Time your reading sessions and, if you like, note how the reading felt.', feature: 'bookSessions', mock: 'timer', tryIt: { route: 'book' } },
    ],
  },
  {
    id: 'studySession',
    group: 'learn',
    title: 'Study Session',
    slides: [
      { key: 'st-1', title: 'Focus in rounds', body: 'A focus timer with breaks, using a preset or times you set yourself.', feature: 'studyTimer', mock: 'timer' },
      { key: 'st-2', title: 'Optional focus sounds', body: 'Play a calm background sound while you work, or keep it quiet.', feature: 'studySounds', mock: 'timer' },
      { key: 'st-3', title: 'Notes and history', body: 'Add a note after each session and look back at your history by day.', feature: 'studyHistory', mock: 'list', tryIt: { route: 'studySession' } },
    ],
  },

  // --- Recap ---
  {
    id: 'recap',
    group: 'recap',
    title: 'Recap',
    slides: [
      { key: 'rc-1', title: 'Your week at a glance', body: 'Home pulls everything together: the time you invested and what went well.', feature: 'recapWeek', mock: 'recap' },
      { key: 'rc-2', title: 'Area pages', body: 'Open Plan, Reflect, Grow or Learn for a closer look at each part of your week.', feature: 'recapAreas', mock: 'recap' },
      {
        key: 'rc-3',
        title: 'A story to share, if you want',
        body: 'Make a story of your week to share. Feelings and Quit cards are left out unless you choose to include them.',
        feature: 'recapShare',
        mock: 'recap',
        tryIt: { route: 'Main' },
      },
    ],
  },

  // --- The rest ---
  {
    id: 'data',
    group: 'data',
    title: 'Your data',
    slides: [
      {
        key: 'data-1',
        title: 'Your data, your choice',
        body: `Ona works offline. Sign in for a ${TRIAL_DAYS}-day ${TRIAL_NAME} with sync and every insight; after it, Ona carries on in ${ESSENTIALS_NAME}, or choose ${PLUS_NAME}. Export or delete your data any time.`,
        feature: 'dataControl',
        mock: 'data',
      },
    ],
  },
  {
    id: 'finish',
    group: 'finish',
    title: "You're ready",
    slides: [{ key: 'finish-1', title: "That's Ona", body: 'Try it with sample data first, or start with your own. You can come back to this tour any time from Discover.', feature: 'finish', mock: 'finish' }],
  },
];

export const GROUP_TITLES: Record<TourGroupId, string> = {
  welcome: 'Welcome',
  plan: 'Plan',
  reflect: 'Reflect',
  grow: 'Grow',
  learn: 'Learn',
  recap: 'Recap',
  data: 'Your data',
  finish: 'Finish',
};

// Interface words. `t()` reads a translation when there is one and falls back
// to English, so a missing key never shows up blank.
export const STRINGS = {
  discoverTitle: 'Discover Ona',
  discoverLead: 'See what Ona can do, at your own pace. Nothing here changes your own data.',
  demoTitle: 'Try the demo',
  demoBody: 'Ona filled with a few weeks of sample data. It works without an account and stays completely apart from your own data.',
  demoButton: 'Open the demo',
  demoActive: "You're in the demo right now.",
  tourTitle: 'Take the tour',
  tourBody: 'A short walk through every section, about 5 minutes. Skip or jump ahead any time.',
  tourStart: 'Start the tour',
  tourResume: 'Resume the tour',
  tourReplay: 'Take it again',
  exploreTitle: 'Explore by section',
  exploreBody: 'Open the tour at the part you are curious about.',
  skip: 'Skip',
  next: 'Next',
  back: 'Back',
  done: 'Done',
  tryIt: 'Try it',
  jumpTo: 'Jump to a section',
  close: 'Close',
  finishDemo: 'Try the demo',
  finishOwn: 'Start with my own data',
  finishLater: 'Maybe later',
  slideOf: 'Slide {n} of {total}',
  seeHow: 'See how this works',
  demoOffer: 'Take a short tour?',
  demoOfferBody: 'A few slides on what each section does. You can open it later from Discover.',
  notNow: 'Not now',
  takeTour: 'Take the tour',
} as const;

export type StringKey = keyof typeof STRINGS;

// Translations, by language. Empty for now: English is the source.
export const TRANSLATIONS: Record<string, Partial<Record<StringKey, string>>> = {};

export function t(key: StringKey, vars: Record<string, string | number> = {}, lang?: string): string {
  const table = lang ? TRANSLATIONS[lang] : undefined;
  const raw = table?.[key] || STRINGS[key] || '';
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

// --- Helpers over the content ---

export const ALL_SLIDES: (Slide & { sectionId: string; group: TourGroupId })[] = TOUR.flatMap((s) => s.slides.map((sl) => ({ ...sl, sectionId: s.id, group: s.group })));

export const slideIndexOfSection = (sectionId: string): number => Math.max(0, ALL_SLIDES.findIndex((s) => s.sectionId === sectionId));

export const slideIndexOfKey = (key: string | undefined): number => (key ? Math.max(0, ALL_SLIDES.findIndex((s) => s.key === key)) : 0);

// The sections listed under "Explore by section", grouped like the app.
export const EXPLORE_GROUPS: { group: TourGroupId; sections: TourSection[] }[] = (['plan', 'reflect', 'grow', 'learn', 'recap'] as TourGroupId[]).map((group) => ({
  group,
  sections: TOUR.filter((s) => s.group === group),
}));

// Where the tour opens: a section, the last slide seen, or the start.
export function startIndex(params: { sectionId?: string; resume?: boolean } | undefined, lastSlide: string, done: boolean): number {
  if (params?.sectionId) return slideIndexOfSection(params.sectionId);
  if (params?.resume && !done) return slideIndexOfKey(lastSlide);
  return 0;
}
