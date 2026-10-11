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
import type { PositionedPoint } from '../components/FeelingsGraph';
import { colors, fonts, radii, spacing } from '../theme';
import { sectionAccents } from '../theme/accents';
import { findFeeling, zoneMeta } from '../data/feelingsWheel';
import { useQuitHabitsStore, tracksForHabit, daysSinceTrackStart } from '../store/useQuitHabitsStore';
import { useFeelingsStore } from '../store/useFeelingsStore';
import { todayISO, formatDisplayDate } from '../utils/date';
import { daysBetweenISO, domainLabels } from '../utils/feelingsStats';
import {
  bestApproachForHabit,
  quitAnalysisSummary,
  quitHeaderStats,
  quitJourneyLog,
  quitJourneySeries,
  relapseTriggerRanking,
  resistedUrgeTrend,
  urgeTimeOfDayPattern,
  type QuitLogEvent,
} from '../utils/habitStats';
import { themedStyles } from '../theme/runtime';

// Lazy for the same reason as in MoodCheckScreen: Skia's web backend must not
// evaluate before App.tsx has loaded CanvasKit.
const FeelingsGraph = React.lazy(() => import('../components/FeelingsGraph').then((m) => ({ default: m.FeelingsGraph })));

const accent = sectionAccents.quitHabit;
const RELAPSE = '#B3413A';


const DAY_PART_RANGES: Record<string, string> = {
  morning: 'morning (5–11am)',
  afternoon: 'afternoon (11am–5pm)',
  evening: 'evening (5–9pm)',
  night: 'night (9pm–5am)',
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

  // --- 3. Chart: the whole journey ---
  const series = quitJourneySeries(tracks, feelingEntries, habitId, today);
  const labels = domainLabels(journeyStart, chartSlots, 'day');
  const maxDay = series.reduce((m, d) => Math.max(m, d.dayCount), 0);
  const points: PositionedPoint[] = series.map((d) => {
    const parts = [`Track ${d.trackNumber} · day ${d.dayCount}`];
    if (d.resistedCount > 0) parts.push(`${d.resistedCount} resisted ${d.resistedCount === 1 ? 'urge' : 'urges'}`);
    if (d.relapse) parts.push('went back to it');
    return {
      key: d.date,
      date: d.date,
      score: d.dayCount,
      domainIndex: daysBetweenISO(journeyStart, d.date),
      color: d.relapse ? RELAPSE : d.resistedCount > 0 ? colors.amber : accent,
      radius: d.relapse ? 6 : d.resistedCount > 0 ? 5 : 0,
      label: parts.join(' · '),
    };
  });

  // --- 4. Insights ---
  const bestApproach = bestApproachForHabit(feelingEntries, tracks, habitId);
  const triggers = relapseTriggerRanking(tracks, habitId);
  const timeOfDay = urgeTimeOfDayPattern(feelingEntries, tracks, habitId);
  const trend = resistedUrgeTrend(feelingEntries, tracks, habitId, today);
  const hasInsights = bestApproach || triggers.length > 0 || timeOfDay || trend.direction;

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
        <React.Suspense fallback={<View style={styles.chartLoading} />}>
          <FeelingsGraph
            points={points}
            domainSlots={chartSlots}
            formatLabel={(i) => labels[i] ?? ''}
            yDomain={[0, Math.max(7, maxDay) + 1]}
            baselineAt={null}
            lineColor={accent}
            height={220}
            emptyText="Nothing to chart yet."
          />
        </React.Suspense>
        <View style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: colors.amber }]} />
          <Caption style={styles.legend}>Resisted an urge</Caption>
          <View style={[styles.legendDot, { backgroundColor: RELAPSE }]} />
          <Caption style={styles.legend}>Went back to it</Caption>
        </View>
        <Caption style={styles.legend}>The line climbs one step a day through each track. Pinch to zoom, drag with two fingers to pan.</Caption>
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
      {!hasInsights && (
        <Caption style={styles.emptyText}>
          Patterns need at least 3 matching moments before they're worth calling a pattern — they'll show up here as your journey goes on.
        </Caption>
      )}
      {bestApproach && (
        <InsightCard
          kind="What's worked for you"
          prominent
          accent={colors.amber}
          headline={`${bestApproach.approach} has worked for you ${bestApproach.passedCount} of the last ${bestApproach.totalCount} times.`}
          evidence="Counted from the times the urge actually passed after you chose it"
        />
      )}
      {triggers.slice(0, 3).map((t, i) => (
        <InsightCard
          key={t.tag}
          kind="Relapse trigger"
          accent={RELAPSE}
          headline={i === 0 ? `${t.tag} is your strongest link to going back to it.` : `${t.tag} also shows up when a track ends.`}
          evidence={`Tagged when ${t.count} tracks ended`}
        />
      ))}
      {timeOfDay && (
        <InsightCard
          kind="Time of day"
          accent={accent}
          headline={`Most cravings and relapses happen in the ${DAY_PART_RANGES[timeOfDay.bucket]}.`}
          evidence={`${timeOfDay.count} documented moments in that window`}
        />
      )}
      {trend.direction && trend.currentRatio != null && (
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
        <Caption style={styles.legend}>The whole journey — every track, relapse, resisted urge, feeling and note.</Caption>
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

function feelingName(id: string, personal: { id: string; name: string }[]): string {
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
      <Card style={[styles.logCard, { borderLeftColor: RELAPSE }]}>
        <View style={styles.logHeader}>
          <Body style={{ color: RELAPSE }}>Went back to it</Body>
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
  const meta = zoneMeta(entry.zone);
  const kindLabel = entry.isResistedUrge ? 'Resisted an urge' : entry.isRelapseMoment ? 'Felt, as the track ended' : 'Checked in';
  return (
    <Card style={[styles.logCard, { borderLeftColor: entry.isResistedUrge ? colors.amber : meta.accent }]}>
      <View style={styles.logHeader}>
        <Body style={entry.isResistedUrge ? { color: colors.amber } : undefined}>{kindLabel}</Body>
        <Caption>{formatDisplayDate(e.date)}</Caption>
      </View>
      <Caption style={{ color: meta.accent }}>Felt {feelingName(entry.feelingId, personalFeelings)}</Caption>
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
