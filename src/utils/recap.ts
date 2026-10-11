// Recap's read-only aggregation layer.
//
// Every function here is a pure function of data the caller already selected
// from each section's own store hook (raw arrays — selected in the render
// body, never filtered inside the selector itself, per the app's established
// zustand pattern). Nothing in this file imports a store or calls a mutator.
// Recap is a window onto the other sections, never a connector: it reads,
// it never writes anything back into another section's data.
import type {
  Budget,
  BudgetEntry,
  CapturedThought,
  DailyTask,
  FeelingCheckIn,
  GameResult,
  Habit,
  HabitCheckIn,
  JournalEntry,
  Plan,
  PlannedMeal,
  PracticeSession,
  QuitFeelingEntry,
  QuitHabit,
  QuitTrack,
  ReadingListEntry,
  SectionId,
  Skill,
  SleepLogEntry,
  Song,
  StudySession,
} from '../types/sections';
import { resolveTaskDone, resolveTaskTitle } from '../store/useDailyPlanningStore';
import { totalPracticeMinutes as skillTotalMinutes, sessionsForSkill } from '../store/useSkillsStore';
import { habitStreak, daysElapsed as habitDaysElapsed } from '../store/useHabitsStore';
import { feelings, zoneMeta } from '../data/feelingsWheel';
import { formatMoney } from '../data/currencies';

export interface RecapEvent {
  id: string; // stable id, unique within a day's recap
  date: string; // ISO date
  sectionId: SectionId;
  title: string;
  detail?: string;
  // Extra route params for the tap-through link, when the target section
  // supports deep-linking into a specific entry (see MyBooks/Skills/Habit
  // Builder's `open...` route params) — otherwise the tap just opens the
  // section normally, same as navigating there directly.
  navParams?: Record<string, string>;
}

export interface RecapSourceData {
  tasks: DailyTask[];
  journalEntries: JournalEntry[];
  thoughts: CapturedThought[];
  studySessions: StudySession[];
  meals: PlannedMeal[];
  songs: Song[];
  gameResults: GameResult[];
  feelingCheckIns: FeelingCheckIn[];
  sleepLogs: SleepLogEntry[];
  readingEntries: ReadingListEntry[];
  plans: Plan[];
  skills: Skill[];
  skillSessions: PracticeSession[];
  habits: Habit[];
  habitCheckIns: HabitCheckIn[];
  budgets: Budget[];
  budgetEntries: BudgetEntry[];
  quitHabits: QuitHabit[];
  quitTracks: QuitTrack[];
  quitFeelingEntries: QuitFeelingEntry[];
}

const thoughtKindLabel: Record<CapturedThought['kind'], string> = {
  idea: 'Caught an idea',
  feeling: 'Caught a feeling',
  random: 'Caught a random thought',
};

function truncate(text: string, max = 60): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

// Builds every recap-worthy event across all sections, for whatever date
// range the caller already narrowed `data` to (callers typically pass full
// history and let consumers filter by date afterward).
export function collectRecapEvents(data: RecapSourceData): RecapEvent[] {
  const events: RecapEvent[] = [];

  for (const task of data.tasks) {
    if (resolveTaskDone(task, task.date)) {
      events.push({ id: `task-${task.id}-${task.date}`, date: task.date, sectionId: 'dailyPlanning', title: `Completed: ${resolveTaskTitle(task)}` });
    }
  }

  for (const entry of data.journalEntries) {
    events.push({
      id: `journal-${entry.id}`,
      date: entry.date,
      sectionId: 'journaling',
      title: `Journaled (${zoneMeta(entry.zone).label})`,
      detail: truncate(entry.text),
    });
  }

  for (const thought of data.thoughts) {
    const date = thought.createdAt.slice(0, 10);
    events.push({ id: `thought-${thought.id}`, date, sectionId: 'catchAThought', title: thoughtKindLabel[thought.kind], detail: truncate(thought.text) });
  }

  for (const session of data.studySessions) {
    events.push({
      id: `study-${session.id}`,
      date: session.date,
      sectionId: 'studySession',
      title: `Studied${session.subject ? `: ${session.subject}` : ''}`,
      detail: `${session.focusMinutes} focus min`,
    });
  }

  for (const meal of data.meals) {
    events.push({ id: `meal-${meal.id}`, date: meal.date, sectionId: 'dietPlanning', title: `${meal.slot[0].toUpperCase()}${meal.slot.slice(1)}: ${meal.name}` });
  }

  for (const song of data.songs) {
    const date = song.updatedAt || song.createdAt;
    events.push({ id: `song-${song.id}-${date}`, date, sectionId: 'songwriting', title: `Worked on "${song.title}"` });
  }

  for (const result of data.gameResults) {
    const date = result.playedAt.slice(0, 10);
    events.push({ id: `game-${result.id}`, date, sectionId: 'mindGames', title: `Played a mind game`, detail: `Score: ${result.score}` });
  }

  for (const checkIn of data.feelingCheckIns) {
    const names = checkIn.feelingIds.map((id) => feelings.find((f) => f.id === id)?.name).filter(Boolean);
    events.push({
      id: `feeling-${checkIn.id}`,
      date: checkIn.date,
      sectionId: 'moodCheck',
      title: `Identified a feeling${names.length > 0 ? `: ${names.join(' & ')}` : ''}`,
      detail: checkIn.note,
    });
  }

  for (const log of data.sleepLogs) {
    events.push({ id: `sleep-${log.id}`, date: log.date, sectionId: 'sleep', title: `Logged sleep: ${log.quality}/5`, detail: log.note });
  }

  for (const entry of data.readingEntries) {
    const date = entry.addedAt.slice(0, 10);
    events.push({ id: `reading-${entry.id}`, date, sectionId: 'book', title: `Added to reading list: ${entry.book.title}` });
  }

  for (const plan of data.plans) {
    events.push({ id: `plan-${plan.id}`, date: plan.createdAt, sectionId: 'planBuilder', title: `Started a plan: ${plan.title || 'Untitled'}` });
  }

  for (const session of data.skillSessions) {
    const skill = data.skills.find((s) => s.id === session.skillId);
    const skillName = skill?.name ?? 'a skill';
    const extras = [session.notes ? 'note added' : null, session.photoUri ? 'photo attached' : null].filter(Boolean).join(' · ');
    events.push({
      id: `skill-${session.id}`,
      date: session.date,
      sectionId: 'skills',
      title: session.minutes > 0 ? `You practiced ${skillName} for ${session.minutes} min today` : `You logged a session for ${skillName}`,
      detail: extras || undefined,
      navParams: { openSkillId: session.skillId, openSessionId: session.id },
    });
  }

  for (const checkIn of data.habitCheckIns) {
    if (!checkIn.done) continue; // Recap surfaces what was accomplished, not misses.
    const habit = data.habits.find((h) => h.id === checkIn.habitId);
    const habitName = habit?.name ?? 'a habit';
    const documented = !!(checkIn.note || checkIn.photoUri);
    events.push({
      id: `habit-${checkIn.id}`,
      date: checkIn.date,
      sectionId: 'habitBuilder',
      title: documented ? `You documented your ${habitName} practice today` : `You completed today's habit: ${habitName}`,
      detail: checkIn.note,
      navParams: { openHabitId: checkIn.habitId, openDate: checkIn.date },
    });
  }

  for (const entry of data.budgetEntries) {
    const budget = data.budgets.find((b) => b.id === entry.budgetId);
    const budgetName = budget?.name ?? 'a budget';
    const amountText = budget ? formatMoney(entry.amount, budget.currency) : `${entry.amount}`;
    events.push({
      id: `budget-${entry.id}`,
      date: entry.date,
      sectionId: 'budget',
      title: budget?.mode === 'goal' ? `Contributed ${amountText} to ${budgetName}` : `Spent ${amountText} on ${budgetName}`,
      detail: entry.note,
      navParams: { openBudgetId: entry.budgetId },
    });
  }

  for (const entry of data.quitFeelingEntries) {
    const track = data.quitTracks.find((t) => t.id === entry.trackId);
    const habit = track ? data.quitHabits.find((h) => h.id === track.quitHabitId) : undefined;
    const feeling = feelings.find((f) => f.id === entry.feelingId);
    events.push({
      id: `quit-${entry.id}`,
      date: entry.createdAt.slice(0, 10),
      sectionId: 'quitHabit',
      title: `Checked in on quitting ${habit?.name ?? 'a habit'}${feeling ? `: ${feeling.name}` : ''}`,
      detail: entry.note,
      navParams: habit ? { openHabitId: habit.id } : undefined,
    });
  }

  return events;
}

export function eventsForDate(events: RecapEvent[], date: string): RecapEvent[] {
  return events.filter((e) => e.date === date).sort((a, b) => a.sectionId.localeCompare(b.sectionId));
}

// date -> number of events that day, for the activity heatmap.
export function buildActivityCounts(events: RecapEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of events) {
    counts[e.date] = (counts[e.date] ?? 0) + 1;
  }
  return counts;
}

export interface SectionCount {
  sectionId: SectionId;
  count: number;
}

// Aggregate counts per section across [startDate, endDate], inclusive.
export function aggregateBySection(events: RecapEvent[], startDate: string, endDate: string): SectionCount[] {
  const counts = new Map<SectionId, number>();
  for (const e of events) {
    if (e.date < startDate || e.date > endDate) continue;
    counts.set(e.sectionId, (counts.get(e.sectionId) ?? 0) + 1);
  }
  return [...counts.entries()].map(([sectionId, count]) => ({ sectionId, count })).sort((a, b) => b.count - a.count);
}

export interface Milestone {
  id: string;
  text: string;
}

// Purely self-referential — every threshold is compared against the user's
// own totals, never against other people, and nothing here is a score.
export function buildMilestones(events: RecapEvent[], today: string): Milestone[] {
  const milestones: Milestone[] = [];
  const total = events.length;
  const roundThresholds = [10, 25, 50, 100, 250, 500];
  const passedThreshold = roundThresholds.filter((t) => total >= t).slice(-1)[0];
  if (passedThreshold) {
    milestones.push({ id: `total-${passedThreshold}`, text: `You've logged ${passedThreshold}+ moments across Ona.` });
  }

  const daysWithActivity = new Set(events.map((e) => e.date));
  if (daysWithActivity.has(today)) {
    // Count the current unbroken streak of days with at least one event.
    let streak = 0;
    let cursor = today;
    while (daysWithActivity.has(cursor)) {
      streak += 1;
      const d = new Date(`${cursor}T00:00:00`);
      d.setDate(d.getDate() - 1);
      cursor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    if (streak >= 3) {
      milestones.push({ id: `streak-${streak}`, text: `${streak} days in a row with something logged — a real rhythm.` });
    }
  }

  const bySection = new Map<SectionId, number>();
  for (const e of events) bySection.set(e.sectionId, (bySection.get(e.sectionId) ?? 0) + 1);
  const mostUsed = [...bySection.entries()].sort((a, b) => b[1] - a[1])[0];
  if (mostUsed && mostUsed[1] >= 5) {
    milestones.push({ id: `favorite-${mostUsed[0]}`, text: `${mostUsed[1]} entries so far in your most-used section this period.` });
  }

  return milestones;
}

export interface PatternObservation {
  id: string;
  text: string;
}

// Gentle, descriptive-only observations drawn from the user's own recent
// data — never diagnostic, never comparative to anyone else.
export function buildPatternObservations(events: RecapEvent[], windowStart: string, windowEnd: string): PatternObservation[] {
  const inWindow = events.filter((e) => e.date >= windowStart && e.date <= windowEnd);
  const observations: PatternObservation[] = [];

  const journalDates = new Set(inWindow.filter((e) => e.sectionId === 'journaling').map((e) => e.date));
  const studyDates = new Set(inWindow.filter((e) => e.sectionId === 'studySession').map((e) => e.date));
  if (journalDates.size >= 3 && studyDates.size >= 3) {
    const overlap = [...journalDates].filter((d) => studyDates.has(d)).length;
    if (overlap / journalDates.size >= 0.6) {
      observations.push({ id: 'journal-study', text: 'You tend to journal on the same days you study — those two seem to go together for you.' });
    }
  }

  const sleepLogs = inWindow.filter((e) => e.sectionId === 'sleep' && e.title.startsWith('Logged sleep'));
  if (sleepLogs.length >= 4) {
    const qualities = sleepLogs.map((e) => Number(e.title.split(': ')[1]?.split('/')[0]) || 0).filter(Boolean);
    if (qualities.length >= 4) {
      const avg = qualities.reduce((a, b) => a + b, 0) / qualities.length;
      if (avg <= 2.5) {
        observations.push({ id: 'low-sleep', text: 'Sleep quality has leaned lower this stretch — the wind-down checklist might be worth a look.' });
      } else if (avg >= 4) {
        observations.push({ id: 'good-sleep', text: 'Sleep quality has been consistently good this stretch.' });
      }
    }
  }

  const feelingDates = new Set(inWindow.filter((e) => e.sectionId === 'moodCheck').map((e) => e.date));
  if (feelingDates.size >= 5) {
    observations.push({ id: 'checking-in', text: `You checked in on your feelings ${feelingDates.size} different days recently — that consistency is worth noticing.` });
  }

  return observations;
}

// --- Skills & Habit Builder additions ---
// These read the same raw, pre-selected arrays as everything above — only
// the shared pure helpers from each store are reused (imported at the top
// of this file), the same way resolveTaskDone/resolveTaskTitle already are.

export interface SkillTimeBreakdown {
  skillId: string;
  skillName: string;
  minutes: number;
}

// Total practice time across all skills in [startDate, endDate], plus a
// per-skill breakdown, for the weekly/monthly recap.
export function buildSkillsTimeBreakdown(
  skills: Skill[],
  sessions: PracticeSession[],
  startDate: string,
  endDate: string
): { totalMinutes: number; bySkill: SkillTimeBreakdown[] } {
  const inWindow = sessions.filter((s) => s.date >= startDate && s.date <= endDate);
  const bySkill = skills
    .map((skill) => ({
      skillId: skill.id,
      skillName: skill.name,
      minutes: inWindow.filter((s) => s.skillId === skill.id).reduce((sum, s) => sum + s.minutes, 0),
    }))
    .filter((s) => s.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
  return { totalMinutes: bySkill.reduce((sum, s) => sum + s.minutes, 0), bySkill };
}

export interface HabitStatus {
  habitId: string;
  text: string; // e.g. "Guitar practice — Day 14 of 21" or "Morning stretch — maintained, Day 45"
}

// Current status of each active (non-archived) habit, for the weekly/
// monthly recap — "Day X of Y", or a maintenance framing once graduated.
export function buildHabitStatuses(habits: Habit[], checkIns: HabitCheckIn[], today: string): HabitStatus[] {
  return habits
    .filter((h) => !h.archivedAt && (!h.graduationChoice || h.graduationChoice === 'maintenance'))
    .map((h) => {
      const elapsed = habitDaysElapsed(h, today);
      if (h.graduationChoice === 'maintenance') {
        return { habitId: h.id, text: `${h.name} — maintained, Day ${elapsed}` };
      }
      return { habitId: h.id, text: `${h.name} — Day ${Math.min(elapsed, h.targetDays)} of ${h.targetDays}` };
    });
}

// Number of habits that reached graduation (any choice) within the window.
export function countGraduationsInRange(habits: Habit[], startDate: string, endDate: string): number {
  return habits.filter((h) => h.graduatedAt && h.graduatedAt >= startDate && h.graduatedAt <= endDate).length;
}

// Skill/habit-specific milestones — kept separate from buildMilestones
// above since they need the raw skill/habit data, not just events.
export function buildSkillsAndHabitsMilestones(
  skills: Skill[],
  sessions: PracticeSession[],
  habits: Habit[],
  checkIns: HabitCheckIn[],
  today: string
): Milestone[] {
  const milestones: Milestone[] = [];
  const roundThresholds = [10, 25, 50, 100];

  for (const skill of skills) {
    const count = sessionsForSkill(sessions, skill.id).length;
    const passed = roundThresholds.filter((t) => count >= t).slice(-1)[0];
    if (passed) milestones.push({ id: `skill-sessions-${skill.id}-${passed}`, text: `${passed}+ practice sessions logged for ${skill.name}.` });
  }

  for (const habit of habits) {
    const { current, unit } = habitStreak(checkIns, habit.id, today, habit.frequency);
    // A weekly streak climbs a step a week, so it gets its own, smaller thresholds.
    const streakThresholds = unit === 'week' ? [4, 8, 12, 26, 52] : [7, 14, 30, 66, 100];
    const passed = streakThresholds.filter((t) => current >= t).slice(-1)[0];
    if (passed) {
      milestones.push({ id: `habit-streak-${habit.id}-${passed}${unit === 'week' ? 'w' : ''}`, text: `${habit.name} streak reached ${passed} ${unit === 'week' ? 'weeks' : 'days'}.` });
    }
  }

  const formedHabits = habits.filter((h) => h.graduationChoice === 'formed' && h.graduatedAt).sort((a, b) => a.graduatedAt!.localeCompare(b.graduatedAt!));
  if (formedHabits.length > 0) {
    milestones.push({ id: 'first-habit-graduated', text: `You graduated your first habit: ${formedHabits[0].name}.` });
  }

  // Also surface total practice minutes reaching a round number, mirroring
  // buildMilestones' "logged moments" framing but for practice time.
  const totalMinutes = skillTotalMinutesAcross(skills, sessions);
  const minuteThresholds = [60, 300, 600, 1200, 3000];
  const passedMinutes = minuteThresholds.filter((t) => totalMinutes >= t).slice(-1)[0];
  if (passedMinutes) {
    milestones.push({ id: `practice-minutes-${passedMinutes}`, text: `${Math.round(passedMinutes / 60)}+ hours of practice logged across your skills.` });
  }

  return milestones;
}

function skillTotalMinutesAcross(skills: Skill[], sessions: PracticeSession[]): number {
  return skills.reduce((sum, skill) => sum + skillTotalMinutes(sessions, skill.id), 0);
}

// "You tend to practice [Skill] more often on days you've already completed
// [Habit]" — purely descriptive, checked only for the single most-practiced
// skill against the single most-completed habit, to keep this rare and
// genuinely notable rather than noisy.
export function buildSkillHabitPatternObservation(
  skills: Skill[],
  sessions: PracticeSession[],
  habits: Habit[],
  checkIns: HabitCheckIn[],
  windowStart: string,
  windowEnd: string
): PatternObservation | undefined {
  const inWindowSessions = sessions.filter((s) => s.date >= windowStart && s.date <= windowEnd);
  const inWindowCheckIns = checkIns.filter((c) => c.done && c.date >= windowStart && c.date <= windowEnd);
  if (skills.length === 0 || habits.length === 0) return undefined;

  const topSkill = skills
    .map((skill) => ({ skill, dates: new Set(inWindowSessions.filter((s) => s.skillId === skill.id).map((s) => s.date)) }))
    .sort((a, b) => b.dates.size - a.dates.size)[0];
  const topHabit = habits
    .map((habit) => ({ habit, dates: new Set(inWindowCheckIns.filter((c) => c.habitId === habit.id).map((c) => c.date)) }))
    .sort((a, b) => b.dates.size - a.dates.size)[0];

  if (!topSkill || !topHabit || topSkill.dates.size < 3 || topHabit.dates.size < 3) return undefined;

  const overlap = [...topSkill.dates].filter((d) => topHabit.dates.has(d)).length;
  if (overlap / topSkill.dates.size < 0.6) return undefined;

  return {
    id: `skill-habit-${topSkill.skill.id}-${topHabit.habit.id}`,
    text: `You tend to practice ${topSkill.skill.name} more often on days you've already completed ${topHabit.habit.name}.`,
  };
}
