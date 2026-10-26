export type SectionId =
  | 'planBuilder'
  | 'dailyPlanning'
  | 'journaling'
  | 'catchAThought'
  | 'studySession'
  | 'dietPlanning'
  | 'songwriting'
  | 'book'
  | 'mindGames'
  | 'moodCheck'
  | 'sleep'
  | 'recap'
  | 'skills'
  | 'habitBuilder'
  | 'budget'
  | 'quitHabit';

export interface SectionMeta {
  id: SectionId;
  title: string;
  tagline: string;
  icon: keyof typeof import('@expo/vector-icons/Ionicons').default.glyphMap;
}

// --- Navigation folders (see the Ona navigation restructure doc) ---
export type FolderId = 'plan' | 'reflect' | 'grow' | 'learn';

// --- Plan Builder ---
export interface PlanAlternative {
  id: string;
  label: string;
}

export type PlanPriority = 'high' | 'medium' | 'low';

export interface PlanAttachment {
  id: string;
  label: string; // free-text reference — a link, a file name, a note of where to find something
}

export interface PlanStep {
  id: string;
  title: string;
  notes?: string;
  color?: string;
  done?: boolean;
  priority?: PlanPriority;
  dueDate?: string; // ISO date, independent of any Daily Planning link
  resources?: string;
  risks?: string;
  timeEstimate?: string;
  attachments: PlanAttachment[];
  alternatives: PlanAlternative[];
  subSteps: PlanStep[];
}

export interface PlanReflection {
  worked: string;
  differently: string;
}

export interface Plan {
  id: string;
  title: string; // what the plan actually is — asked for first when creating a plan
  motive: string; // why — asked for second
  steps: PlanStep[];
  status: 'active' | 'archived';
  color: string;
  tags: string[];
  createdAt: string; // ISO date
  reviewIntervalDays?: number; // stubbed — no real notification is scheduled yet
  reflection?: PlanReflection;
}

// --- Daily Planning ---
export interface DailyTaskLink {
  planId: string;
  path: string[]; // chain of step ids within that plan
}

export interface DailySubtask {
  id: string;
  title: string;
  done: boolean;
}

// 'weekdays' = Monday to Friday; 'customDays' uses repeatDays; 'monthly' falls
// on the start date's day of the month (the last day in shorter months).
export type TaskRepeat = 'none' | 'daily' | 'weekly' | 'weekdays' | 'customDays' | 'monthly';

// 'default' = the system's default notification sound (no bundled file needed).
// The rest are short bundled tones — see src/data/alarmSounds.ts.
export type AlarmSoundId = 'default' | 'chime' | 'ping' | 'ascend';

// The rating from before v2 ("Went well / Okay / Was hard"). Still read, no
// longer offered; v2 asks how it went against what was expected.
export type TaskEvaluation = 'well' | 'okay' | 'hard';
export type TaskDifficulty = 'easier' | 'asExpected' | 'harder';

export interface TaskCompletionNote {
  comment?: string;
  evaluation?: TaskEvaluation;
  difficulty?: TaskDifficulty;
}

export type TaskPriority = 'none' | 'low' | 'medium' | 'high';
export type TaskEnergy = 'low' | 'medium' | 'high';

export interface TaskReminder {
  id: string;
  minutesBefore: number; // 0 = at the start time
  sound?: AlarmSoundId; // undefined = the default alarm sound from Settings
}

// Photos stay on this phone (the uri is a local file); links are plain URLs.
export interface TaskAttachment {
  id: string;
  kind: 'photo' | 'link';
  uri: string;
  label?: string;
}

// Feeling log entries linked to one occurrence of a task.
export interface TaskFeelingLink {
  before?: string; // feelings entry id, logged on "Start"
  after?: string; // feelings entry id, logged on completing
}

export interface TaskTag {
  id: string;
  name: string;
  color: string;
  createdAt: string; // ISO datetime
}

export interface DailyTask {
  id: string;
  date: string; // ISO date — for a repeating task, the date of its first occurrence
  title: string; // ignored when linkedPlan is set — the title lives on the Plan Builder step
  done: boolean; // ignored when linkedPlan is set, and when repeat !== 'none' (see completedDates)
  scheduledTime?: string; // HH:MM — where this task sits in the timeline, and what a reminder is relative to
  durationMinutes?: number; // the end time is scheduledTime + this
  allDay?: boolean;
  reminders: TaskReminder[]; // each relative to scheduledTime; none without a time
  notificationIds: string[]; // scheduled local notification ids, so they can be cancelled (this phone only)
  completionNotes: Record<string, TaskCompletionNote>; // ISO date -> note left when that occurrence was completed
  completedAt: Record<string, string>; // ISO date -> ISO datetime the occurrence was ticked off
  linkedPlan?: DailyTaskLink;
  subtasks: DailySubtask[];
  repeat: TaskRepeat;
  repeatDays?: number[]; // 'customDays': JS weekdays, 0 = Sunday
  repeatUntil?: string; // ISO date of the last possible occurrence (set when a series is split)
  seriesId?: string; // tasks split from one repeating series share this
  completedDates: string[]; // ISO dates on which a repeating task's occurrence was completed
  skippedDates: string[]; // ISO dates a repeating task's occurrence was moved away from
  letGoDates: string[]; // ISO dates the user chose to let go of (archived, never a failure)
  order: number; // manual ordering within a day
  notes?: string;
  tagIds: string[];
  priority: TaskPriority;
  energy?: TaskEnergy;
  estimateMinutes?: number;
  actualMinutes: Record<string, number>; // ISO date -> minutes timed for that occurrence
  context?: string; // "at home", "phone call"
  why?: string; // one line; prefilled from a plan's motive
  attachments: TaskAttachment[];
  feelingLinks: Record<string, TaskFeelingLink>; // ISO date -> linked feelings entries
  moveCount: number; // times moved to another day (carry-over insight)
  fromTemplateId?: string;
  createdAt?: string; // ISO datetime; missing on tasks from before v2
  running?: { date: string; startedAt: string }; // "Start" pressed and not stopped yet
}

// Everything a task template keeps: the task without its dates and history.
export interface TaskTemplateFields {
  title: string;
  notes?: string;
  durationMinutes?: number;
  tagIds: string[];
  priority: TaskPriority;
  energy?: TaskEnergy;
  estimateMinutes?: number;
  context?: string;
  why?: string;
  subtaskTitles: string[];
  reminders: Omit<TaskReminder, 'id'>[];
}

export interface TaskTemplate {
  id: string;
  name: string;
  fields: TaskTemplateFields;
  createdAt: string;
}

export interface DayTemplate {
  id: string;
  name: string;
  taskTitles: string[];
}

// --- Journaling ---
// Feeling colors are shared with Identify the Feeling's Feelings Wheel — see
// src/data/feelingsWheel.ts's zoneColors, keyed by this same FeelingZone
// type. One vocabulary for "what color/name means what" across both sections.
export type JournalBackground = 'ink' | 'paper' | 'sepia' | 'midnight' | 'forest';
export type JournalFont = 'grotesk' | 'inter' | 'serif' | 'mono' | 'caveat' | 'patrickHand';
export type JournalPageTemplate = 'blank' | 'lined' | 'grid' | 'dots' | 'margin';
export type JournalTextSize = 'small' | 'medium' | 'large' | 'xlarge';

// Font is deliberately not part of the shared page style — it's saved per
// entry instead (see JournalEntry.font) so an entry always displays in the
// font it was actually written in.
export interface JournalPageStyle {
  background: JournalBackground;
  size: JournalTextSize;
  template: JournalPageTemplate;
}

export interface JournalEntry {
  id: string;
  date: string;
  // The one-tap color/name (see zoneColors), optional: a new entry starts
  // with none ("How did today feel? (optional)"); older entries always had one.
  zone?: FeelingZone;
  preciseFeelingId?: string; // set via "Be more specific" (the Feelings Wheel) — a Feeling.id within `zone`
  text: string;
  tags: string[];
  font?: JournalFont; // the font this entry was written in; undefined = the current default
  // Whether the person chose the colour or the specific feeling (a new entry
  // starts on Calm, and an idea moved here from Catch a Thought gets the
  // neutral colour): only a chosen feeling goes into the Feelings log.
  // Unset on entries saved before this existed (feelings/fromSections.ts).
  feelingChosen?: boolean;
  // Its feeling was deleted from the Feelings log: not added back unless a
  // colour is chosen again.
  feelingRemoved?: boolean;
  conflictCopyOf?: string; // set by sync: this is the other phone's version (sync/engine.ts)
}

// --- Catch a Feeling or Idea ---
export type ThoughtKind = 'idea' | 'feeling' | 'random';

export interface CapturedThought {
  id: string;
  createdAt: string;
  kind: ThoughtKind;
  text: string;
  promotedTo?: 'plan' | 'journal';
}

// --- Study Session ---
export type AmbientSound = 'none' | 'white-noise' | 'rain';

export interface StudyComment {
  id: string;
  text: string;
  createdAt: string; // ISO datetime
  editedAt?: string;
}

export interface StudySession {
  id: string;
  date: string;
  subject?: string;
  focusMinutes: number; // actual elapsed focus time, not the planned duration
  breakMinutes: number;
  appBlockingEnabled: boolean;
  ambientSound: AmbientSound;
  notes?: string; // the post-session note — the first entry on the detail page
  startedAt?: string; // ISO datetime
  endedAt?: string; // ISO datetime
  presetLabel?: string; // "Classic 25/5", "Deep Work 50/10", "Custom 45/15"
  cyclesCompleted?: number;
  comments?: StudyComment[]; // added later from the detail page, each timestamped
}

// --- Diet Planning ---
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type MealSource = 'home-cooked' | 'restaurant' | 'delivery' | 'grocery';

export interface PlannedMeal {
  id: string;
  date: string;
  slot: MealSlot;
  name: string;
  cost?: number;
  source?: MealSource;
  notes?: string;
  tags: string[];
}

// A reusable template — not tied to any specific day
export interface FavoriteMeal {
  id: string;
  name: string;
  cost?: number;
  source?: MealSource;
  notes?: string;
  tags: string[];
}

export interface GroceryItem {
  id: string;
  label: string;
  checked: boolean;
}

// --- Songwriting ---
export interface SongType {
  id: string;
  name: string;
  structure: string[];
  tips: string[];
  partTips: Record<string, string>; // keyed by base part name, e.g. "Verse", "Chorus", "Bridge"
}

export interface SongSection {
  id: string;
  label: string;
  text: string;
}

export interface SongVersion {
  id: string;
  savedAt: string;
  label?: string;
  sections: SongSection[];
}

export type SongStatus = 'in-progress' | 'finished';

export interface Song {
  id: string;
  title: string;
  songTypeId: string;
  status: SongStatus;
  sections: SongSection[];
  versions: SongVersion[];
  inspiration: string[];
  collaborator?: string;
  hasVoiceMemo: boolean;
  createdAt: string;
  updatedAt: string;
}

// --- Book ---
// Scoped to capturing and organizing what the user is reading — manual entry
// only, no discovery/recommendation API. See the Ona navigation restructure
// doc: the earlier Google Books-backed "Book Recommendations" section (search
// by category, book detail/synopsis) is removed entirely.
export interface Book {
  id: string;
  title: string;
  authors: string[];
}

export type ReadingStatus = 'want' | 'reading' | 'finished';

export interface ReadingListEntry {
  id: string;
  bookId: string;
  status: ReadingStatus;
  progressPercent?: number; // meaningful while status === 'reading'
  rating?: number; // 1-5, the user's own rating once finished
  notes?: string;
  book: Book;
  addedAt: string;
  updatedAt: string;
  customCoverUri?: string; // a user-picked cover photo
  totalPages?: number; // optional; progress shows in pages once this is set
  currentPage?: number; // the last page the reader said they reached
}

// A saved passage inside one book's folder — either typed directly or
// captured from a photo (optionally OCR'd, see src/utils/ocr.ts).
export interface Quote {
  id: string;
  entryId: string; // the ReadingListEntry this quote's folder belongs to
  text: string; // empty is valid for a plain image-only bookmark
  pageNumber?: number;
  note?: string; // "why this resonated" — separate from the quote text itself
  photoUri?: string; // local URI of the captured page photo, if any
  favorite: boolean;
  createdAt: string; // ISO datetime
}

// A single optional, lightweight reading session — mirrors Study Session at
// a much lighter touch. Entirely optional; the section works without it.
export interface ReadingSession {
  id: string;
  entryId: string;
  date: string; // ISO date
  minutes: number;
  pagesRead?: number;
  startPage?: number;
  endPage?: number;
}

// --- Mind Games ---
export type GameId = 'memory' | 'reaction' | 'math' | 'word';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface GameResult {
  id: string;
  gameId: GameId;
  difficulty: Difficulty;
  score: number; // meaning depends on the game — see gameMeta's `betterWhen`/`unit`
  playedAt: string; // ISO datetime
}

// --- Identify the Feeling v2 (zone-first) ---
// Supersedes the old Family -> Cluster -> Precise-feeling wheel. Every
// feeling now sits in one of 5 zones (the circumplex model of affect:
// energy x pleasantness, plus a first-class "nothing in particular" zone),
// ordered mild -> strong within its zone. See src/data/feelingsWheel.ts.
export type FeelingZone = 'lively' | 'calm' | 'tense' | 'low' | 'okay';

export interface Feeling {
  id: string; // slug, stable across the old wheel and this one where the word already existed
  name: string;
  zone: FeelingZone;
  order: number; // position within the zone, mild -> strong
  definition: string;
  guidance: string[]; // 2-3 science-grounded bullets; parentheticals name the concept
  heavy?: boolean; // guidance already includes a "talk to someone" note for these
}

// A word the user typed themselves ("Something else? Write your own word") —
// saved so it reappears in their own list from then on. No canned
// definition/guidance; the result screen gives it a generic supportive one.
export interface PersonalFeeling {
  id: string;
  name: string;
  zone: FeelingZone;
  createdAt: string;
}

// Marks a feeling check-in that was launched from inside another feature
// (a habit's "how did that feel?" step, a skill's post-practice check) rather
// than from Identify the Feeling directly — lets each feature's own Analysis
// partition filter the shared feelings log down to just its own entries and
// reuse all of feelingsStats.ts unchanged, instead of duplicating that logic.
// Every place outside Identify the Feeling that a feeling can be logged
// from. One list, so tests can check every source (feelingSourcesContract).
export const FEELING_SOURCE_KINDS = ['habit', 'quitHabit', 'skill', 'study', 'task', 'book', 'journal'] as const;

export interface FeelingSource {
  kind: (typeof FEELING_SOURCE_KINDS)[number];
  refId: string; // the habit/skill id this feeling was logged against
  // Tasks: which day of the task, and whether it was felt before starting or after finishing.
  date?: string;
  phase?: 'before' | 'after';
  // Quit: the urge or slip entry (QuitFeelingEntry) this feeling belongs to.
  linkId?: string;
  // Quit, when there's no entry yet: the track to add one to, and whether it's a slip.
  trackId?: string;
  slip?: boolean;
}

export interface FeelingCheckIn {
  id: string;
  zone: FeelingZone;
  feelingIds: string[]; // 1 or 2 — feelings blend (Geneva Emotion Wheel); ids into `feelings` or the user's PersonalFeeling list
  // Keyed by feelingId — each feeling in a blend gets its own rating (v3 fix;
  // v2 only rated the second feeling). Optional per feeling; the whole step
  // is still skippable.
  intensities?: Partial<Record<string, 1 | 2 | 3 | 4 | 5>>;
  reasonTags?: string[]; // from reasonTagOptions — what's contributing, optional, multi-select
  note?: string; // optional one-line "why"
  date: string; // ISO date
  createdAt: string; // ISO datetime
  source?: FeelingSource;
}

// --- Sleep ---
// White/pink/brown are generated WAV loops (scripts/generate-noise-assets.js)
// — no licensing concerns. Rain/ocean/forest/fan are real recordings. All are
// bundled under assets/sounds — see assets/sounds/SOURCES.md.
export type SleepSoundId = 'white-noise' | 'brown-noise' | 'pink-noise' | 'rain' | 'ocean-waves' | 'forest' | 'fan-hum';

export interface SleepSound {
  id: SleepSoundId;
  label: string;
  description: string;
}

// One layer in the active mix — a sound plus its own independent volume.
export interface SleepMixLayer {
  soundId: SleepSoundId;
  volume: number; // 0-1
}

export interface WindDownItem {
  id: string;
  label: string;
  done: boolean; // resets nightly — see useSleepStore.resetWindDownForTonight
}

export interface SleepLogEntry {
  id: string;
  date: string; // ISO date — the night this log refers to
  quality: 1 | 2 | 3 | 4 | 5;
  note?: string;
  createdAt: string; // ISO datetime
}

// --- Recap ---
// Recap owns exactly this — everything else it shows is read live from other
// sections' stores. See src/utils/recap.ts for the read-only aggregation.
export interface BestMoment {
  date: string; // ISO date, one per day
  sourceSection: SectionId;
  label: string; // a short description of what the moment was, captured at tag-time
  refId?: string; // the underlying entry's id, for the tap-through link
}

// --- Skills (practice tracking) ---
// Purely to lightly tailor session-note prompts — never a rigid requirement.
export type SkillType = 'music' | 'language' | 'art' | 'sport' | 'craft' | 'other';

// A capability milestone ("Play my first full song"), not a streak one.
export interface SkillMilestone {
  id: string;
  text: string;
  achieved: boolean;
  targetDate?: string; // ISO date, optional
  achievedAt?: string; // ISO date, recorded when marked achieved
  reflection?: string;
  proofPhotoUri?: string;
}

// Self-assessed overall level. Only ever changed by the user (the app may
// ask "does this change your level?" after a milestone, never decide).
export type SkillLevel = 'starting' | 'some' | 'intermediate' | 'advanced';

export interface SkillLevelChange {
  id: string;
  date: string; // ISO date
  from?: SkillLevel;
  to: SkillLevel;
  afterMilestoneId?: string;
}

// A component of the skill (Guitar: chords, strumming, fingerpicking).
// Archiving hides it from new sessions but never touches past ones.
export interface SubSkill {
  id: string;
  name: string;
  level: 1 | 2 | 3 | 4 | 5; // self-rated, updatable any time
  createdAt: string;
  archivedAt?: string;
}

// A user-defined measurement ("typing speed, WPM, higher is better").
// Changing a definition archives the old metric and starts a new one, so past
// values are never overwritten or lost.
export interface SkillMetric {
  id: string;
  name: string;
  unit: string;
  direction: 'higher' | 'lower';
  role: 'primary' | 'extra'; // one primary, up to two extras
  createdAt: string;
  archivedAt?: string;
  selfRating?: boolean; // the "overall self-rating, 1–10" fallback
}

export type SkillResourceType = 'course' | 'book' | 'tutor' | 'video' | 'app' | 'other';
export type SkillResourceStatus = 'notStarted' | 'inProgress' | 'done';

export interface SkillResource {
  id: string;
  name: string;
  type: SkillResourceType;
  linkOrNote?: string;
  status: SkillResourceStatus;
  doneAt?: string; // ISO date, set when marked done
  createdAt: string;
}

export interface Skill {
  id: string;
  name: string;
  color: string;
  icon: keyof typeof import('@expo/vector-icons/Ionicons').default.glyphMap;
  type?: SkillType;
  startDate: string; // ISO date — "practicing since"
  milestones: SkillMilestone[];
  reminderTime?: string; // HH:MM
  reminderEnabled: boolean;
  reminderNotificationIds: string[];
  // --- Progression (all optional — a skill with just a name still works) ---
  startingLevel?: SkillLevel;
  currentLevel?: SkillLevel;
  levelHistory?: SkillLevelChange[];
  goal?: string;
  goalTargetDate?: string;
  subSkills?: SubSkill[];
  metrics?: SkillMetric[]; // includes archived ones
  weeklyGoalMinutes?: number; // soft — no penalty, no red state
  resources?: SkillResource[];
  archivedAt?: string; // archived skills stay fully viewable
}

export type SessionDifficulty = 'tooEasy' | 'justRight' | 'challenging' | 'tooHard';
export type FeedbackSource = 'teacher' | 'peer' | 'self' | 'other';

export interface PracticeSession {
  id: string;
  skillId: string;
  // ISO date the session is attributed to: the local date it *started*, so a
  // session running past midnight counts (minutes and all) toward its start
  // day and that day's week.
  date: string;
  minutes: number; // 0 if the optional timer wasn't used
  notes?: string;
  photoUri?: string;
  hasVoiceMemo: boolean; // capture is stubbed — see the same pattern in Catch a Feeling or Idea
  tag?: string;
  createdAt: string; // ISO datetime
  startedAt?: string; // ISO datetime, when the timer was started
  // --- "Add details" (all optional) ---
  focusSubSkillIds?: string[];
  difficulty?: SessionDifficulty;
  metricValues?: Record<string, number>; // metricId -> value
  struggledSubSkillIds?: string[];
  struggledText?: string;
  breakthrough?: boolean;
  feedback?: { from: FeedbackSource; text: string };
}

// --- Habit Builder ---
export type GraduationChoice = 'maintenance' | 'formed' | 'extended';

export interface Habit {
  id: string;
  name: string;
  cueRoutine?: string; // "After I ___" — the habit-stacking trigger
  identity?: string; // "This habit is part of becoming someone who ___"
  minimumVersion?: string; // tiny fallback version for hard days
  why?: string; // the user's own reason, resurfaced later
  targetDays: number; // 21 / 30 / 66 / custom
  createdAt: string; // ISO date — the start date
  reminderTime?: string; // HH:MM, at the cue time
  reminderEnabled: boolean;
  reminderNotificationIds: string[];
  graduatedAt?: string; // ISO date, set once the target is reached and a choice is made
  graduationChoice?: GraduationChoice;
  graduationReflection?: string; // written when marked "formed"
  frequency?: HabitFrequency; // undefined = every day
  pairedQuitHabitId?: string; // set when created as the "do this instead" for a Quit habit
  archivedAt?: string; // ISO date — set aside (from the long-gap re-entry screen), history kept
  // When the user last dealt with a long gap ("resume as-is" / adjusted), so
  // the re-entry screen doesn't reappear until there's a fresh gap.
  reentryAcknowledgedAt?: string;
  lastReviewedAt?: string; // ISO date of the last periodic "how's it going?" review
}

// How often a Build habit is meant to happen. Streaks, the calendar and the
// Analysis rates all count against this, not against every calendar day.
export type HabitFrequency =
  | { kind: 'daily' }
  | { kind: 'weekdays'; days: number[] } // 0 = Sunday … 6 = Saturday
  | { kind: 'perWeek'; count: number }; // any days, this many times per week

export interface HabitCheckIn {
  id: string;
  habitId: string;
  date: string; // ISO date, one check-in per habit per date
  done: boolean; // true = Done, false = Missed
  note?: string;
  photoUri?: string;
  // Reusing the same reasonTagOptions list as Feelings/Analysis — optional,
  // multi-select, logged only when marking a day Missed — so skip patterns
  // become analyzable the same way reason tags are for feelings.
  reasonTags?: string[];
  // Set when the optional "Start Session" timer was used instead of a plain
  // Done tap — habits with a real time component (meditating, reading).
  durationMinutes?: number;
  minimum?: boolean; // done as the habit's smaller "minimum version" (still counts as done)
  plannedTime?: string; // HH:MM the habit was planned for when logged (its reminder time), if any
  completedAt?: string; // ISO datetime it was marked done (createdAt may be an earlier "Missed")
  createdAt: string; // ISO datetime
}

// --- Budget ---
export type BudgetMode = 'limit' | 'goal'; // spending limit vs. savings goal — same structure, different framing
export type BudgetRecurrence = 'none' | 'weekly' | 'monthly';

export interface BudgetCategory {
  id: string;
  label: string;
}

export interface Budget {
  id: string;
  name: string;
  mode: BudgetMode;
  targetAmount: number;
  currency: string;
  deadline?: string; // ISO date, optional
  recurrence: BudgetRecurrence; // 'none' = one-off, tracked cumulatively
  categories: BudgetCategory[];
  createdAt: string; // ISO date
}

export interface BudgetEntry {
  id: string;
  budgetId: string;
  amount: number;
  date: string; // ISO date
  categoryId?: string;
  note?: string;
  photoUri?: string;
  createdAt: string; // ISO datetime
}

// --- Quit a Habit ---
// The overarching thing being quit — persists across every attempt (track).
export interface QuitHabit {
  id: string;
  name: string;
  why?: string; // captured once at the start, resurfaced later
  createdAt: string; // ISO date
  replacementHabitId?: string; // the Build habit created to do instead ("replace, don't just remove")
  habitType?: QuitHabitType; // unset: "other"
  toolkit?: QuitToolkit; // unset: nothing pinned, hidden or added
  plans?: QuitIfThenPlan[];
  // Shown once: the offer to build the toolkit (false on habits created since
  // it exists, so older habits aren't asked), and the substances note.
  toolkitOffered?: boolean;
  substanceNoteShown?: boolean;
  // "My reasons" in the craving toolkit: the user's own list, a note to
  // their future self, and an optional photo (named photoUri so export and
  // backup find it like every other photo).
  reasons?: string[];
  futureNote?: string;
  photoUri?: string;
}

// What's being quit: decides which craving tools fit (quit/toolkit.ts).
export type QuitHabitType = 'smoking' | 'alcoholDrugs' | 'food' | 'caffeine' | 'gaming' | 'gambling' | 'scrolling' | 'other';

// "My toolkit" for one quit habit: favorites in the user's order, tools they
// don't want offered, and their own.
export interface QuitToolkit {
  pinned: string[]; // tool ids, in order
  hidden: string[];
  custom: QuitCustomTool[];
  showGames?: boolean; // games back on for a gaming, gambling or scrolling habit
}

export interface QuitCustomTool {
  id: string;
  name: string; // "Play guitar", "Make tea"
  minutes?: number; // an optional gentle timer
}

// "When it's evening and I'm bored, I will walk": offered first in a craving.
export interface QuitIfThenPlan {
  id: string;
  when: string; // the user's own words
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night'; // unset: any time
  toolId: string;
}

// One attempt/run at quitting. Never deleted on relapse — archived instead,
// so the whole journey stays visible.
export interface QuitTrack {
  id: string;
  quitHabitId: string;
  startDate: string; // ISO date
  createdAt: string; // ISO datetime — precise creation order (startDate alone can't order two tracks begun the same day)
  endDate?: string; // ISO date — set when this track ends via relapse
  status: 'active' | 'archived';
  relapseReflection?: string; // optional "what led to this", written when the track ended
  // Same reasonTagOptions list as Feelings/Habits — what was going on when
  // this track ended, for the "relapse trigger" ranking in Analysis.
  relapseReasonTags?: string[];
}

// A hard day (a slip), marked on the journey. The journey and its day count
// carry on; starting a new chapter afterwards is a separate, optional choice.
export interface QuitSlip {
  id: string;
  quitHabitId: string;
  trackId: string; // the chapter it happened in
  date: string; // ISO date on this phone when it was marked (local)
  createdAt: string; // ISO datetime
  reflection?: string; // "What was happening before?" (optional)
  reasonTags?: string[]; // same list as Feelings/Habits
  cravingSessionId?: string; // marked from a craving session ("I slipped")
}

// One time "I'm craving it" was tapped: from start to how it ended. The timer
// reads from startedAt, so it's right after the phone was locked or Ona closed.
export interface QuitCravingSession {
  id: string;
  quitHabitId: string;
  trackId: string;
  startedAt: string; // ISO datetime
  endedAt?: string; // unset while it's going on
  ratingBefore?: number; // 0–10, optional
  ratingAfter?: number; // 0–10, optional
  tools: { toolId: string; startedAt: string; endedAt?: string }[];
  outcome?: 'passed' | 'stillHere' | 'slipped';
  triggerTag?: string;
  note?: string;
  resistedEntryId?: string; // the resisted-urge entry, when it passed
  slipId?: string;
}

// A documented feeling — either "anytime" or as part of a relapse moment.
export interface QuitFeelingEntry {
  id: string;
  trackId: string;
  // The feeling, when one was noted. A resisted urge counts with or without
  // one (noting a feeling is optional since Quit stopped asking by default).
  feelingId?: string;
  zone?: FeelingZone;
  note?: string;
  // The same feeling in the main Feelings log (older ones are brought in:
  // feelings/fromSections.ts).
  feelingEntryId?: string;
  isRelapseMoment: boolean;
  // A craving that was surfed rather than acted on — tracked separately from
  // a relapse so it can be counted and celebrated ("resisted 12 urges this
  // month") rather than just logged as background data.
  isResistedUrge: boolean;
  // Which approach was used from the craving menu (e.g. "Riding it out",
  // "Step outside for a minute", "Checking the facts", "Reaching out") and
  // whether the urge actually passed — lets Analysis learn what's actually
  // worked for this specific user, not just that they resisted.
  approach?: string;
  urgePassed?: boolean;
  createdAt: string; // ISO datetime
}
