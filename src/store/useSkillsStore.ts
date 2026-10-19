import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  FeedbackSource,
  PracticeSession,
  SessionDifficulty,
  Skill,
  SkillLevel,
  SkillMetric,
  SkillResourceStatus,
  SkillResourceType,
  SkillType,
  SubSkill,
} from '../types/sections';
import { genId } from '../utils/id';
import { todayISO, addDaysISO, dayOfYear, toISODate } from '../utils/date';
import { cancelReminders, scheduleReminder } from '../utils/notifications';

export interface PracticeSessionInput {
  minutes: number;
  notes?: string;
  photoUri?: string;
  hasVoiceMemo?: boolean;
  tag?: string;
  date?: string;
  startedAt?: string; // ISO datetime the timer started — the session belongs to that local day
  // "Add details" — all optional
  focusSubSkillIds?: string[];
  difficulty?: SessionDifficulty;
  metricValues?: Record<string, number>;
  struggledSubSkillIds?: string[];
  struggledText?: string;
  breakthrough?: boolean;
  feedback?: { from: FeedbackSource; text: string };
}

export interface MetricDefinition {
  name: string;
  unit: string;
  direction: 'higher' | 'lower';
  selfRating?: boolean;
}

export type SkillSetupEdit = Partial<
  Pick<Skill, 'name' | 'color' | 'icon' | 'type' | 'goal' | 'goalTargetDate' | 'weeklyGoalMinutes' | 'startingLevel'>
>;

export const MAX_EXTRA_METRICS = 2;

interface SkillsState {
  skills: Skill[];
  sessions: PracticeSession[];

  addSkill: (name: string, color: string, icon: Skill['icon'], type: SkillType | undefined, startDate: string) => string;
  updateSkill: (id: string, updates: SkillSetupEdit) => void;
  deleteSkill: (id: string) => void;
  archiveSkill: (id: string) => void;
  unarchiveSkill: (id: string) => void;

  // Always the user's own call — recorded in levelHistory for the Journey.
  setLevel: (skillId: string, level: SkillLevel, afterMilestoneId?: string) => void;

  addSubSkill: (skillId: string, name: string, level?: SubSkill['level']) => void;
  renameSubSkill: (skillId: string, subSkillId: string, name: string) => void;
  setSubSkillLevel: (skillId: string, subSkillId: string, level: SubSkill['level']) => void;
  archiveSubSkill: (skillId: string, subSkillId: string) => void;
  unarchiveSubSkill: (skillId: string, subSkillId: string) => void;

  // Adding a primary when one already exists archives the old one (its values are kept).
  addMetric: (skillId: string, def: MetricDefinition, role: SkillMetric['role']) => string | undefined;
  // Changing a definition = archive the old metric and start a new one in the same role.
  redefineMetric: (skillId: string, metricId: string, def: MetricDefinition) => string | undefined;
  archiveMetric: (skillId: string, metricId: string) => void;

  addMilestone: (skillId: string, text: string, targetDate?: string) => void;
  toggleMilestone: (skillId: string, milestoneId: string) => void;
  achieveMilestone: (skillId: string, milestoneId: string, details?: { reflection?: string; proofPhotoUri?: string }) => void;
  deleteMilestone: (skillId: string, milestoneId: string) => void;

  addResource: (skillId: string, name: string, type: SkillResourceType, linkOrNote?: string) => void;
  setResourceStatus: (skillId: string, resourceId: string, status: SkillResourceStatus) => void;
  deleteResource: (skillId: string, resourceId: string) => void;

  setReminder: (skillId: string, time: string | undefined, enabled: boolean) => Promise<void>;

  addSession: (skillId: string, input: PracticeSessionInput) => string;
  deleteSession: (id: string) => void;
}

export const useSkillsStore = create<SkillsState>()(
  immer((set, get) => {
    const withSkill = (skillId: string, fn: (skill: Skill) => void) =>
      set((state) => {
        const skill = state.skills.find((s) => s.id === skillId);
        if (skill) fn(skill as Skill);
      });

    const newMetric = (def: MetricDefinition, role: SkillMetric['role']): SkillMetric => ({
      id: genId('metric'),
      name: def.name.trim() || 'Progress',
      unit: def.unit.trim(),
      direction: def.direction,
      role,
      selfRating: def.selfRating,
      createdAt: todayISO(),
    });

    return {
      skills: [],
      sessions: [],

      addSkill: (name, color, icon, type, startDate) => {
        const id = genId('skill');
        set((state) => {
          state.skills.unshift({
            id,
            name: name.trim() || 'Untitled skill',
            color,
            icon,
            type,
            startDate,
            milestones: [],
            reminderEnabled: false,
            reminderNotificationIds: [],
          });
        });
        return id;
      },

      updateSkill: (id, updates) =>
        withSkill(id, (skill) => {
          Object.assign(skill, updates);
        }),

      deleteSkill: (id) => {
        const skill = get().skills.find((s) => s.id === id);
        if (skill) void cancelReminders(skill.reminderNotificationIds);
        set((state) => {
          state.skills = state.skills.filter((s) => s.id !== id);
          state.sessions = state.sessions.filter((s) => s.skillId !== id);
        });
      },

      archiveSkill: (id) => {
        const skill = get().skills.find((s) => s.id === id);
        if (skill) void cancelReminders(skill.reminderNotificationIds);
        withSkill(id, (s) => {
          s.archivedAt = todayISO();
          s.reminderEnabled = false;
          s.reminderNotificationIds = [];
        });
      },

      unarchiveSkill: (id) =>
        withSkill(id, (s) => {
          s.archivedAt = undefined;
        }),

      setLevel: (skillId, level, afterMilestoneId) =>
        withSkill(skillId, (s) => {
          const from = s.currentLevel ?? s.startingLevel;
          if (from === level) return;
          s.levelHistory = [...(s.levelHistory ?? []), { id: genId('level'), date: todayISO(), from, to: level, afterMilestoneId }];
          s.currentLevel = level;
        }),

      addSubSkill: (skillId, name, level = 1) =>
        withSkill(skillId, (s) => {
          const trimmed = name.trim();
          if (!trimmed) return;
          if ((s.subSkills ?? []).some((x) => !x.archivedAt && x.name.toLowerCase() === trimmed.toLowerCase())) return;
          s.subSkills = [...(s.subSkills ?? []), { id: genId('subskill'), name: trimmed, level, createdAt: todayISO() }];
        }),

      renameSubSkill: (skillId, subSkillId, name) =>
        withSkill(skillId, (s) => {
          const sub = s.subSkills?.find((x) => x.id === subSkillId);
          if (sub && name.trim()) sub.name = name.trim();
        }),

      setSubSkillLevel: (skillId, subSkillId, level) =>
        withSkill(skillId, (s) => {
          const sub = s.subSkills?.find((x) => x.id === subSkillId);
          if (sub) sub.level = level;
        }),

      archiveSubSkill: (skillId, subSkillId) =>
        withSkill(skillId, (s) => {
          const sub = s.subSkills?.find((x) => x.id === subSkillId);
          if (sub) sub.archivedAt = todayISO();
        }),

      unarchiveSubSkill: (skillId, subSkillId) =>
        withSkill(skillId, (s) => {
          const sub = s.subSkills?.find((x) => x.id === subSkillId);
          if (sub) sub.archivedAt = undefined;
        }),

      addMetric: (skillId, def, role) => {
        const skill = get().skills.find((s) => s.id === skillId);
        if (!skill) return undefined;
        const active = (skill.metrics ?? []).filter((m) => !m.archivedAt);
        if (role === 'extra' && active.filter((m) => m.role === 'extra').length >= MAX_EXTRA_METRICS) return undefined;
        const metric = newMetric(def, role);
        withSkill(skillId, (s) => {
          if (role === 'primary') {
            (s.metrics ?? []).forEach((m) => {
              if (m.role === 'primary' && !m.archivedAt) m.archivedAt = todayISO();
            });
          }
          s.metrics = [...(s.metrics ?? []), metric];
        });
        return metric.id;
      },

      redefineMetric: (skillId, metricId, def) => {
        const old = get().skills.find((s) => s.id === skillId)?.metrics?.find((m) => m.id === metricId);
        if (!old) return undefined;
        const metric = newMetric(def, old.role);
        withSkill(skillId, (s) => {
          const m = s.metrics?.find((x) => x.id === metricId);
          if (m) m.archivedAt = todayISO();
          s.metrics = [...(s.metrics ?? []), metric];
        });
        return metric.id;
      },

      archiveMetric: (skillId, metricId) =>
        withSkill(skillId, (s) => {
          const m = s.metrics?.find((x) => x.id === metricId);
          if (m) m.archivedAt = todayISO();
        }),

      addMilestone: (skillId, text, targetDate) =>
        withSkill(skillId, (s) => {
          const trimmed = text.trim();
          if (trimmed) s.milestones.push({ id: genId('milestone'), text: trimmed, achieved: false, targetDate });
        }),

      toggleMilestone: (skillId, milestoneId) =>
        withSkill(skillId, (s) => {
          const m = s.milestones.find((x) => x.id === milestoneId);
          if (!m) return;
          m.achieved = !m.achieved;
          m.achievedAt = m.achieved ? todayISO() : undefined;
        }),

      achieveMilestone: (skillId, milestoneId, details) =>
        withSkill(skillId, (s) => {
          const m = s.milestones.find((x) => x.id === milestoneId);
          if (!m) return;
          m.achieved = true;
          m.achievedAt = todayISO();
          m.reflection = details?.reflection?.trim() || undefined;
          m.proofPhotoUri = details?.proofPhotoUri;
        }),

      deleteMilestone: (skillId, milestoneId) =>
        withSkill(skillId, (s) => {
          s.milestones = s.milestones.filter((m) => m.id !== milestoneId);
        }),

      addResource: (skillId, name, type, linkOrNote) =>
        withSkill(skillId, (s) => {
          if (!name.trim()) return;
          s.resources = [
            ...(s.resources ?? []),
            { id: genId('resource'), name: name.trim(), type, linkOrNote: linkOrNote?.trim() || undefined, status: 'notStarted', createdAt: todayISO() },
          ];
        }),

      setResourceStatus: (skillId, resourceId, status) =>
        withSkill(skillId, (s) => {
          const r = s.resources?.find((x) => x.id === resourceId);
          if (!r) return;
          r.status = status;
          r.doneAt = status === 'done' ? r.doneAt ?? todayISO() : undefined;
        }),

      deleteResource: (skillId, resourceId) =>
        withSkill(skillId, (s) => {
          s.resources = (s.resources ?? []).filter((x) => x.id !== resourceId);
        }),

      setReminder: async (skillId, time, enabled) => {
        const skill = get().skills.find((s) => s.id === skillId);
        if (!skill) return;
        await cancelReminders(skill.reminderNotificationIds);
        const ids =
          time && enabled
            ? await scheduleReminder({
                feature: 'habits',
                title: `Time to practice ${skill.name}`,
                date: todayISO(),
                scheduledTime: time,
                minutesBefore: 0,
                repeat: 'daily',
              })
            : [];
        withSkill(skillId, (s) => {
          s.reminderTime = time;
          s.reminderEnabled = enabled;
          s.reminderNotificationIds = ids;
        });
      },

      addSession: (skillId, input) => {
        const id = genId('practice');
        // A timed session belongs to the local day it *started* — one that
        // runs past midnight still counts toward the day (and week) it began.
        const date = input.date ?? (input.startedAt ? toISODate(new Date(input.startedAt)) : todayISO());
        const metricValues = Object.fromEntries(Object.entries(input.metricValues ?? {}).filter(([, v]) => Number.isFinite(v)));
        set((state) => {
          state.sessions.unshift({
            id,
            skillId,
            date,
            minutes: Math.max(0, Math.round(input.minutes)),
            notes: input.notes?.trim() || undefined,
            photoUri: input.photoUri,
            hasVoiceMemo: !!input.hasVoiceMemo,
            tag: input.tag,
            createdAt: new Date().toISOString(),
            startedAt: input.startedAt,
            focusSubSkillIds: input.focusSubSkillIds?.length ? input.focusSubSkillIds : undefined,
            difficulty: input.difficulty,
            metricValues: Object.keys(metricValues).length ? metricValues : undefined,
            struggledSubSkillIds: input.struggledSubSkillIds?.length ? input.struggledSubSkillIds : undefined,
            struggledText: input.struggledText?.trim() || undefined,
            breakthrough: input.breakthrough || undefined,
            feedback: input.feedback?.text.trim() ? { from: input.feedback.from, text: input.feedback.text.trim() } : undefined,
          });
        });
        return id;
      },

      deleteSession: (id) =>
        set((state) => {
          state.sessions = state.sessions.filter((s) => s.id !== id);
        }),
    };
  })
);

// --- Pure helpers — kept for Recap and existing callers. ---

// Kept only as a small secondary "practice rhythm" stat — never the headline
// for Skills (that's Habits' job).
export function skillPracticeStreak(sessions: PracticeSession[], skillId: string, today: string): number {
  const dates = new Set(sessions.filter((s) => s.skillId === skillId).map((s) => s.date));
  let streak = 0;
  let cursor = today;
  while (dates.has(cursor)) {
    streak += 1;
    cursor = addDaysISO(cursor, -1);
  }
  return streak;
}

export function totalPracticeMinutes(sessions: PracticeSession[], skillId: string): number {
  return sessions.filter((s) => s.skillId === skillId).reduce((sum, s) => sum + s.minutes, 0);
}

export function sessionsForSkill(sessions: PracticeSession[], skillId: string): PracticeSession[] {
  return sessions.filter((s) => s.skillId === skillId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// Deterministic by ISO week number, among sessions at least 14 days old, so
// the same one resurfaces all week rather than reshuffling on every render —
// same pattern as Books' weeklyResurfacedQuote.
export function resurfaceOldSession(sessions: PracticeSession[], skillId: string, today: string): PracticeSession | undefined {
  const cutoff = addDaysISO(today, -14);
  const eligible = sessions.filter((s) => s.skillId === skillId && s.date <= cutoff);
  if (eligible.length === 0) return undefined;
  const d = new Date(`${today}T00:00:00`);
  // Calendar weeks since 1 January (DST can't move the change to another day).
  const weekNumber = Math.floor(dayOfYear(toISODate(d)) / 7);
  const sorted = [...eligible].sort((a, b) => a.id.localeCompare(b.id));
  return sorted[weekNumber % sorted.length];
}

export function buildSkillHeatmapCounts(sessions: PracticeSession[], skillId: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of sessions) {
    if (s.skillId !== skillId) continue;
    counts[s.date] = (counts[s.date] ?? 0) + 1;
  }
  return counts;
}
