import { PlusLockCard } from '../components/PlusGate';
import { usePlus } from '../plans/access';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TextInput } from '../components/TextInput';
import { Card } from '../components/Card';
import { ScreenTitle, Body, Caption } from '../components/Typography';
import { StatRow, InsightCard, DashboardSectionLabel } from '../components/AnalysisParts';
import { PrimaryButton } from '../components/PrimaryButton';
import { useUi } from '../components/UiProvider';
import { shareQuitJourneyAsText, exportQuitJourneyAsPdf } from '../utils/habitExport';
import { patternRange, quitDayStatuses, type PatternRange, type QuitDayStatus } from '../utils/habitPattern';
import { quitTiming } from '../utils/habitTimeOfDay';
import { DayStrip, RangeChips, SOFT_MISSED } from './habits/HabitPattern';
import { withAlpha } from '../utils/color';
import { colors, fonts, radii, spacing } from '../theme';
import { sectionAccents } from '../theme/accents';
import { findFeeling, zoneMeta } from '../data/feelingsWheel';
import { useQuitHabitsStore, tracksForHabit, daysSinceTrackStart } from '../store/useQuitHabitsStore';
import { useFeelingsStore } from '../store/useFeelingsStore';
import { todayISO, formatDisplayDate } from '../utils/date';
import { daysBetweenISO, domainLabels } from '../utils/feelingsStats';
import {
  approachResults,
  quitAnalysisSummary,
  quitHeaderStats,
  quitJourneyLog,
  relapseReasonCounts,
  resistedUrgeTrend,
  type QuitLogEvent,
} from '../utils/habitStats';
import { themedStyles } from '../theme/runtime';

// Lazy for the same reason as in MoodCheckScreen: Skia's web backend must not
// evaluate before App.tsx has loaded CanvasKit.

const accent = sectionAccents.quitHabit;
const QUIT_LABEL: Record<QuitDayStatus, string> = { clean: 'Clean day', resisted: 'Resisted an urge', slip: 'Slip', between: 'Between tries', future: '', before: '' };
const QUIT_LOOKS: Record<QuitDayStatus, () => { fill: string; outline?: boolean } | null> = {
  clean: () => ({ fill: withAlpha(accent, 0.45) }),
  resisted: () => ({ fill: accent }),
  slip: () => ({ fill: SOFT_MISSED }),
  between: () => ({ fill: colors.line, outline: true }),
  future: () => ({ fill: withAlpha(colors.line, 0.5), outline: true }),
  before: () => null,
};



// The Analysis dashboard for one Quit habit — its own screen, opened from
// the habit's Journey. Same five-part skeleton as the Build dashboard, but
// spanning the whole journey (every track), not just the current one.
export function QuitHabitAnalysisStage({ habitId, onBack }: { habitId: string; onBack: () => void }) {
  const habits = useQuitHabitsStore((s) => s.habits);
  const tracks = useQuitHabitsStore((s) => s.tracks);
  const feelingEntries = useQuitHabitsStore((s) => s.feelingEntries);
  const personalFeelings = useFeelingsStore((s) => s.personalFeelings);
  const { showToast } = useUi();
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<PatternRange>('month');

  const habit = habits.find((h) => h.id === habitId);
  const today = todayISO();

  if (!habit) {
    return (
      <>
        <Pressable onPress={onBack} style={styles.backLink}>
          <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
          <Caption> Back</Caption>
        </Pressable>
        <Body>This one isn't in your list anymore.</Body>
      </>
    );
  }

  const ordered = [...tracksForHabit(tracks, habitId)];
  const journeyStart = ordered.reduce((min, t) => (t.startDate < min ? t.startDate : min), ordered[0]?.startDate ?? today);
  const totalDays = daysBetweenISO(journeyStart, today) + 1;
  // At least a week of axis so a new journey's first days aren't pinned into
  // the corner of a one-slot chart.
  const chartSlots = Math.max(7, totalDays);

  // --- 1. Header stats ---
  const header = quitHeaderStats(tracks, feelingEntries, habitId, today);

  // --- 3. The journey, day by day (a slip stays part of it; nothing drops to zero) ---
  const period = patternRange(range, today, journeyStart);
  const days = quitDayStatuses(habitId, tracks, feelingEntries, period.start, period.end, today);

  // --- 4. Insights ---
  const approaches = approachResults(feelingEntries, tracks, habitId);
  const triggers = relapseReasonCounts(tracks, habitId);
  const timing = quitTiming(feelingEntries, tracks, habitId);
  const trend = resistedUrgeTrend(feelingEntries, tracks, habitId, today);
  const plus = usePlus();
  const hasInsights = approaches.length > 0 || triggers.length > 0 || timing || trend.direction;

  // --- 5. Full log ---
  const q = search.trim().toLowerCase();
  const log = quitJourneyLog(tracks, feelingEntries, habitId).filter((e) => !q || logSearchText(e, personalFeelings).includes(q));

  return (
    <>
      <Pressable onPress={onBack} style={styles.backLink}>
        <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
        <Caption> {habit.name}</Caption>
      </Pressable>
      <ScreenTitle>Analysis</ScreenTitle>
      <Caption style={styles.subtitle}>{habit.name} · the whole journey since {formatDisplayDate(journeyStart)}</Caption>

      <StatRow
        accent={accent}
        stats={[
          {
            value: header.currentDays > 0 ? String(header.currentDays) : '—',
            label: header.currentDays === 0 ? 'no active track' : header.currentDays === 1 ? 'day on this track' : 'days on this track',
          },
          { value: String(header.resistedTotal), label: header.resistedTotal === 1 ? 'urge resisted' : 'urges resisted' },
          { value: String(header.longestDays), label: header.longestDays === 1 ? 'day longest stretch' : 'days longest stretch' },
          { value: String(header.trackCount), label: header.trackCount === 1 ? 'track so far' : 'tracks so far' },
        ]}
      />

      <Card style={styles.summaryCard}>
        <Body>{quitAnalysisSummary(tracks, feelingEntries, habitId, today) ?? 'Start a track and a summary of your journey will show up here.'}</Body>
      </Card>

      <DashboardSectionLabel>Your journey over time</DashboardSectionLabel>
      <Card style={styles.chartCard}>
        <RangeChips value={range} onChange={setRange} />
        <DayStrip
          days={days}
          colorFor={(st) => QUIT_LOOKS[st]()}
          labelFor={(st) => QUIT_LABEL[st]}
          legend={[
            { key: 'clean', label: 'Clean day', color: withAlpha(accent, 0.45) },
            { key: 'resisted', label: 'Resisted an urge', color: accent },
            { key: 'slip', label: 'Slip (part of the journey)', color: SOFT_MISSED },
            { key: 'between', label: 'Between tries', color: colors.line, outline: true },
          ]}
        />
        <Caption style={styles.legend}>Each square is a day. A slip is part of the story, not a reset: every day before it still counts.</Caption>
      </Card>

      <DashboardSectionLabel>Every track</DashboardSectionLabel>
      <Card style={styles.journeyCard}>
        <View style={styles.journeyStrip}>
          {ordered.map((t, i) => {
            const left = (daysBetweenISO(journeyStart, t.startDate) / totalDays) * 100;
            const width = Math.max(1.5, (daysSinceTrackStart(t, today) / totalDays) * 100);
            return (
              <View
                key={t.id}
                style={[
                  styles.journeySegment,
                  { left: `${left}%`, width: `${Math.min(width, 100 - left)}%`, backgroundColor: t.status === 'active' ? accent : withOpacity(accent, i) },
                ]}
              />
            );
          })}
        </View>
        <View style={styles.journeyAxis}>
          <Caption style={styles.legend}>{formatDisplayDate(journeyStart)}</Caption>
          <Caption style={styles.legend}>Today</Caption>
        </View>
        <View style={styles.trackList}>
          {ordered.map((t, i) => (
            <View key={t.id} style={styles.trackRow}>
              <View style={[styles.trackMarker, { backgroundColor: t.status === 'active' ? accent : colors.line }]} />
              <View style={styles.trackRowText}>
                <Body>
                  Track {i + 1} · {daysSinceTrackStart(t, today)} {daysSinceTrackStart(t, today) === 1 ? 'day' : 'days'}
                </Body>
                <Caption>
                  {formatDisplayDate(t.startDate)} – {t.endDate ? formatDisplayDate(t.endDate) : 'ongoing'}
                </Caption>
              </View>
            </View>
          ))}
        </View>
      </Card>

      <DashboardSectionLabel>Insights</DashboardSectionLabel>
      {/* Plus: the patterns. The journey, every track, the log and export stay in Essentials mode. */}
      {!plus && <PlusLockCard feature="quitAnalysisFull" />}
      {plus && !hasInsights && (
        <Caption style={styles.emptyText}>
          Patterns need at least 3 matching moments before they're worth calling a pattern — they'll show up here as your journey goes on.
        </Caption>
      )}
      {plus && approaches.length > 0 && (
        <InsightCard
          kind="How each approach went"
          accent={colors.amber}
          headline={approaches.map((a) => `${a.approach}: passed ${a.passedCount} of ${a.totalCount}`).join(' · ')}
          evidence="How many times the urge passed after choosing each approach, out of the times you chose it."
        />
      )}
      {plus && triggers.length > 0 && (
        <InsightCard
          kind="What was going on"
          accent={SOFT_MISSED}
          headline={triggers.map((t) => `${t.tag} ${t.count}`).join(' · ')}
          evidence="How many times each reason was tagged when a try ended. A try can have more than one."
        />
      )}
      {plus && timing && (
        <InsightCard kind="Time of day" accent={accent} headline={timing.lines[0]} evidence={`Based on ${timing.n} logged ${timing.n === 1 ? 'moment' : 'moments'} (urges resisted and slips).`} />
      )}
      {plus && trend.direction && trend.currentRatio != null && (
        <InsightCard
          kind="Resisted vs. went back"
          accent={accent}
          headline={
            trend.direction === 'same'
              ? 'Resisting about as often as last month.'
              : `Resisting ${trend.direction} often than last month.`
          }
          evidence={`${Math.round(trend.currentRatio * 100)}% of documented urges resisted in the last 30 days${
            trend.previousRatio != null ? `, vs. ${Math.round(trend.previousRatio * 100)}% the 30 days before` : ''
          }`}
        />
      )}

      <DashboardSectionLabel>Full log</DashboardSectionLabel>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search notes, feelings, dates..."
        placeholderTextColor={colors.inkSoft}
        style={styles.searchInput}
      />
      <View style={styles.logList}>
        {log.map((e) => (
          <LogRow key={`${e.kind}-${e.at}-${e.kind === 'feeling' ? e.entry.id : e.trackNumber}`} event={e} personalFeelings={personalFeelings} />
        ))}
        {log.length === 0 && <Caption style={styles.emptyText}>{q ? 'Nothing matches that search.' : 'Nothing logged yet.'}</Caption>}
      </View>

      <DashboardSectionLabel>Export</DashboardSectionLabel>
      <Card style={styles.exportCard}>
        <Caption style={styles.legend}>The whole journey: every track, slip, resisted urge, feeling and note.</Caption>
        <View style={styles.exportRow}>
          <PrimaryButton
            label="Share as text"
            variant="outline"
            style={styles.exportButton}
            onPress={() => shareQuitJourneyAsText(habit, tracks, feelingEntries, personalFeelings, today)}
          />
          <PrimaryButton
            label="Export as PDF"
            variant="outline"
            style={styles.exportButton}
            onPress={async () => {
              const result = await exportQuitJourneyAsPdf(habit, tracks, feelingEntries, personalFeelings, today);
              if (!result.ok && result.reason) showToast({ message: result.reason });
            }}
          />
        </View>
      </Card>
    </>
  );
}

function feelingName(id: string | undefined, personal: { id: string; name: string }[]): string {
  if (!id) return '';
  return findFeeling(id)?.name ?? personal.find((p) => p.id === id)?.name ?? 'Feeling';
}

function logSearchText(e: QuitLogEvent, personal: { id: string; name: string }[]): string {
  const parts = [formatDisplayDate(e.date), `track ${e.trackNumber}`];
  if (e.kind === 'trackEnd') parts.push('went back to it', e.reflection ?? '', ...(e.reasonTags ?? []));
  if (e.kind === 'trackStart') parts.push('started');
  if (e.kind === 'feeling') {
    parts.push(feelingName(e.entry.feelingId, personal), e.entry.note ?? '', e.entry.approach ?? '');
    if (e.entry.isResistedUrge) parts.push('resisted urge craving');
  }
  return parts.join(' ').toLowerCase();
}

function LogRow({ event: e, personalFeelings }: { event: QuitLogEvent; personalFeelings: { id: string; name: string }[] }) {
  if (e.kind === 'trackStart') {
    return (
      <Card style={[styles.logCard, { borderLeftColor: accent }]}>
        <View style={styles.logHeader}>
          <Body>Track {e.trackNumber} started</Body>
          <Caption>{formatDisplayDate(e.date)}</Caption>
        </View>
      </Card>
    );
  }
  if (e.kind === 'trackEnd') {
    return (
      <Card style={[styles.logCard, { borderLeftColor: SOFT_MISSED }]}>
        <View style={styles.logHeader}>
          <Body style={{ color: SOFT_MISSED }}>Went back to it</Body>
          <Caption>{formatDisplayDate(e.date)}</Caption>
        </View>
        <Caption>
          Track {e.trackNumber} ended after {e.days} {e.days === 1 ? 'day' : 'days'}
        </Caption>
        {e.reasonTags && e.reasonTags.length > 0 && <Caption>What was going on: {e.reasonTags.join(', ')}</Caption>}
        {e.reflection && <Caption style={styles.note}>"{e.reflection}"</Caption>}
      </Card>
    );
  }
  const entry = e.entry;
  const meta = entry.zone ? zoneMeta(entry.zone) : undefined;
  const kindLabel = entry.isResistedUrge ? 'Resisted an urge' : entry.isRelapseMoment ? 'Felt, as the track ended' : 'Checked in';
  return (
    <Card style={[styles.logCard, { borderLeftColor: entry.isResistedUrge ? colors.amber : meta?.accent ?? colors.line }]}>
      <View style={styles.logHeader}>
        <Body style={entry.isResistedUrge ? { color: colors.amber } : undefined}>{kindLabel}</Body>
        <Caption>{formatDisplayDate(e.date)}</Caption>
      </View>
      {meta && <Caption style={{ color: meta.accent }}>Felt {feelingName(entry.feelingId, personalFeelings) || meta.label}</Caption>}
      {entry.isResistedUrge && entry.approach && (
        <Caption>
          {entry.approach}
          {entry.urgePassed === true ? ' · the urge passed' : entry.urgePassed === false ? " · didn't act on it" : ''}
        </Caption>
      )}
      {entry.note && <Caption style={styles.note}>"{entry.note}"</Caption>}
      <Caption style={styles.trackTag}>Track {e.trackNumber}</Caption>
    </Card>
  );
}

// Earlier tracks fade a little so the active one reads first.
function withOpacity(color: string, index: number): string {
  const alpha = Math.max(0.35, 0.7 - index * 0.08);
  const hex = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return color.length === 7 ? `${color}${hex}` : color;
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
  legend: {
    color: colors.inkSoft,
  },
  journeyCard: {
    gap: spacing.sm,
  },
  journeyStrip: {
    height: 18,
    borderRadius: radii.full,
    backgroundColor: colors.line,
    overflow: 'hidden',
    position: 'relative',
  },
  journeySegment: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: radii.full,
  },
  journeyAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  trackList: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  trackMarker: {
    width: 10,
    height: 10,
    borderRadius: radii.full,
  },
  trackRowText: {
    flex: 1,
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
  trackTag: {
    color: colors.inkSoft,
    fontSize: 11,
  },
}));
