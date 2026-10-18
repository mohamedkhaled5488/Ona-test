// Skills v2 — progression, not consistency. Pure functions only (no store
// imports) so every edge case can be unit tested. Honesty rules match every
// other Analysis page: correlational wording, minimum-data thresholds (all in
// config/skillAnalysis.ts), and "keep logging" when the data is thin.
import type {
  FeelingCheckIn,
  FeelingZone,
  PracticeSession,
  SessionDifficulty,
  Skill,
  SkillLevel,
  SkillMetric,
  SubSkill,
} from '../types/sections';
import { addDaysISO, formatDisplayDate } from './date';
import { daysBetweenISO, mostCommonZone } from './feelingsStats';
import { weekStart } from './habitFrequency';
import { SKILL_ANALYSIS } from '../config/skillAnalysis';

type Config = typeof SKILL_ANALYSIS;

export const LEVEL_LABELS: Record<SkillLevel, string> = {
  starting: 'Just starting',
  some: 'Some experience',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};
export const LEVEL_ORDER: SkillLevel[] = ['starting', 'some', 'intermediate', 'advanced'];

export const DIFFICULTY_LABELS: Record<SessionDifficulty, string> = {
  tooEasy: 'Too easy',
  justRight: 'Just right',
  challenging: 'Challenging',
  tooHard: 'Too hard',
};
export const DIFFICULTY_ORDER: SessionDifficulty[] = ['tooEasy', 'justRight', 'challenging', 'tooHard'];

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// --- Sessions & time ---

// Oldest first. Sessions are stored newest-first, so when two share a date
// and timestamp, the one further down the stored list is the older one.
export function skillSessionsChrono(sessions: PracticeSession[], skillId: string): PracticeSession[] {
  return sessions
    .map((s, index) => ({ s, index }))
    .filter(({ s }) => s.skillId === skillId)
    .sort((a, b) => a.s.date.localeCompare(b.s.date) || a.s.createdAt.localeCompare(b.s.createdAt) || b.index - a.index)
    .map(({ s }) => s);
}

export function totalMinutesFor(sessions: PracticeSession[], skillId: string): number {
  return sessions.filter((s) => s.skillId === skillId).reduce((sum, s) => sum + s.minutes, 0);
}

// A record of effort, nothing more — "38 h", "1.5 h", "45 min".
export function formatHours(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = minutes / 60;
  return h < 10 ? `${round1(h)} h` : `${Math.round(h)} h`;
}

export function learningDuration(startDate: string, today: string): string {
  const days = Math.max(0, daysBetweenISO(startDate, today)) + 1;
  if (days < 14) return `${days} day${days === 1 ? '' : 's'}`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  if (days < 730) return `${Math.round(days / 30.44)} months`;
  return `${round1(days / 365.25)} years`;
}

// --- Metrics (direction-aware everywhere) ---

export function activeMetrics(skill: Skill): SkillMetric[] {
  const live = (skill.metrics ?? []).filter((m) => !m.archivedAt);
  return [...live.filter((m) => m.role === 'primary'), ...live.filter((m) => m.role === 'extra')];
}

export function primaryMetric(skill: Skill): SkillMetric | undefined {
  return (skill.metrics ?? []).find((m) => m.role === 'primary' && !m.archivedAt);
}

// Positive = better, whichever way "better" points for this metric.
export function directional(direction: SkillMetric['direction'], delta: number): number {
  return direction === 'higher' ? delta : -delta;
}

export interface MetricPoint {
  date: string;
  value: number;
  sessionId: string;
}

// One value per day — when two sessions on the same day both log the metric,
// the later one is that day's value (it's the most recent measurement).
export function metricSeries(sessions: PracticeSession[], skillId: string, metricId: string): MetricPoint[] {
  const byDate = new Map<string, MetricPoint>();
  skillSessionsChrono(sessions, skillId).forEach((s) => {
    const v = s.metricValues?.[metricId];
    if (v === undefined || Number.isNaN(v)) return;
    byDate.set(s.date, { date: s.date, value: v, sessionId: s.id });
  });
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export interface MetricChange {
  first: number;
  latest: number;
  delta: number; // raw latest - first
  improvement: number; // direction-aware: positive = better
  entries: number;
}

export function metricChange(series: MetricPoint[], direction: SkillMetric['direction']): MetricChange | undefined {
  if (series.length === 0) return undefined;
  const first = series[0].value;
  const latest = series[series.length - 1].value;
  return { first, latest, delta: latest - first, improvement: directional(direction, latest - first), entries: series.length };
}

export function formatMetricValue(value: number, unit: string): string {
  const v = Number.isInteger(value) ? String(value) : String(round1(value));
  // "1 song", not "1 songs" — only for plain plural words, so units like
  // "sec", "WPM" or "/10" are left alone.
  const u = value === 1 && /^[a-z]{3,}s$/.test(unit) ? unit.slice(0, -1) : unit;
  return u ? `${v} ${u}` : v;
}

// "42 → 58 WPM · +16 since you began" / "31 → 28 min · 3 min better since you began"
export function describeMetricChange(metric: SkillMetric, change: MetricChange): string {
  if (change.entries === 1) return `${formatMetricValue(change.latest, metric.unit)} so far`;
  const head = `${formatMetricValue(change.first, '')} → ${formatMetricValue(change.latest, metric.unit)}`;
  const amount = formatMetricValue(Math.abs(change.delta), metric.direction === 'lower' ? metric.unit : '');
  if (change.improvement > 0) {
    return metric.direction === 'higher' ? `${head} · +${amount} since you began` : `${head} · ${amount} better since you began`;
  }
  if (change.improvement < 0) return `${head} · not past where you began yet`;
  return `${head} · level with where you began`;
}

// Least-squares line through the series, x in days since the first entry —
// drawn as the trend line on the metric graph.
export function linearTrend(series: MetricPoint[]): { slope: number; intercept: number } | undefined {
  if (series.length < 2) return undefined;
  const xs = series.map((p) => daysBetweenISO(series[0].date, p.date));
  const ys = series.map((p) => p.value);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const sxx = xs.reduce((sum, x) => sum + (x - mx) ** 2, 0);
  if (sxx === 0) return undefined;
  const slope = xs.reduce((sum, x, i) => sum + (x - mx) * (ys[i] - my), 0) / sxx;
  return { slope, intercept: my - slope * mx };
}

// --- Weeks (starting on the day set in Settings, by the session's stored local date) ---

// Every week from `from`'s week to `to`'s week, including empty ones, so a
// gap in practice shows as a zero bar rather than vanishing. Week keys come
// from stored ISO dates, so month and year boundaries — and a later time
// zone change — don't move a session into a different week.
export function weeklyMinutes(sessions: PracticeSession[], skillId: string, from: string, to: string): { weekStart: string; minutes: number }[] {
  const totals = new Map<string, number>();
  sessions
    .filter((s) => s.skillId === skillId)
    .forEach((s) => totals.set(weekStart(s.date), (totals.get(weekStart(s.date)) ?? 0) + s.minutes));
  const out: { weekStart: string; minutes: number }[] = [];
  for (let w = weekStart(from); w <= weekStart(to); w = addDaysISO(w, 7)) out.push({ weekStart: w, minutes: totals.get(w) ?? 0 });
  return out;
}

export interface WeeklyGoalProgress {
  minutes: number;
  goal: number;
  fraction: number; // 0..1, capped — going over is just "done"
}

export function weeklyGoalProgress(skill: Skill, sessions: PracticeSession[], today: string): WeeklyGoalProgress | undefined {
  if (!skill.weeklyGoalMinutes) return undefined;
  const thisWeek = weekStart(today);
  const minutes = sessions.filter((s) => s.skillId === skill.id && weekStart(s.date) === thisWeek).reduce((sum, s) => sum + s.minutes, 0);
  return { minutes, goal: skill.weeklyGoalMinutes, fraction: Math.min(1, minutes / skill.weeklyGoalMinutes) };
}

// --- Sub-skills ---

export function activeSubSkills(skill: Skill): SubSkill[] {
  return (skill.subSkills ?? []).filter((s) => !s.archivedAt);
}

// Names resolve for archived sub-skills too — history keeps them.
export function subSkillName(skill: Skill, id: string): string {
  const sub = (skill.subSkills ?? []).find((s) => s.id === id);
  if (!sub) return 'Removed sub-skill';
  return sub.archivedAt ? `${sub.name} (archived)` : sub.name;
}

export interface SubSkillTime {
  subSkill: SubSkill;
  minutes: number;
  sessions: number;
  lastDate?: string;
}

// Time per sub-skill. A session focused on several sub-skills splits its
// minutes evenly between them. Archived sub-skills keep their history.
export function subSkillTime(skill: Skill, sessions: PracticeSession[]): SubSkillTime[] {
  const map = new Map<string, SubSkillTime>();
  (skill.subSkills ?? []).forEach((sub) => map.set(sub.id, { subSkill: sub, minutes: 0, sessions: 0 }));
  skillSessionsChrono(sessions, skill.id).forEach((s) => {
    const focus = (s.focusSubSkillIds ?? []).filter((id) => map.has(id));
    focus.forEach((id) => {
      const t = map.get(id)!;
      t.minutes += s.minutes / focus.length;
      t.sessions += 1;
      t.lastDate = s.date;
    });
  });
  return Array.from(map.values())
    .filter((t) => !t.subSkill.archivedAt || t.sessions > 0)
    .map((t) => ({ ...t, minutes: Math.round(t.minutes) }));
}

export interface NeglectedSubSkill {
  subSkill: SubSkill;
  daysSince: number | null; // null = never practiced
}

// Active sub-skills not focused on in `days` days. A never-practiced one only
// counts once the skill itself has been going that long.
export function neglectedSubSkills(skill: Skill, sessions: PracticeSession[], today: string, days: number = SKILL_ANALYSIS.neglectedSubSkillDays): NeglectedSubSkill[] {
  const firstSession = skillSessionsChrono(sessions, skill.id)[0];
  if (!firstSession) return [];
  return subSkillTime(skill, sessions)
    .filter((t) => !t.subSkill.archivedAt)
    .map((t) => ({ subSkill: t.subSkill, daysSince: t.lastDate ? daysBetweenISO(t.lastDate, today) : null }))
    .filter((n) => (n.daysSince === null ? daysBetweenISO(firstSession.date, today) >= days : n.daysSince >= days))
    .sort((a, b) => (b.daysSince ?? Infinity) - (a.daysSince ?? Infinity));
}

export function lastSessionStruggles(skill: Skill, sessions: PracticeSession[]): { subSkills: SubSkill[]; text?: string } | undefined {
  const last = skillSessionsChrono(sessions, skill.id).slice(-1)[0];
  if (!last) return undefined;
  const subs = (last.struggledSubSkillIds ?? [])
    .map((id) => (skill.subSkills ?? []).find((s) => s.id === id))
    .filter((s): s is SubSkill => !!s && !s.archivedAt);
  if (subs.length === 0 && !last.struggledText) return undefined;
  return { subSkills: subs, text: last.struggledText };
}

export interface SuggestedFocus {
  subSkill: SubSkill;
  reason: 'struggled' | 'leastRecent';
  lastDate?: string;
}

// Last session's struggle first; otherwise the least recently practiced
// active sub-skill (never-practiced ones first). A suggestion, never a rule.
export function suggestedFocus(skill: Skill, sessions: PracticeSession[]): SuggestedFocus | undefined {
  const struggles = lastSessionStruggles(skill, sessions);
  if (struggles?.subSkills[0]) return { subSkill: struggles.subSkills[0], reason: 'struggled' };
  const times = subSkillTime(skill, sessions).filter((t) => !t.subSkill.archivedAt);
  if (times.length === 0) return undefined;
  const sorted = [...times].sort((a, b) => (a.lastDate ?? '').localeCompare(b.lastDate ?? ''));
  return { subSkill: sorted[0].subSkill, reason: 'leastRecent', lastDate: sorted[0].lastDate };
}

export interface FrequentStruggle {
  subSkill: SubSkill;
  count: number;
  of: number; // how many recent "struggled with" entries were looked at
}

export function mostFrequentStruggle(skill: Skill, sessions: PracticeSession[], cfg: Config = SKILL_ANALYSIS): FrequentStruggle | undefined {
  const recent = skillSessionsChrono(sessions, skill.id)
    .filter((s) => (s.struggledSubSkillIds ?? []).length > 0)
    .slice(-cfg.struggleLookback);
  const counts = new Map<string, number>();
  recent.forEach((s) => new Set(s.struggledSubSkillIds).forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1)));
  const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] < cfg.struggleMinCount) return undefined;
  const sub = (skill.subSkills ?? []).find((s) => s.id === top[0]);
  return sub ? { subSkill: sub, count: top[1], of: recent.length } : undefined;
}

// --- Plateau ---

export interface Plateau {
  start: string;
  end: string;
  entries: number;
  weeks: number;
}

// "Steady" = across the last plateauWindowDays (with at least
// plateauMinEntries entries, starting near the beginning of that window), the
// typical level at the end isn't meaningfully different from the start —
// "meaningfully" meaning more than the usual session-to-session wobble. Both
// levels are medians of a few entries, so one unusually good or bad session
// can neither fake a plateau nor hide one. Direction-aware.
export function detectPlateau(series: MetricPoint[], direction: SkillMetric['direction'], today: string, cfg: Config = SKILL_ANALYSIS): Plateau | undefined {
  const windowStart = addDaysISO(today, -(cfg.plateauWindowDays - 1));
  const w = series.filter((p) => p.date >= windowStart && p.date <= today);
  if (w.length < cfg.plateauMinEntries) return undefined;
  // The entries have to actually span the window, not all sit in its last week.
  if (w[0].date > addDaysISO(windowStart, 7)) return undefined;
  const diffs = w.slice(1).map((p, i) => Math.abs(p.value - w[i].value));
  const noise = median(diffs);
  const k = Math.min(cfg.plateauEdgeEntries, Math.floor(w.length / 2));
  const startLevel = median(w.slice(0, k).map((p) => p.value));
  const endLevel = median(w.slice(-k).map((p) => p.value));
  const change = directional(direction, endLevel - startLevel);
  // Only a genuinely flat stretch counts — a clear decline isn't "steady",
  // and saying so would be inaccurate.
  if (Math.abs(change) > noise) return undefined;
  // A zigzag that keeps climbing (lows and highs both rising) can have edge
  // medians within the swing. So the trend line's change across the window
  // must also stay within the typical scatter around that line.
  const trend = linearTrend(w);
  if (trend) {
    const span = daysBetweenISO(w[0].date, w[w.length - 1].date);
    const scatter = median(w.map((p) => Math.abs(p.value - (trend.intercept + trend.slope * daysBetweenISO(w[0].date, p.date)))));
    if (Math.abs(trend.slope * span) > scatter + 1e-9) return undefined;
  }
  const days = daysBetweenISO(w[0].date, w[w.length - 1].date) + 1;
  return { start: w[0].date, end: w[w.length - 1].date, entries: w.length, weeks: Math.max(1, Math.round(days / 7)) };
}

// Every plateau stretch across the whole history (for the shaded bands on
// the Journey and the metric graph), merged where they overlap.
export function plateauPeriods(series: MetricPoint[], direction: SkillMetric['direction'], cfg: Config = SKILL_ANALYSIS): Plateau[] {
  const found: Plateau[] = [];
  series.forEach((p) => {
    const plateau = detectPlateau(series.filter((x) => x.date <= p.date), direction, p.date, cfg);
    if (plateau) found.push(plateau);
  });
  const merged: Plateau[] = [];
  found.forEach((p) => {
    const last = merged[merged.length - 1];
    if (last && p.start <= last.end) {
      last.end = p.end > last.end ? p.end : last.end;
      last.entries = series.filter((x) => x.date >= last.start && x.date <= last.end).length;
      last.weeks = Math.max(1, Math.round((daysBetweenISO(last.start, last.end) + 1) / 7));
    } else {
      merged.push({ ...p });
    }
  });
  return merged;
}

// --- Sweet spot (challenge–skill balance) ---

export interface SweetSpot {
  strongShare: number; // share of Just right / Challenging sessions in the stronger stretches
  weakShare: number;
}

// Splits the history into stretches between consecutive metric entries,
// ranks them by gain (direction-aware), and compares how often the sessions
// in the stronger half were rated Just right or Challenging.
export function sweetSpot(sessions: PracticeSession[], skillId: string, series: MetricPoint[], direction: SkillMetric['direction'], cfg: Config = SKILL_ANALYSIS): SweetSpot | undefined {
  const mine = skillSessionsChrono(sessions, skillId);
  if (mine.filter((s) => s.difficulty).length < cfg.sweetSpotMinRatedSessions || series.length < cfg.sweetSpotMinMetricEntries) return undefined;
  const stretches = series.slice(1).map((p, i) => ({
    gain: directional(direction, p.value - series[i].value),
    rated: mine.filter((s) => s.date > series[i].date && s.date <= p.date && s.difficulty),
  }));
  // Split at the mean gain, not the median: with tied gains (several equal
  // +5 stretches, say) the median sits on the top value and leaves the
  // "stronger" group empty.
  const m = stretches.reduce((sum, s) => sum + s.gain, 0) / stretches.length;
  const share = (group: typeof stretches) => {
    const rated = group.flatMap((g) => g.rated);
    if (rated.length === 0) return undefined;
    return rated.filter((s) => s.difficulty === 'justRight' || s.difficulty === 'challenging').length / rated.length;
  };
  const strongShare = share(stretches.filter((s) => s.gain > m));
  const weakShare = share(stretches.filter((s) => s.gain <= m));
  if (strongShare === undefined || weakShare === undefined) return undefined;
  if (strongShare - weakShare < cfg.sweetSpotMinShareGap) return undefined;
  return { strongShare, weakShare };
}

// --- Effort and progress ---

function pearson(xs: number[], ys: number[]): number | undefined {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const sx = Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0));
  const sy = Math.sqrt(ys.reduce((s, y) => s + (y - my) ** 2, 0));
  if (sx === 0 || sy === 0) return undefined;
  return xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / (sx * sy);
}

// Weekly practice minutes vs. that week's change in the metric. Only ever
// reports the positive association — never a causal claim, never a scolding.
export function effortAndProgress(sessions: PracticeSession[], skillId: string, series: MetricPoint[], direction: SkillMetric['direction'], cfg: Config = SKILL_ANALYSIS): { weeks: number; r: number } | undefined {
  const lastByWeek = new Map<string, number>();
  series.forEach((p) => lastByWeek.set(weekStart(p.date), p.value));
  const weeks = Array.from(lastByWeek.keys()).sort();
  const minutes: number[] = [];
  const gains: number[] = [];
  weeks.slice(1).forEach((w, i) => {
    minutes.push(sessions.filter((s) => s.skillId === skillId && weekStart(s.date) === w).reduce((sum, s) => sum + s.minutes, 0));
    gains.push(directional(direction, lastByWeek.get(w)! - lastByWeek.get(weeks[i])!));
  });
  if (minutes.length < cfg.effortMinWeeks) return undefined;
  const r = pearson(minutes, gains);
  if (r === undefined || r < cfg.effortMinCorrelation) return undefined;
  return { weeks: minutes.length, r };
}

// --- Difficulty over time ---

export function weeklyDifficulty(sessions: PracticeSession[], skillId: string, from: string, to: string): { weekStart: string; counts: Record<SessionDifficulty, number> }[] {
  const empty = (): Record<SessionDifficulty, number> => ({ tooEasy: 0, justRight: 0, challenging: 0, tooHard: 0 });
  const map = new Map<string, Record<SessionDifficulty, number>>();
  sessions
    .filter((s) => s.skillId === skillId && s.difficulty)
    .forEach((s) => {
      const w = weekStart(s.date);
      const c = map.get(w) ?? empty();
      c[s.difficulty!] += 1;
      map.set(w, c);
    });
  const out: { weekStart: string; counts: Record<SessionDifficulty, number> }[] = [];
  for (let w = weekStart(from); w <= weekStart(to); w = addDaysISO(w, 7)) out.push({ weekStart: w, counts: map.get(w) ?? empty() });
  return out;
}

// --- Feelings after practice, by sub-skill ---

// Feelings are logged against the skill, not a session, so a feeling is
// matched to the sub-skills focused on in that day's sessions.
export function feelingBySubSkill(skill: Skill, sessions: PracticeSession[], feelings: FeelingCheckIn[], minCount: number = SKILL_ANALYSIS.minSamples): { subSkill: SubSkill; zone: FeelingZone; count: number; total: number }[] {
  const mine = feelings.filter((f) => f.source?.kind === 'skill' && f.source.refId === skill.id);
  return (skill.subSkills ?? [])
    .map((sub) => {
      const dates = new Set(sessions.filter((s) => s.skillId === skill.id && (s.focusSubSkillIds ?? []).includes(sub.id)).map((s) => s.date));
      const matched = mine.filter((f) => dates.has(f.date));
      const top = mostCommonZone(matched);
      return top && matched.length >= minCount ? { subSkill: sub, zone: top.zone, count: top.count, total: matched.length } : undefined;
    })
    .filter((x): x is { subSkill: SubSkill; zone: FeelingZone; count: number; total: number } => !!x);
}

// --- Monthly recap (Recap can read this too) ---

export function monthlyRecap(skill: Skill, sessions: PracticeSession[], monthKey: string): { minutes: number; sessions: number; milestones: number } {
  const inMonth = sessions.filter((s) => s.skillId === skill.id && s.date.slice(0, 7) === monthKey);
  return {
    minutes: inMonth.reduce((sum, s) => sum + s.minutes, 0),
    sessions: inMonth.length,
    milestones: skill.milestones.filter((m) => m.achieved && m.achievedAt?.slice(0, 7) === monthKey).length,
  };
}

// --- Written summary ---

export function skillSummary(skill: Skill, sessions: PracticeSession[], today: string): string | undefined {
  const mine = skillSessionsChrono(sessions, skill.id);
  if (mine.length === 0) return undefined;
  const parts = [`You've practiced ${skill.name} for ${formatHours(totalMinutesFor(sessions, skill.id))} over ${learningDuration(skill.startDate, today)}.`];
  const metric = primaryMetric(skill);
  if (metric) {
    const change = metricChange(metricSeries(sessions, skill.id, metric.id), metric.direction);
    if (change && change.entries > 1) {
      parts.push(`Your "${metric.name}" went from ${formatMetricValue(change.first, '')} to ${formatMetricValue(change.latest, metric.unit)}.`);
    }
  }
  const times = subSkillTime(skill, sessions).filter((t) => !t.subSkill.archivedAt);
  if (times.length >= 2 && times.some((t) => t.minutes > 0)) {
    const sorted = [...times].sort((a, b) => b.minutes - a.minutes);
    parts.push(`${sorted[0].subSkill.name} has had the most attention; ${sorted[sorted.length - 1].subSkill.name.toLowerCase()} the least.`);
  }
  return parts.join(' ');
}

// --- Journey ---

export type JourneyEventKind = 'start' | 'milestone' | 'level' | 'breakthrough' | 'plateau' | 'feedback' | 'resource' | 'photo' | 'next';

export interface JourneyEvent {
  id: string;
  kind: JourneyEventKind;
  date: string;
  endDate?: string; // plateau bands
  title: string;
  detail?: string;
  photoUri?: string;
  sessionId?: string;
  milestoneId?: string;
}

const FEEDBACK_FROM: Record<string, string> = { teacher: 'Teacher', peer: 'Peer', self: 'Self-review', other: 'Feedback' };

// The whole learning story, oldest first, with the next milestone at the end
// as a faded "not yet" node.
export function buildJourney(skill: Skill, sessions: PracticeSession[]): JourneyEvent[] {
  const events: JourneyEvent[] = [];
  events.push({
    id: 'start',
    kind: 'start',
    date: skill.startDate,
    title: 'Started',
    detail: [skill.startingLevel ? LEVEL_LABELS[skill.startingLevel] : undefined, skill.goal ? `Goal: ${skill.goal}` : undefined].filter(Boolean).join(' · ') || undefined,
  });
  skill.milestones
    .filter((m) => m.achieved && m.achievedAt)
    .forEach((m) => events.push({ id: `ms-${m.id}`, kind: 'milestone', date: m.achievedAt!, title: m.text, detail: m.reflection, photoUri: m.proofPhotoUri, milestoneId: m.id }));
  (skill.levelHistory ?? []).forEach((l) =>
    events.push({ id: `lv-${l.id}`, kind: 'level', date: l.date, title: `Level: ${LEVEL_LABELS[l.to]}`, detail: l.from ? `From ${LEVEL_LABELS[l.from]}` : undefined })
  );
  skillSessionsChrono(sessions, skill.id).forEach((s) => {
    if (s.breakthrough) events.push({ id: `bt-${s.id}`, kind: 'breakthrough', date: s.date, title: 'Something clicked', detail: s.notes, sessionId: s.id });
    if (s.feedback?.text) events.push({ id: `fb-${s.id}`, kind: 'feedback', date: s.date, title: `${FEEDBACK_FROM[s.feedback.from]} feedback`, detail: s.feedback.text, sessionId: s.id });
    if (s.photoUri) events.push({ id: `ph-${s.id}`, kind: 'photo', date: s.date, title: 'Progress photo', photoUri: s.photoUri, sessionId: s.id });
  });
  (skill.resources ?? [])
    .filter((r) => r.status === 'done' && r.doneAt)
    .forEach((r) => events.push({ id: `rs-${r.id}`, kind: 'resource', date: r.doneAt!, title: `Finished: ${r.name}`, detail: r.type }));
  const metric = primaryMetric(skill);
  if (metric) {
    plateauPeriods(metricSeries(sessions, skill.id, metric.id), metric.direction).forEach((p, i) =>
      events.push({
        id: `pl-${i}`,
        kind: 'plateau',
        date: p.start,
        endDate: p.end,
        title: 'A steady stretch',
        detail: `${formatDisplayDate(p.start)} – ${formatDisplayDate(p.end)} · plateaus are a normal part of learning`,
      })
    );
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'start' ? -1 : b.kind === 'start' ? 1 : 0));
  const next = skill.milestones.find((m) => !m.achieved);
  if (next) {
    events.push({ id: `next-${next.id}`, kind: 'next', date: next.targetDate ?? '', title: next.text, detail: next.targetDate ? `Aiming for ${formatDisplayDate(next.targetDate)}` : 'Not yet', milestoneId: next.id });
  }
  return events;
}
