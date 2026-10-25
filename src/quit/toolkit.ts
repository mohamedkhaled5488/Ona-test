// The craving toolkit: which tools there are, which ones a person sees for a
// given quit habit, and which one is offered first.
//
// - Categories in a fixed order; the user's own tools are "Your own".
// - Hidden tools are never offered. For gaming, gambling and scrolling, the
//   on-screen games are hidden unless the user turns them back on (a note
//   says so); nothing anywhere depends on chance.
// - Offered first: the user's if-then plan for this time of day (or for any
//   time), else their first pinned tool, else a calm default.
// - "Surprise me" is the tool not used for the longest (never random).
//
// Labels are what Analysis groups by: existing ones stay as they were.
import type { QuitCravingSession, QuitHabit, QuitHabitType, QuitIfThenPlan, QuitToolkit } from '../types/sections';

export type ToolCategory = 'body' | 'mind' | 'move' | 'think' | 'connect' | 'own';

export interface ToolDef {
  id: string;
  title: string; // on the menu
  line: string; // one plain line under it
  label: string; // in Analysis ("Riding it out")
  category: ToolCategory;
  // "Why this can help": modest, never a promise. Drafts for a clinician's
  // review before release (docs/craving-toolkit-copy-review.md).
  why?: string;
  screenGame?: boolean; // an on-screen game (hidden for screen-related habits)
  minutes?: number; // the user's own tools: an optional gentle timer
}

export const TOOL_CATEGORIES: { id: ToolCategory; title: string; icon: string }[] = [
  { id: 'body', title: 'Calm the body', icon: 'leaf-outline' },
  { id: 'mind', title: 'Absorb the mind', icon: 'extension-puzzle-outline' },
  { id: 'move', title: 'Move', icon: 'walk-outline' },
  { id: 'think', title: 'Think and choose', icon: 'bulb-outline' },
  { id: 'connect', title: 'Connect', icon: 'chatbubbles-outline' },
  { id: 'own', title: 'Your own', icon: 'star-outline' },
];

// In menu order, by category. The first four were the whole menu before
// the toolkit; their ids and labels stay as they were.
export const BUILT_IN_TOOLS: ToolDef[] = [
  // Calm the body
  { id: 'rideItOut', title: 'Breathe and ride it out', line: 'Paced breathing while the craving rises and fades.', label: 'Riding it out', category: 'body', why: 'Breathing slowly, with a longer breath out, helps many people feel calmer.' },
  { id: 'grounding', title: 'Grounding: 5-4-3-2-1', line: "Notice what's around you, one sense at a time.", label: 'Grounding', category: 'body', why: 'Naming what you can see, hear and feel can bring your attention back to right now.' },
  { id: 'bodyScan', title: 'Body scan', line: 'Move your attention slowly from head to toe.', label: 'Body scan', category: 'body', why: 'Noticing the body without trying to change it helps some people let tension ease.' },
  { id: 'muscleRelax', title: 'Tense and release', line: 'Short muscle relaxation, one area at a time.', label: 'Muscle relaxation', category: 'body', why: 'Tensing muscles and then letting go can make it easier to feel what relaxing is like.' },
  // Absorb the mind
  { id: 'countBreaths', title: 'Count ten breaths', line: 'Tap with each breath out, up to ten, then start again.', label: 'Counting breaths', category: 'mind', why: 'A small, steady task gives the mind somewhere to rest.' },
  { id: 'noticeFive', title: 'Notice five things', line: "Find five things you haven't really looked at before.", label: 'Noticing five things', category: 'mind', why: 'Looking closely at ordinary things can absorb attention for a while.' },
  { id: 'oneObject', title: 'Focus on one object', line: 'Pick something near you and really look at it.', label: 'Focusing on one object', category: 'mind', why: 'Bringing attention back to one thing, again and again, can quiet a busy mind.' },
  { id: 'mindfulMinute', title: 'A mindful minute', line: 'One quiet minute, just noticing.', label: 'A mindful minute', category: 'mind', why: 'Pausing to notice, without judging, helps some people let a moment pass.' },
  { id: 'sounds', title: 'Calm sounds', line: 'Rain, waves or soft noise. Off until you choose one.', label: 'Calm sounds', category: 'mind', why: 'Steady, gentle sound can make it easier to settle.' },
  { id: 'memoryMatch', title: 'Match pairs', line: 'A calm matching puzzle. No score, no clock.', label: 'Matching pairs', category: 'mind', screenGame: true, why: 'Many people find absorbing tasks help cravings pass.' },
  { id: 'gentleMath', title: 'Gentle sums', line: 'One easy sum at a time. No score, no clock.', label: 'Gentle sums', category: 'mind', screenGame: true, why: 'Many people find absorbing tasks help cravings pass.' },
  // Move
  { id: 'doSomethingInstead', title: 'Do something instead', line: 'A few quick, concrete things to do right now.', label: 'Doing something instead', category: 'move', why: 'Having something concrete to do can make it easier to wait the craving out.' },
  { id: 'walk', title: 'A short walk', line: 'Step out for a few minutes, at your own pace.', label: 'A short walk', category: 'move', why: 'Moving, even a little, helps many people feel an urge ease.' },
  { id: 'stretches', title: 'Gentle stretches', line: 'A few slow stretches, standing or sitting.', label: 'Stretching', category: 'move', why: 'Slow movement can help the body let go of some tension.' },
  // Think and choose
  { id: 'myReasons', title: 'My reasons', line: 'Your own reasons, and a note to your future self.', label: 'My reasons', category: 'think', why: 'Remembering why you started can help you choose what to do next.' },
  { id: 'delayIt', title: 'Delay it', line: 'Decide later: a 10-minute pause first.', label: 'Delaying it', category: 'think', why: 'Giving a craving some time often changes how strong it feels.' },
  { id: 'nameCraving', title: 'Name the craving', line: 'What are you feeling, and what set it off?', label: 'Naming the craving', category: 'think', why: 'Putting a craving into words can make it feel a little less in charge.' },
  { id: 'checkFacts', title: 'Check the facts', line: "A short guided look at what's actually true right now.", label: 'Checking the facts', category: 'think', why: 'Looking at the facts can show the craving is telling only part of the story.' },
  { id: 'urgeSurfing', title: 'Urge surfing', line: 'A short guide to riding the wave of a craving.', label: 'Urge surfing', category: 'think', why: 'Cravings usually rise, peak and fade. Watching that happen can make it easier to wait.' },
  // Connect
  { id: 'reachOut', title: 'Reach out', line: "Message or call someone. You don't have to be alone with this.", label: 'Reaching out', category: 'connect', why: 'Not being alone with a hard moment can make it easier to get through.' },
  { id: 'textFriend', title: 'Text a friend', line: 'About something unrelated: a song, a photo, a hello.', label: 'Texting a friend', category: 'connect', why: 'A small, ordinary exchange can shift attention away from the craving.' },
  { id: 'sayHi', title: 'Say hi to someone', line: 'Step outside and greet someone nearby.', label: 'Saying hi', category: 'connect', why: 'A moment of contact with someone can help a craving feel smaller.' },
];

export const DEFAULT_TOOL = 'rideItOut';

export const HABIT_TYPES: { id: QuitHabitType; label: string }[] = [
  { id: 'smoking', label: 'Smoking or vaping' },
  { id: 'alcoholDrugs', label: 'Alcohol or drugs' },
  { id: 'food', label: 'Sugar or food' },
  { id: 'caffeine', label: 'Caffeine' },
  { id: 'gaming', label: 'Gaming' },
  { id: 'gambling', label: 'Gambling' },
  { id: 'scrolling', label: 'Social media or scrolling' },
  { id: 'other', label: 'Something else' },
];

const SCREEN_HABITS: QuitHabitType[] = ['gaming', 'gambling', 'scrolling'];
// Where stopping suddenly can be medically risky: a calm note, shown once.
const SUBSTANCE_HABITS: QuitHabitType[] = ['alcoholDrugs'];

export const isScreenHabit = (habit: QuitHabit) => SCREEN_HABITS.includes(habit.habitType ?? 'other');
export const needsSubstanceNote = (habit: QuitHabit) => SUBSTANCE_HABITS.includes(habit.habitType ?? 'other');

export const EMPTY_TOOLKIT: QuitToolkit = { pinned: [], hidden: [], custom: [] };
export const toolkitOf = (habit: QuitHabit): QuitToolkit => habit.toolkit ?? EMPTY_TOOLKIT;

// Games are off for a screen-related habit, unless turned back on.
export const gamesHidden = (habit: QuitHabit) => isScreenHabit(habit) && !toolkitOf(habit).showGames;

// Every tool this habit knows about: the catalog plus the user's own.
export function allTools(habit: QuitHabit, catalog: ToolDef[] = BUILT_IN_TOOLS): ToolDef[] {
  const own = toolkitOf(habit).custom.map((c): ToolDef => ({ id: c.id, title: c.name, line: c.minutes ? `${c.minutes} min` : 'Your own', label: c.name, category: 'own', minutes: c.minutes }));
  return [...catalog, ...own];
}

export function findTool(habit: QuitHabit, id: string, catalog: ToolDef[] = BUILT_IN_TOOLS): ToolDef | undefined {
  return allTools(habit, catalog).find((t) => t.id === id);
}

// What the craving menu may offer, in category order.
export function visibleTools(habit: QuitHabit, catalog: ToolDef[] = BUILT_IN_TOOLS): ToolDef[] {
  const { hidden } = toolkitOf(habit);
  const noGames = gamesHidden(habit);
  return allTools(habit, catalog).filter((t) => !hidden.includes(t.id) && !(noGames && t.screenGame));
}

export function toolsByCategory(tools: ToolDef[]): { category: (typeof TOOL_CATEGORIES)[number]; tools: ToolDef[] }[] {
  return TOOL_CATEGORIES.map((category) => ({ category, tools: tools.filter((t) => t.category === category.id) })).filter((g) => g.tools.length > 0);
}

// "My toolkit": the pinned tools, in the user's order, that can be offered.
export function myToolkit(habit: QuitHabit, catalog: ToolDef[] = BUILT_IN_TOOLS): ToolDef[] {
  const visible = visibleTools(habit, catalog);
  return toolkitOf(habit).pinned.map((id) => visible.find((t) => t.id === id)).filter((t): t is ToolDef => !!t);
}

export type TimeOfDay = NonNullable<QuitIfThenPlan['timeOfDay']>;
export const TIMES_OF_DAY: { id: TimeOfDay; label: string }[] = [
  { id: 'morning', label: 'Morning' },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'evening', label: 'Evening' },
  { id: 'night', label: 'Night' },
];

// By the phone's local clock: morning 5–12, afternoon 12–17, evening 17–22,
// night 22–5.
export function timeOfDayOf(at: Date): TimeOfDay {
  const h = at.getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 22) return 'evening';
  return 'night';
}

export type Suggestion = { source: 'plan'; plan: QuitIfThenPlan; tool: ToolDef } | { source: 'pinned' | 'default'; tool: ToolDef };

export function suggestionFor(habit: QuitHabit, at: Date, catalog: ToolDef[] = BUILT_IN_TOOLS): Suggestion | undefined {
  const visible = visibleTools(habit, catalog);
  const usable = (habit.plans ?? []).map((plan) => ({ plan, tool: visible.find((t) => t.id === plan.toolId) })).filter((p): p is { plan: QuitIfThenPlan; tool: ToolDef } => !!p.tool);
  const now = timeOfDayOf(at);
  const plan = usable.find((p) => p.plan.timeOfDay === now) ?? usable.find((p) => !p.plan.timeOfDay);
  if (plan) return { source: 'plan', ...plan };
  const pinned = myToolkit(habit, catalog)[0];
  if (pinned) return { source: 'pinned', tool: pinned };
  const fallback = visible.find((t) => t.id === DEFAULT_TOOL) ?? visible[0];
  return fallback && { source: 'default', tool: fallback };
}

// "Surprise me": of the tools not tried in this craving, the one this habit
// hasn't used for the longest (never used counts as longest; ties go by
// menu order). The same answer every time for the same history.
export function surpriseFor(habit: QuitHabit, sessions: QuitCravingSession[], current: QuitCravingSession | undefined, catalog: ToolDef[] = BUILT_IN_TOOLS): ToolDef | undefined {
  const visible = visibleTools(habit, catalog);
  const tried = new Set(current?.tools.map((t) => t.toolId) ?? []);
  const candidates = visible.filter((t) => !tried.has(t.id));
  const pool = candidates.length ? candidates : visible;
  const lastUsed = new Map<string, string>();
  for (const s of sessions) {
    if (s.quitHabitId !== habit.id) continue;
    for (const t of s.tools) if ((lastUsed.get(t.toolId) ?? '') < t.startedAt) lastUsed.set(t.toolId, t.startedAt);
  }
  let best: ToolDef | undefined;
  for (const t of pool) if (!best || (lastUsed.get(t.id) ?? '') < (lastUsed.get(best.id) ?? '')) best = t;
  return best;
}

export const TOOLKIT_COPY = {
  title: 'My toolkit',
  entryLine: 'Your tools and plans for hard moments',
  offerTitle: 'Build your toolkit for hard moments?',
  offerLine: "A calm moment is a good time to choose what you'd like to reach for. You can skip this.",
  offerYes: 'Set it up',
  offerNo: 'Not now',
  typeHeading: 'What are you quitting? (optional)',
  plansHeading: 'If-then plans',
  plansLine: 'When a craving comes at a time you name, your plan is offered first.',
  planWhen: 'When…',
  planWhenPlaceholder: "e.g. it's evening and I'm bored",
  planTime: 'At what time? (optional)',
  anyTime: 'Any time',
  planThen: 'I will…',
  addPlan: 'Add this plan',
  plan: (when: string, tool: string) => `When ${when}, I will: ${tool}`,
  mineHeading: 'My toolkit',
  mineLine: 'Pinned tools come first in a craving. Use the arrows to change the order.',
  mineEmpty: 'Nothing pinned yet. Pin tools from the list below.',
  allHeading: 'All tools',
  allLine: 'Hide any you would rather not be offered.',
  ownHeading: 'Add your own',
  ownName: 'What helps you?',
  ownNamePlaceholder: 'e.g. play guitar, make tea',
  ownMinutes: 'With a gentle timer? (optional)',
  noTimer: 'No timer',
  addOwn: 'Add to my toolkit',
  pin: (t: string) => `Pin ${t}`,
  unpin: (t: string) => `Unpin ${t}`,
  hide: (t: string) => `Hide ${t}`,
  show: (t: string) => `Show ${t}`,
  up: (t: string) => `Move ${t} up`,
  down: (t: string) => `Move ${t} down`,
  remove: (t: string) => `Remove ${t}`,
  keepOne: 'Keep at least one tool, so there is always something to reach for.',
  removeOwnTitle: (t: string) => `Remove "${t}"?`,
  removeOwnMessage: 'It comes off your toolkit, and any plan that uses it goes too.',
  gamesNote: "Games are hidden for this habit, since they're on a screen. Breathing, moving, sounds and writing come first.",
  showGames: 'Show games anyway',
  gamesHiddenInMenu: 'Games are hidden for this habit. You can change that in My toolkit.',
  substanceNote: "If you've been using heavily, talk to a doctor before stopping suddenly.",
  substanceTitle: 'A calm note',
  suggestPlan: 'Your plan',
  suggestPinned: 'From your toolkit',
  suggestDefault: 'A calm place to start',
  surprise: 'Surprise me',
  surpriseLine: "Something you haven't tried in a while",
  seeAll: 'See all options',
  ownTimerCaption: 'Take your time',
  ownTimerDone: "Time's up, whenever you're ready",
};
