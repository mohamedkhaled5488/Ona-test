import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TextInput } from '../components/TextInput';
import { Card } from '../components/Card';
import { ScreenTitle, Body, Caption, Eyebrow } from '../components/Typography';
import { StatRow, InsightCard, DashboardSectionLabel } from '../components/AnalysisParts';
import { PrimaryButton } from '../components/PrimaryButton';
import { useUi } from '../components/UiProvider';
import { shareHabitReportAsText, exportHabitReportAsPdf } from '../utils/habitExport';
import { colors, fonts, radii, spacing } from '../theme';
import { sectionAccents } from '../theme/accents';
import { zoneMeta } from '../data/feelingsWheel';
import { useHabitsStore, habitStreak } from '../store/useHabitsStore';
import { completionRate, expectedCompletions, frequencyLabel } from '../utils/habitFrequency';
import { useFeelingsStore } from '../store/useFeelingsStore';
import { todayISO, formatDisplayDate } from '../utils/date';
import { buildDayStatuses, milestoneBar, patternRange, weeklyCompletion, type BuildDayStatus, type PatternRange } from '../utils/habitPattern';
import { habitTimeOfDay } from '../utils/habitTimeOfDay';
import { BUILD_COLORS, DayStrip, MilestoneBarView, RangeChips, SOFT_MISSED, WeeklyLine } from './habits/HabitPattern';
import { withAlpha } from '../utils/color';
import {
  buildHabitAnalysisSummary,
  longestHabitStreak,
  mostSkippedReasonTag,
  mostSkippedWeekday,
  sessionMinutesByTimeOfDay,
  sessionLengthLines,
} from '../utils/habitStats';
import { themedStyles } from '../theme/runtime';
import { basedOn, itemFeelingInsight, zoneTally } from '../utils/feelingsInsights';

// Lazy for the same reason as in MoodCheckScreen: Skia's web backend must not
// evaluate before App.tsx has loaded CanvasKit.

const accent = sectionAccents.habitBuilder;
const STATUS_LABEL: Record<BuildDayStatus, string> = { done: 'Done', minimum: 'Minimum version', missed: 'Missed', none: 'No check-in', off: 'Not scheduled', future: '', before: '' };


// The Analysis dashboard for one Build habit — its own screen, opened from
// the habit's page. Same five-part skeleton as the Quit dashboard: stats,
// summary, chart, insights, full log (with a milestone timeline alongside).
export function BuildHabitAnalysisStage({ habitId, onBack, onOpenLog }: { habitId: string; onBack: () => void; onOpenLog: (date: string) => void }) {
  const habits = useHabitsStore((s) => s.habits);
  const checkIns = useHabitsStore((s) => s.checkIns);
  const feelingEntries = useFeelingsStore((s) => s.entries);
  const { showToast } = useUi();
  const [range, setRange] = useState<PatternRange>('month');
  const [search, setSearch] = useState('');

  const habit = habits.find((h) => h.id === habitId);
  const today = todayISO();

  const habitCheckIns = useMemo(() => checkIns.filter((c) => c.habitId === habitId), [checkIns, habitId]);
  const habitFeelings = useMemo(
    () => feelingEntries.filter((e) => e.source?.kind === 'habit' && e.source.refId === habitId),
    [feelingEntries, habitId]
  );

  if (!habit) {
    return (
      <>
        <Pressable onPress={onBack} style={styles.backLink}>
          <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
          <Caption> Back</Caption>
        </Pressable>
        <Body>This habit isn't in your list anymore.</Body>
      </>
    );
  }

  // Start wherever the history actually starts: a day can be checked in
  // retroactively from the calendar, before the habit was created.
  const earliestCheckIn = habitCheckIns.reduce((min, c) => (c.date < min ? c.date : min), habit.createdAt);
  const start = earliestCheckIn < habit.createdAt ? earliestCheckIn : habit.createdAt;
  // The pattern always covers the whole selected period.
  const period = patternRange(range, today, start);
  const days = buildDayStatuses(habit, checkIns, period.start, period.end, today);
  const weeks = weeklyCompletion(habit, checkIns, period.start, period.end, today);
  const looks = BUILD_COLORS(accent);

  // --- 1. Header stats ---
  const { current: currentStreak, unit } = habitStreak(checkIns, habitId, today, habit.frequency);
  const totalCompletions = habitCheckIns.filter((c) => c.done).length;
  // Success = share of what the schedule planned since the start, not of
  // every calendar day — a Mon/Wed/Fri habit done every Mon/Wed/Fri is 100%.
  const successRate = completionRate(checkIns, habitId, habit.frequency, habit.createdAt, today) ?? 0;
  const planned = Math.round(expectedCompletions(habit.frequency, habit.createdAt, today));
  const longest = longestHabitStreak(checkIns, habitId, habit.frequency);
  const unitWord = (n: number) => (unit === 'week' ? (n === 1 ? 'week' : 'weeks') : n === 1 ? 'day' : 'days');

  // --- 4. Insights ---
  const skipWeekday = mostSkippedWeekday(checkIns, habitId);
  const skipReason = mostSkippedReasonTag(checkIns, habitId);
  // From the first feeling: facts, then "so far", then "tends to".
  const feelingAfter = itemFeelingInsight(habitFeelings, 'after this habit');
  const feelingTop = zoneTally(habitFeelings)[0];
  const timeOfDay = habitTimeOfDay(checkIns, habitId);
  const sessionLines = sessionLengthLines(sessionMinutesByTimeOfDay(checkIns, habitId));
  const hasInsights = skipWeekday || skipReason || feelingAfter || timeOfDay.kind !== 'notEnough' || !!sessionLines;

  // --- 5. Full log ---
  const feelingByDate = new Map(habitFeelings.map((e) => [e.date, e]));
  const q = search.trim().toLowerCase();
  const log = [...habitCheckIns]
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter((c) => !q || c.note?.toLowerCase().includes(q) || formatDisplayDate(c.date).toLowerCase().includes(q));

  const bar = milestoneBar(habit, today);

  return (
    <>
      <Pressable onPress={onBack} style={styles.backLink}>
        <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
        <Caption> {habit.name}</Caption>
      </Pressable>
      <ScreenTitle>Analysis</ScreenTitle>
      <Caption style={styles.subtitle}>
        {habit.name} · {frequencyLabel(habit.frequency).toLowerCase()} · since {formatDisplayDate(start)}
      </Caption>

      <StatRow
        accent={accent}
        stats={[
          { value: String(currentStreak), label: `${unitWord(currentStreak)} current streak` },
          { value: String(totalCompletions), label: totalCompletions === 1 ? 'completion' : 'total completions' },
          { value: `${successRate}%`, label: `success rate · ${planned} planned` },
          { value: String(longest), label: `${unitWord(longest)} longest streak` },
        ]}
      />

      <Card style={styles.summaryCard}>
        <Body>{buildHabitAnalysisSummary(checkIns, feelingEntries, habitId, today) ?? 'Check in a few times and a summary of how this habit is going will show up here.'}</Body>
      </Card>

      <DashboardSectionLabel>Done and missed</DashboardSectionLabel>
      <Card style={styles.chartCard}>
        <RangeChips value={range} onChange={setRange} />
        <DayStrip
          days={days}
          colorFor={(st) => looks[st]}
          labelFor={(st) => STATUS_LABEL[st]}
          legend={[
            { key: 'done', label: 'Done', color: accent },
            ...(habit.minimumVersion ? [{ key: 'min', label: 'Minimum version', color: withAlpha(accent, 0.45) }] : []),
            { key: 'missed', label: 'Missed', color: SOFT_MISSED },
            { key: 'none', label: 'No check-in', color: colors.line, outline: true },
            ...(habit.frequency && habit.frequency.kind === 'weekdays' ? [{ key: 'off', label: 'Not scheduled', color: withAlpha(colors.line, 0.45) }] : []),
          ]}
        />
        <Caption style={styles.legend}>Each square is a day. A missed day pauses a streak; it never resets it.</Caption>
        <Eyebrow style={styles.subLabel}>Each week</Eyebrow>
        <WeeklyLine weeks={weeks} color={accent} />
        <Caption style={styles.legend}>The share of planned days you did it, week by week. Pinch to zoom, drag with two fingers to pan.</Caption>
      </Card>

      <DashboardSectionLabel>Milestones</DashboardSectionLabel>
      <Card style={styles.chartCard}>
        <MilestoneBarView bar={bar} color={accent} />
      </Card>

      <DashboardSectionLabel>Insights</DashboardSectionLabel>
      {!hasInsights && (
        <Caption style={styles.emptyText}>
          Patterns need at least 3 matching check-ins before they're worth calling a pattern — keep going and they'll show up here.
        </Caption>
      )}
      {feelingAfter && (
        <InsightCard
          kind="Feelings after"
          accent={feelingTop ? zoneMeta(feelingTop.zone).accent : accent}
          headline={feelingAfter.headline}
          evidence={[feelingAfter.detail, `${basedOn(feelingAfter.n)} logged after completing it.`].filter(Boolean).join(' ')}
        />
      )}
      {skipWeekday && (
        <InsightCard
          kind="Skip pattern"
          accent={SOFT_MISSED}
          headline={`${skipWeekday.weekday}s are when this most often gets skipped.`}
          evidence={`Missed on ${skipWeekday.count} of ${skipWeekday.logged} ${skipWeekday.weekday}s logged`}
        />
      )}
      {skipReason && (
        <InsightCard
          kind="Skip pattern"
          accent={SOFT_MISSED}
          headline={`"${skipReason.tag}" comes up most on the days this was missed.`}
          evidence={`Tagged on ${skipReason.count} of ${skipReason.missedTotal} missed days`}
        />
      )}
      {timeOfDay.kind !== 'notEnough' && (
        <InsightCard
          kind="Time of day"
          accent={accent}
          headline={timeOfDay.lines[0]}
          evidence={[...timeOfDay.lines.slice(1), `Based on ${timeOfDay.n} ${timeOfDay.kind === 'rates' ? 'check-ins with a planned time' : 'completions with a known time'}.`].join(' ')}
        />
      )}
      {sessionLines && <InsightCard kind="Session length" accent={accent} headline={sessionLines.headline} evidence={sessionLines.evidence} />}

      <DashboardSectionLabel>Full log</DashboardSectionLabel>
      {habitCheckIns.length === 0 ? (
        <Caption style={styles.emptyText}>Nothing logged yet.</Caption>
      ) : (
        <>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by date or note..."
            placeholderTextColor={colors.inkSoft}
            style={styles.searchInput}
          />
          <View style={styles.logList}>
            {log.map((c) => {
              const feeling = feelingByDate.get(c.date);
              return (
                <Pressable
                  key={c.id}
                  onPress={() => onOpenLog(c.date)}
                  accessibilityRole="button"
                  accessibilityLabel={`${formatDisplayDate(c.date)}, ${c.done ? (c.minimum ? 'minimum version' : 'done') : 'missed'}${c.note ? ', has a comment' : ''}. Open`}
                >
                <Card style={[styles.logCard, { borderLeftColor: c.done ? accent : SOFT_MISSED }]}>
                  <View style={styles.logHeader}>
                    <Body style={styles.flex}>{formatDisplayDate(c.date)}</Body>
                    {c.note ? <Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.inkSoft} style={styles.commentIcon} /> : null}
                    <Caption style={{ color: c.done ? accent : colors.inkSoft }}>{c.done ? (c.minimum ? 'Minimum version' : 'Done') : 'Missed'}</Caption>
                    <Ionicons name="chevron-forward" size={14} color={colors.inkSoft} />
                  </View>
                  {c.durationMinutes ? <Caption>Timed session: {c.durationMinutes} min</Caption> : null}
                  {feeling && <Caption style={{ color: zoneMeta(feeling.zone).accent }}>Felt {zoneMeta(feeling.zone).label}</Caption>}
                  {c.reasonTags && c.reasonTags.length > 0 && <Caption numberOfLines={1}>What got in the way: {c.reasonTags.join(', ')}</Caption>}
                  {c.note && (
                    <Caption style={styles.note} numberOfLines={2}>
                      "{c.note}"
                    </Caption>
                  )}
                </Card>
                </Pressable>
              );
            })}
            {log.length === 0 && <Caption style={styles.emptyText}>No check-ins match that search.</Caption>}
          </View>
        </>
      )}

      <DashboardSectionLabel>Export</DashboardSectionLabel>
      <Card style={styles.exportCard}>
        <Caption style={styles.legend}>The whole history — every check-in, note, photo, session and feeling.</Caption>
        <View style={styles.exportRow}>
          <PrimaryButton label="Share as text" variant="outline" style={styles.exportButton} onPress={() => shareHabitReportAsText(habit, checkIns, feelingEntries)} />
          <PrimaryButton
            label="Export as PDF"
            variant="outline"
            style={styles.exportButton}
            onPress={async () => {
              const result = await exportHabitReportAsPdf(habit, checkIns, feelingEntries);
              if (!result.ok && result.reason) showToast({ message: result.reason });
            }}
          />
        </View>
      </Card>
    </>
  );
}

const styles = themedStyles(() => ({
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    marginTop: 2,
    marginBottom: spacing.lg,
  },
  summaryCard: {
    marginBottom: spacing.xs,
  },
  chartCard: {
    gap: spacing.sm,
  },
  subLabel: { marginTop: spacing.md },
  flex: { flex: 1 },
  commentIcon: { marginRight: spacing.xs },
  chartLoading: {
    height: 220,
  },
  toggleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  toggleLabel: {
    color: colors.inkSoft,
    marginRight: spacing.xs,
  },
  toggleChip: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
  },
  toggleChipActive: {
    backgroundColor: accent,
    borderColor: accent,
  },
  toggleChipTextActive: {
    color: colors.white,
  },
  legend: {
    color: colors.inkSoft,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: radii.full,
    marginLeft: spacing.xs,
  },
  timeline: {
    paddingVertical: spacing.xs,
  },
  timelineItem: {
    width: 96,
    alignItems: 'center',
    gap: 2,
  },
  timelineTrackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: spacing.xs,
  },
  timelineConnector: {
    flex: 1,
    height: 2,
    backgroundColor: colors.line,
  },
  invisible: {
    opacity: 0,
  },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: radii.full,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  timelineLabel: {
    fontFamily: fonts.bodyMedium,
    textAlign: 'center',
  },
  unreached: {
    color: colors.inkSoft,
  },
  timelineDate: {
    color: colors.inkSoft,
    fontSize: 11,
  },
  emptyText: {
    color: colors.inkSoft,
    marginBottom: spacing.sm,
  },
  searchInput: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  logList: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  exportCard: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  exportRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  exportButton: {
    flex: 1,
  },
  logCard: {
    borderLeftWidth: 3,
    gap: 2,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  note: {
    fontStyle: 'italic',
  },
  logPhoto: {
    width: '100%',
    height: 140,
    borderRadius: radii.md,
    marginTop: spacing.xs,
  },
}));
