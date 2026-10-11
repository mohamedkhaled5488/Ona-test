import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TextInput } from '../components/TextInput';
import { Card } from '../components/Card';
import { ScreenTitle, Body, Caption } from '../components/Typography';
import { StatRow, InsightCard, DashboardSectionLabel } from '../components/AnalysisParts';
import { PrimaryButton } from '../components/PrimaryButton';
import { useUi } from '../components/UiProvider';
import { shareHabitReportAsText, exportHabitReportAsPdf } from '../utils/habitExport';
import type { PositionedPoint } from '../components/FeelingsGraph';
import { colors, fonts, radii, spacing } from '../theme';
import { sectionAccents } from '../theme/accents';
import { zoneMeta } from '../data/feelingsWheel';
import { useHabitsStore, habitStreak } from '../store/useHabitsStore';
import { completionRate, expectedCompletions, frequencyLabel } from '../utils/habitFrequency';
import { useFeelingsStore } from '../store/useFeelingsStore';
import { todayISO, formatDisplayDate } from '../utils/date';
import { dailyTrendPoints, domainLabels, type TrendDimension } from '../utils/feelingsStats';
import {
  buildHabitAnalysisSummary,
  completionByTimeOfDay,
  completionFeelingZone,
  completionSeries,
  habitMilestones,
  longestHabitStreak,
  mostSkippedReasonTag,
  mostSkippedWeekday,
  sessionMinutesByTimeOfDay,
} from '../utils/habitStats';
import { themedStyles } from '../theme/runtime';

// Lazy for the same reason as in MoodCheckScreen: Skia's web backend must not
// evaluate before App.tsx has loaded CanvasKit.
const FeelingsGraph = React.lazy(() => import('../components/FeelingsGraph').then((m) => ({ default: m.FeelingsGraph })));

const accent = sectionAccents.habitBuilder;
const MISSED = '#B3413A';

type Overlay = 'off' | TrendDimension;

// The Analysis dashboard for one Build habit — its own screen, opened from
// the habit's page. Same five-part skeleton as the Quit dashboard: stats,
// summary, chart, insights, full log (with a milestone timeline alongside).
export function BuildHabitAnalysisStage({ habitId, onBack }: { habitId: string; onBack: () => void }) {
  const habits = useHabitsStore((s) => s.habits);
  const checkIns = useHabitsStore((s) => s.checkIns);
  const feelingEntries = useFeelingsStore((s) => s.entries);
  const { showToast } = useUi();
  const [overlay, setOverlay] = useState<Overlay>('pleasantness');
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

  // Start the chart wherever the history actually starts — a day can be
  // checked in retroactively from the calendar, before the habit was created.
  const earliestCheckIn = habitCheckIns.reduce((min, c) => (c.date < min ? c.date : min), habit.createdAt);
  const start = earliestCheckIn < habit.createdAt ? earliestCheckIn : habit.createdAt;
  const series = completionSeries(checkIns, habitId, start, today, 7, habit.frequency);
  const dates = series.map((d) => d.date);
  // At least a week of axis, so a brand-new habit's first point isn't pinned
  // into the corner of a one-slot chart; the days after today simply stay
  // empty until they happen.
  const domainSlots = Math.max(7, series.length);
  const labels = domainLabels(start, domainSlots, 'day');

  // --- 1. Header stats ---
  const { current: currentStreak, unit } = habitStreak(checkIns, habitId, today, habit.frequency);
  const totalCompletions = habitCheckIns.filter((c) => c.done).length;
  // Success = share of what the schedule planned since the start, not of
  // every calendar day — a Mon/Wed/Fri habit done every Mon/Wed/Fri is 100%.
  const successRate = completionRate(checkIns, habitId, habit.frequency, habit.createdAt, today) ?? 0;
  const planned = Math.round(expectedCompletions(habit.frequency, habit.createdAt, today));
  const longest = longestHabitStreak(checkIns, habitId, habit.frequency);
  const unitWord = (n: number) => (unit === 'week' ? (n === 1 ? 'week' : 'weeks') : n === 1 ? 'day' : 'days');

  // --- 3. Chart ---
  const points: PositionedPoint[] = series.flatMap((d, i) =>
    d.rate == null
      ? [] // nothing planned yet in this window — a gap, not a 0%
      : [
          {
            key: d.date,
            date: d.date,
            score: d.rate,
            domainIndex: i,
            color: d.status === 'missed' ? MISSED : accent,
            radius: d.status === 'done' || d.status === 'missed' ? 4 : 0,
            label: `${d.status === 'done' ? 'Done' : d.status === 'missed' ? 'Missed' : d.status === 'off' ? 'Off schedule' : 'No check-in'} · ${d.rate}% of planned, last 7 days`,
          },
        ]
  );
  const overlayPoints: PositionedPoint[] | undefined =
    overlay === 'off'
      ? undefined
      : dailyTrendPoints(habitFeelings, dates, overlay).map((p) => ({
          ...p,
          // Same chart, one y-axis: the -2..2 feeling score is drawn on the
          // 0..100 scale (top = most pleasant / most energized).
          score: ((p.score + 2) / 4) * 100,
          domainIndex: dates.indexOf(p.date),
          label: `Felt ${zoneMeta(p.zone).label}`,
        }));

  // --- 4. Insights ---
  const skipWeekday = mostSkippedWeekday(checkIns, habitId);
  const skipReason = mostSkippedReasonTag(checkIns, habitId);
  const feelingStat = completionFeelingZone(feelingEntries, habitId);
  const timeOfDay = completionByTimeOfDay(checkIns, habitId);
  const sessionTimes = sessionMinutesByTimeOfDay(checkIns, habitId);
  const hasInsights = skipWeekday || skipReason || feelingStat || timeOfDay.length > 0 || sessionTimes.length > 0;

  // --- 5. Full log ---
  const feelingByDate = new Map(habitFeelings.map((e) => [e.date, e]));
  const q = search.trim().toLowerCase();
  const log = [...habitCheckIns]
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter((c) => !q || c.note?.toLowerCase().includes(q) || formatDisplayDate(c.date).toLowerCase().includes(q));

  const milestones = habitMilestones(habit, today);

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

      <DashboardSectionLabel>Completion over time</DashboardSectionLabel>
      <Card style={styles.chartCard}>
        <View style={styles.toggleRow}>
          <Caption style={styles.toggleLabel}>Feeling overlay</Caption>
          {(['off', 'pleasantness', 'energy'] as const).map((o) => (
            <Pressable key={o} onPress={() => setOverlay(o)} style={[styles.toggleChip, overlay === o && styles.toggleChipActive]}>
              <Caption style={overlay === o ? styles.toggleChipTextActive : undefined}>{o === 'off' ? 'Off' : o === 'pleasantness' ? 'Pleasantness' : 'Energy'}</Caption>
            </Pressable>
          ))}
        </View>
        <React.Suspense fallback={<View style={styles.chartLoading} />}>
          <FeelingsGraph
            points={points}
            comparePoints={overlayPoints}
            compareDots
            domainSlots={domainSlots}
            formatLabel={(i) => labels[i] ?? ''}
            yDomain={[0, 100]}
            baselineAt={50}
            lineColor={accent}
            height={220}
          />
        </React.Suspense>
        <View style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: accent }]} />
          <Caption style={styles.legend}>Done</Caption>
          <View style={[styles.legendDot, { backgroundColor: MISSED }]} />
          <Caption style={styles.legend}>Missed</Caption>
        </View>
        <Caption style={styles.legend}>
          The line is the share of the last 7 days you completed it.
          {overlay !== 'off' &&
            ` The dashed line is how you felt after it (higher = more ${overlay === 'pleasantness' ? 'pleasant' : 'energized'})${habitFeelings.length === 0 ? ' — no feelings logged for this habit yet' : ''}.`}
        </Caption>
        <Caption style={styles.legend}>Pinch to zoom, drag with two fingers to pan.</Caption>
      </Card>

      <DashboardSectionLabel>Milestones</DashboardSectionLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeline}>
        {milestones.map((m, i) => (
          <View key={`${m.label}-${m.day}`} style={styles.timelineItem}>
            <View style={styles.timelineTrackRow}>
              <View style={[styles.timelineConnector, i === 0 && styles.invisible, m.reached && { backgroundColor: accent }]} />
              <View style={[styles.timelineDot, m.reached ? { backgroundColor: accent, borderColor: accent } : null]} />
              <View style={[styles.timelineConnector, i === milestones.length - 1 && styles.invisible, milestones[i + 1]?.reached && { backgroundColor: accent }]} />
            </View>
            <Body style={[styles.timelineLabel, !m.reached && styles.unreached]}>{m.label}</Body>
            <Caption style={styles.timelineDate}>Day {m.day}</Caption>
            <Caption style={styles.timelineDate}>{formatDisplayDate(m.date)}</Caption>
          </View>
        ))}
      </ScrollView>

      <DashboardSectionLabel>Insights</DashboardSectionLabel>
      {!hasInsights && (
        <Caption style={styles.emptyText}>
          Patterns need at least 3 matching check-ins before they're worth calling a pattern — keep going and they'll show up here.
        </Caption>
      )}
      {feelingStat && (
        <InsightCard
          kind="How it tends to feel"
          accent={zoneMeta(feelingStat.zone).accent}
          headline={`You usually feel ${zoneMeta(feelingStat.zone).label} after this habit.`}
          evidence={`${feelingStat.count} of ${feelingStat.total} feelings logged after completing it`}
        />
      )}
      {skipWeekday && (
        <InsightCard
          kind="Skip pattern"
          accent={MISSED}
          headline={`${skipWeekday.weekday}s are when this most often gets skipped.`}
          evidence={`Missed on ${skipWeekday.count} ${skipWeekday.weekday}s`}
        />
      )}
      {skipReason && (
        <InsightCard
          kind="Skip pattern"
          accent={MISSED}
          headline={`${skipReason.tag} is your strongest link to skipping this.`}
          evidence={`Tagged on ${skipReason.count} missed days`}
        />
      )}
      {timeOfDay.length > 0 && (
        <InsightCard
          kind="Time of day"
          accent={accent}
          headline={
            timeOfDay.length > 1
              ? `Checked in ${timeOfDay[0].bucket}, you complete it ${timeOfDay[0].completionRate}% of the time — vs. ${timeOfDay[timeOfDay.length - 1].completionRate}% ${timeOfDay[timeOfDay.length - 1].bucket}.`
              : `Checked in ${timeOfDay[0].bucket}, you complete it ${timeOfDay[0].completionRate}% of the time.`
          }
          evidence={timeOfDay.map((t) => `${t.bucket}: ${t.count} check-ins`).join(' · ')}
        />
      )}
      {sessionTimes.length > 0 && (
        <InsightCard
          kind="Session length"
          accent={accent}
          headline={`Your ${sessionTimes[0].bucket} sessions run longest — ${sessionTimes[0].averageMinutes} min on average.`}
          evidence={sessionTimes.map((t) => `${t.bucket}: ${t.averageMinutes} min over ${t.count} sessions`).join(' · ')}
        />
      )}

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
                <Card key={c.id} style={[styles.logCard, { borderLeftColor: c.done ? accent : MISSED }]}>
                  <View style={styles.logHeader}>
                    <Body>{formatDisplayDate(c.date)}</Body>
                    <Caption style={{ color: c.done ? accent : MISSED }}>{c.done ? 'Done' : 'Missed'}</Caption>
                  </View>
                  {c.durationMinutes ? <Caption>Timed session: {c.durationMinutes} min</Caption> : null}
                  {feeling && <Caption style={{ color: zoneMeta(feeling.zone).accent }}>Felt {zoneMeta(feeling.zone).label}</Caption>}
                  {c.reasonTags && c.reasonTags.length > 0 && <Caption>What got in the way: {c.reasonTags.join(', ')}</Caption>}
                  {c.note && <Caption style={styles.note}>"{c.note}"</Caption>}
                  {c.photoUri && <Image source={{ uri: c.photoUri }} style={styles.logPhoto} resizeMode="cover" />}
                </Card>
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
