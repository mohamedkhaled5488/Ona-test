// Essentials mode and Plus, in one place. Everything that describes or enforces the
// plans reads from here: Settings → Plan & usage (comparison and usage), the
// plans sheet, the Plus explanations on locked features, the Discover tour's
// plan slide, the store description text (planDescriptionText), and the code
// that enforces each cap or feature (usePlus, canCreate). plansConfig.test.ts
// checks that every feature here is enforced in code and appears everywhere.
//
// Rules (design philosophy):
// - Nothing you made is ever hidden, locked or deleted. Limits are only on
//   creating more or going deeper; over a cap, what you have stays usable.
// - Quit, crisis and support resources, and basic export are never limited.
// - Prices and periods come from the store; no price or percentage here.
// - The trial is the full Plus experience for TRIAL_DAYS days, no card.

export const TRIAL_DAYS = 30;

// The names, everywhere (Plan & usage, the plans sheet, banners, locked
// features, the tour, notifications, store text). planNaming.test.ts fails
// if any surface uses another name, or "free version", "expired",
// "downgrade" or "limited".
export const PLUS_NAME = 'Plus'; // the full mode
export const TRIAL_NAME = 'Plus trial';
export const ESSENTIALS_NAME = 'Essentials mode'; // after the trial, without Plus

// The one sentence for each, as the person sees it.
export const STATE_COPY = {
  trial: (daysLeft: number) => `${TRIAL_NAME}, ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left. All features on.`,
  essentials: `${ESSENTIALS_NAME}. Your data is safe on this phone.`,
  plus: `${PLUS_NAME}.`,
};

// --- Caps: how many you can create in Essentials mode -------------------------
export type CapId = 'activePlans' | 'buildHabits' | 'skills' | 'activeBooks' | 'budgets' | 'taskTemplates' | 'dietWeeksAhead';

export const FREE_CAPS: Record<CapId, number> = {
  activePlans: 3,
  buildHabits: 3,
  skills: 2,
  activeBooks: 3,
  budgets: 1,
  taskTemplates: 3,
  dietWeeksAhead: 1, // plan up to next week; past weeks stay visible and editable
};

export const CAP_LABELS: Record<CapId, string> = {
  activePlans: 'Active plans',
  buildHabits: 'Active habits',
  skills: 'Tracked skills',
  activeBooks: 'Books you\'re reading or want to read',
  budgets: 'Budgets',
  taskTemplates: 'Task templates',
  dietWeeksAhead: 'Meal planning',
};

// --- Plus features: going deeper (everything else is in Essentials mode) ----
export type PlusFeatureId =
  | 'sync'
  | 'recapInsights'
  | 'recapStory'
  | 'recapTimeChart'
  | 'recapCustomRange'
  | 'feelingsCompare'
  | 'feelingsPatterns'
  | 'planningInsights'
  | 'journalOnThisDay'
  | 'habitAnalysisFull'
  | 'quitAnalysisFull'
  | 'skillJourney'
  | 'pdfExports'
  | 'sleepAllSounds'
  | 'bookResurfacing';

export interface PlusFeature {
  id: PlusFeatureId;
  title: string; // shown on a locked card
  line: string; // one honest line under it
}

export const PLUS_FEATURES: Record<PlusFeatureId, PlusFeature> = {
  sync: { id: 'sync', title: 'Sync across devices', line: 'Your data on all your phones. Getting your own data back is always included.' },
  recapInsights: { id: 'recapInsights', title: 'Cross-section insights', line: 'What showed up together across sections, with the counts.' },
  recapStory: { id: 'recapStory', title: 'Shareable story', line: 'Your week or month as a story you can share.' },
  recapTimeChart: { id: 'recapTimeChart', title: 'Time-invested chart', line: 'Where your time went, day by day.' },
  recapCustomRange: { id: 'recapCustomRange', title: 'Custom ranges', line: 'Recap any stretch of days you choose.' },
  feelingsCompare: { id: 'feelingsCompare', title: 'Compare periods', line: 'Lay two periods of your feelings side by side.' },
  feelingsPatterns: { id: 'feelingsPatterns', title: 'Pattern cards', line: 'Which tags showed up with which feelings, with the counts.' },
  planningInsights: { id: 'planningInsights', title: 'Planning insights', line: 'Estimates, energy and tags across your days.' },
  journalOnThisDay: { id: 'journalOnThisDay', title: 'On this day', line: 'What you wrote on this date in earlier years.' },
  habitAnalysisFull: { id: 'habitAnalysisFull', title: 'Full habit analysis', line: 'Time of day, patterns and feelings after.' },
  quitAnalysisFull: { id: 'quitAnalysisFull', title: 'Full journey analysis', line: 'Triggers and timing across your journey.' },
  skillJourney: { id: 'skillJourney', title: 'Skill journey', line: 'First vs. latest, plateaus and your whole progress.' },
  pdfExports: { id: 'pdfExports', title: 'PDF exports', line: `Habits, skills, books and budgets as PDFs. Your data export is in ${ESSENTIALS_NAME} too.` },
  sleepAllSounds: { id: 'sleepAllSounds', title: 'All sleep sounds', line: `Every sound and mix. ${ESSENTIALS_NAME} has the first three.` },
  bookResurfacing: { id: 'bookResurfacing', title: 'Quote resurfacing', line: 'Your saved quotes, brought back now and then.' },
};

// Sleep sounds on Free: the first N of data/sleepSounds.ts.
export const FREE_SLEEP_SOUNDS = 3;

// --- The comparison: one table, in this order, everywhere -------------------
export interface ComparisonRow {
  feature: string;
  free: string; // the Essentials mode column
  plus: string;
  // What makes this row true in code (checked by plansConfig.test.ts).
  enforces: { cap?: CapId; plus?: PlusFeatureId[] };
}

export const PLAN_COMPARISON: ComparisonRow[] = [
  { feature: 'Every section, on this phone', free: 'Yes', plus: 'Yes', enforces: {} },
  { feature: 'Sync across devices', free: 'No (getting your data back is always included)', plus: 'Yes', enforces: { plus: ['sync'] } },
  { feature: 'Home (Recap)', free: 'All your totals, full history', plus: 'Cross-section insights, shareable story, time-invested chart, custom ranges', enforces: { plus: ['recapInsights', 'recapStory', 'recapTimeChart', 'recapCustomRange'] } },
  { feature: 'Identify the Feeling', free: 'Wheel, guidance, log and graph (full history), basic analysis', plus: 'Compare periods, pattern cards', enforces: { plus: ['feelingsCompare', 'feelingsPatterns'] } },
  { feature: 'Plan Builder', free: `Up to ${FREE_CAPS.activePlans} active plans (archived don't count)`, plus: 'Unlimited', enforces: { cap: 'activePlans' } },
  { feature: 'Daily Planning', free: `Tasks, tags, reminders, up to ${FREE_CAPS.taskTemplates} templates`, plus: 'Planning insights, unlimited templates', enforces: { cap: 'taskTemplates', plus: ['planningInsights'] } },
  { feature: 'Journaling', free: 'Unlimited entries', plus: 'On this day', enforces: { plus: ['journalOnThisDay'] } },
  { feature: 'Habits', free: `Up to ${FREE_CAPS.buildHabits} active habits, basic analysis`, plus: 'Unlimited, full analysis', enforces: { cap: 'buildHabits', plus: ['habitAnalysisFull'] } },
  { feature: 'Quit a Habit', free: 'Unlimited, with the journey and urge tools', plus: 'Full journey analysis', enforces: { plus: ['quitAnalysisFull'] } },
  { feature: 'Skills', free: `Up to ${FREE_CAPS.skills} skills, sessions and gallery`, plus: 'Unlimited, skill journey', enforces: { cap: 'skills', plus: ['skillJourney'] } },
  { feature: 'Sleep', free: `Wind-down, sleep log, ${FREE_SLEEP_SOUNDS} sounds`, plus: 'All sounds and mixes', enforces: { plus: ['sleepAllSounds'] } },
  { feature: 'Book', free: `Up to ${FREE_CAPS.activeBooks} books at a time, quotes`, plus: 'Unlimited, quote resurfacing', enforces: { cap: 'activeBooks', plus: ['bookResurfacing'] } },
  { feature: 'Budget', free: `${FREE_CAPS.budgets} budget, full history`, plus: 'Multiple budgets', enforces: { cap: 'budgets' } },
  { feature: 'Diet', free: 'Plan up to next week (past weeks stay)', plus: 'Plan further ahead', enforces: { cap: 'dietWeeksAhead' } },
  { feature: 'Export', free: 'Your data (JSON/CSV), always', plus: 'PDF exports', enforces: { plus: ['pdfExports'] } },
  { feature: 'Study, Songwriting, Mind Games, Catch a Thought', free: 'Everything', plus: 'Everything', enforces: {} },
  { feature: 'Support and crisis resources', free: 'Always', plus: 'Always', enforces: {} },
];

// For the App Store / Play listing and the terms: generated, never typed twice.
export function planDescriptionText(): string {
  const lines = PLAN_COMPARISON.map((r) => `- ${r.feature}: ${ESSENTIALS_NAME}: ${r.free}. ${PLUS_NAME}: ${r.plus}.`);
  return [
    `Every section of Ona works on your phone at no cost, in ${ESSENTIALS_NAME}. ${PLUS_NAME} adds sync and deeper insight. Start with a ${TRIAL_DAYS}-day ${TRIAL_NAME}, no card needed. When it ends, you keep everything you made, in ${ESSENTIALS_NAME}.`,
    ...lines,
  ].join('\n');
}

export const PLAY_SUBSCRIPTIONS_URL = 'https://play.google.com/store/account/subscriptions';
