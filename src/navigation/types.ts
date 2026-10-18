import type { FeelingSource, FeelingZone } from '../types/sections';
import type { SettingsParams } from '../screens/settings/pages';

// The bottom tab navigator — Home (Recap) + the 4 folders. See the Ona
// navigation restructure doc: this is the app's top-level navigation.
export type MainTabParamList = {
  home: undefined;
  planFolder: undefined;
  reflectFolder: undefined;
  growFolder: undefined;
  learnFolder: undefined;
};

// The root stack — the tab navigator as its first screen, plus every section
// and detail screen pushed on top of it (over the tab bar), reachable from
// any folder or from Recap's tap-through links.
export type RootStackParamList = {
  Main: undefined;
  // First run (fresh install, no account), and after leaving Demo mode with no account.
  welcome: { hasData?: boolean } | undefined;
  planBuilder: undefined;
  dailyPlanning: undefined;
  // The full task page. `date` is the day being planned (for a repeating task,
  // the day that was opened). No taskId = a new task; `title` prefills it.
  taskEditor: { taskId?: string; date: string; title?: string };
  planningInsights: undefined;
  journaling: undefined;
  catchAThought: undefined;
  studySession: undefined;
  dietPlanning: undefined;
  songwriting: undefined;
  mindGames: undefined;
  // `source`, when present, marks this as a quick feeling check launched from
  // inside another feature (a habit check-in, a skill practice session) —
  // the screen skips its own result/guidance detour and returns straight to
  // the caller once logged, since this is a light add-on step, not a
  // destination in itself.
  moodCheck: { source?: FeelingSource; startZone?: FeelingZone; note?: string; tags?: string[] } | undefined; // note/tags: carried over from a quick sheet's "Be more specific"
  sleep: undefined;
  book: { openEntryId?: string } | undefined;
  skills: { openSkillId?: string; openSessionId?: string } | undefined;
  habitBuilder: { openHabitId?: string; openDate?: string } | undefined;
  budget: { openBudgetId?: string } | undefined;
  quitHabit: { openHabitId?: string } | undefined;
  habitsHub: { initialMode?: 'build' | 'quit' } | undefined;
  discover: undefined;
  // Start at a section, resume where it was left, or from the beginning.
  discoverTour: { sectionId?: string; resume?: boolean } | undefined;
  journalWrite: { date: string };
  planDetail: { planId: string };
  planStepDetail: { planId: string; path: string[] };
  // One route per Settings page (pushed), so back is always one step.
  settings: SettingsParams | undefined;
  // Sign in / create account, opened from Settings → Account.
  signIn: undefined;
};
