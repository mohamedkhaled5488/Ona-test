import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Modal, Pressable, ScrollView, Share, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { captureRef } from 'react-native-view-shot';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { MonthCalendar } from '../components/MonthCalendar';
import { OnaWordmark } from '../components/OnaWordmark';
import { OnaMark } from '../components/OnaMark';
import { PlanNotice } from '../components/PlanNotice';
import { WeeklyReviewCard } from './dailyPlanning/WeeklyReviewCard';
import { ScreenTitle, SectionHeading, Eyebrow, Body, Caption } from '../components/Typography';
import { PrimaryButton } from '../components/PrimaryButton';
import type { PositionedPoint } from '../components/FeelingsGraph';
import { colors, fonts, radii, sectionAccents, spacing } from '../theme';
import { withAlpha } from '../utils/color';
import { useBackHandler } from '../hooks/useBackHandler';
import { sectionsMeta } from '../data/sectionsMeta';
import { zoneMeta } from '../data/feelingsWheel';
import { formatMoney } from '../data/currencies';
import { useFeature } from '../config/features';
import { todayISO, addDaysISO, formatDisplayDate, formatMonthLabel } from '../utils/date';
import {
  domainLabels,
  periodRange,
  previousPeriodRange,
  shiftPeriodAnchor,
  type RecapPeriod,
} from '../utils/feelingsStats';
import {
  buildActivityCounts,
  buildPatternObservations,
  buildSkillHabitPatternObservation,
  buildSkillsTimeBreakdown,
  collectRecapEvents,
  eventsForDate,
} from '../utils/recap';
import {
  AREA_SECTIONS,
  AREA_TITLES,
  EFFORT_KINDS,
  EFFORT_LABEL,
  EFFORT_SECTION,
  RECAP_SECTIONS,
  areaSummaries,
  buildHighlights,
  buildStory,
  effortSlots,
  effortSummary,
  formatDuration,
  growDetails,
  learnDetails,
  periodStats,
  planDetails,
  shareableStoryCards,
  storyTitle,
  withoutHidden,
  type AreaId,
  type Highlight,
  type PeriodStats,
  type RecapData,
  type StoryCard,
} from '../utils/recapStats';
import { useRecapStore } from '../store/useRecapStore';
import { useSettingsStore } from '../store/useSettingsStore';

// Every other store, read-only — see src/utils/recap.ts for why this is safe.
import { usePlanStore } from '../store/usePlanStore';
import { useDailyPlanningStore } from '../store/useDailyPlanningStore';
import { useJournalStore } from '../store/useJournalStore';
import { useThoughtsStore } from '../store/useThoughtsStore';
import { useStudyStore } from '../store/useStudyStore';
import { useDietStore } from '../store/useDietStore';
import { useSongwritingStore } from '../store/useSongwritingStore';
import { useMindGamesStore } from '../store/useMindGamesStore';
import { useFeelingsStore } from '../store/useFeelingsStore';
import { useSleepStore } from '../store/useSleepStore';
import { useReadingListStore } from '../store/useReadingListStore';
import { useSkillsStore } from '../store/useSkillsStore';
import { useHabitsStore } from '../store/useHabitsStore';
import { useBudgetStore } from '../store/useBudgetStore';
import { useQuitHabitsStore } from '../store/useQuitHabitsStore';

import type { RootStackParamList } from '../navigation/types';
import type { SectionId } from '../types/sections';
import { themedStyles } from '../theme/runtime';

// Recap is rendered directly as the Home tab, not pushed as its own stack
// route — but it still needs to navigate to every other section, which all
// live as screens on the parent root stack.
type Props = { navigation: NativeStackNavigationProp<RootStackParamList> };
type Nav = Props['navigation'];

// The graph engine pulls in Skia, so it loads lazily (same as the analysis screens).
const FeelingsGraph = React.lazy(() => import('../components/FeelingsGraph').then((m) => ({ default: m.FeelingsGraph })));

const ACCENT = sectionAccents.recap;
const AREA_ACCENT: Record<AreaId, string> = {
  plan: sectionAccents.dailyPlanning,
  reflect: sectionAccents.journaling,
  grow: sectionAccents.skills,
  learn: sectionAccents.studySession,
};
const PERIODS: { id: RecapPeriod; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
  { id: 'custom', label: 'Custom' },
];

function sectionTitle(id: SectionId): string {
  return sectionsMeta.find((s) => s.id === id)?.title ?? id;
}

function openSection(navigation: Nav, section: SectionId, params?: Record<string, string>) {
  (navigation.navigate as (name: string, params?: object) => void)(section, params);
}

// ---------------------------------------------------------------------------
// Data — every store, read-only, raw arrays (never filtered in a selector)
// ---------------------------------------------------------------------------
function useRecapData(): RecapData {
  const tasks = useDailyPlanningStore((s) => s.tasks);
  const journalEntries = useJournalStore((s) => s.entries);
  const thoughts = useThoughtsStore((s) => s.thoughts);
  const studySessions = useStudyStore((s) => s.sessions);
  const meals = useDietStore((s) => s.plannedMeals);
  const songs = useSongwritingStore((s) => s.songs);
  const gameResults = useMindGamesStore((s) => s.results);
  const feelingCheckIns = useFeelingsStore((s) => s.entries);
  const sleepLogs = useSleepStore((s) => s.logs);
  const readingEntries = useReadingListStore((s) => s.entries);
  const readingSessions = useReadingListStore((s) => s.sessions);
  const quotes = useReadingListStore((s) => s.quotes);
  const plans = usePlanStore((s) => s.plans);
  const skills = useSkillsStore((s) => s.skills);
  const skillSessions = useSkillsStore((s) => s.sessions);
  const habits = useHabitsStore((s) => s.habits);
  const habitCheckIns = useHabitsStore((s) => s.checkIns);
  const budgets = useBudgetStore((s) => s.budgets);
  const budgetEntries = useBudgetStore((s) => s.entries);
  const quitHabits = useQuitHabitsStore((s) => s.habits);
  const quitTracks = useQuitHabitsStore((s) => s.tracks);
  const quitFeelingEntries = useQuitHabitsStore((s) => s.feelingEntries);
  const bestMoments = useRecapStore((s) => s.bestMoments);

  return useMemo(
    () => ({
      tasks, journalEntries, thoughts, studySessions, meals, songs, gameResults, feelingCheckIns, sleepLogs,
      readingEntries, readingSessions, quotes, plans, skills, skillSessions, habits, habitCheckIns, budgets,
      budgetEntries, quitHabits, quitTracks, quitFeelingEntries, bestMoments,
    }),
    [
      tasks, journalEntries, thoughts, studySessions, meals, songs, gameResults, feelingCheckIns, sleepLogs,
      readingEntries, readingSessions, quotes, plans, skills, skillSessions, habits, habitCheckIns, budgets,
      budgetEntries, quitHabits, quitTracks, quitFeelingEntries, bestMoments,
    ]
  );
}

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setReduce(v)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------
function MiniBars({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 0);
  if (max <= 0) return <View style={styles.miniBarsEmpty} />;
  return (
    <View style={styles.miniBars}>
      {values.map((v, i) => (
        <View key={i} style={[styles.miniBar, { height: `${Math.max(4, (v / max) * 100)}%`, backgroundColor: v > 0 ? color : withAlpha(color, 0.18) }]} />
      ))}
    </View>
  );
}

function ZoneMixBar({ mix }: { mix: PeriodStats['zoneMix'] }) {
  const entries = (Object.entries(mix) as [keyof typeof mix, number][]).filter(([, n]) => n > 0);
  if (entries.length === 0) return <View style={styles.miniBarsEmpty} />;
  return (
    <View style={styles.zoneBar}>
      {entries.map(([zone, n]) => (
        <View key={zone} style={{ flex: n, backgroundColor: zoneMeta(zone).accent }} />
      ))}
    </View>
  );
}

function PeriodSwitch({
  period,
  setPeriod,
  anchor,
  setAnchor,
  customRange,
  setCustomRange,
  label,
}: {
  period: RecapPeriod;
  setPeriod: (p: RecapPeriod) => void;
  anchor: string;
  setAnchor: (d: string) => void;
  customRange: { start: string; end: string };
  setCustomRange: (r: { start: string; end: string }) => void;
  label: string;
}) {
  const today = todayISO();
  const [calendarMonth, setCalendarMonth] = useState(customRange.end);
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);
  const next = shiftPeriodAnchor(period, anchor, 1);
  const canGoForward = period !== 'custom' && next <= today;

  return (
    <>
      <View style={styles.segmented}>
        {PERIODS.map((p) => (
          <Pressable key={p.id} onPress={() => setPeriod(p.id)} style={[styles.segment, period === p.id && styles.periodChipActive]} accessibilityRole="button" accessibilityState={{ selected: period === p.id }}>
            <Caption style={period === p.id ? styles.periodChipTextActive : undefined}>{p.label}</Caption>
          </Pressable>
        ))}
      </View>

      {period !== 'custom' ? (
        <View style={styles.dateNav}>
          <Pressable onPress={() => setAnchor(shiftPeriodAnchor(period, anchor, -1))} hitSlop={8} accessibilityLabel="Previous period">
            <Ionicons name="chevron-back" size={20} color={colors.inkSoft} />
          </Pressable>
          <Body style={styles.periodLabel}>{label}</Body>
          <Pressable onPress={() => canGoForward && setAnchor(next)} disabled={!canGoForward} hitSlop={8} accessibilityLabel="Next period">
            <Ionicons name="chevron-forward" size={20} color={canGoForward ? colors.inkSoft : colors.line} />
          </Pressable>
        </View>
      ) : (
        <Card style={styles.card}>
          <Caption>
            {rangeAnchor == null
              ? `${formatDisplayDate(customRange.start)} – ${formatDisplayDate(customRange.end)} · tap a day to start a new range`
              : `Pick the last day (starting ${formatDisplayDate(rangeAnchor)})`}
          </Caption>
          <MonthCalendar
            accent={ACCENT}
            month={calendarMonth}
            onMonthChange={setCalendarMonth}
            getDayColor={(date) => (date >= customRange.start && date <= customRange.end ? withAlpha(ACCENT, 0.7) : undefined)}
            onDayPress={(date) => {
              if (rangeAnchor == null) {
                setRangeAnchor(date);
                setCustomRange({ start: date, end: date });
              } else {
                setCustomRange(date < rangeAnchor ? { start: date, end: rangeAnchor } : { start: rangeAnchor, end: date });
                setRangeAnchor(null);
              }
            }}
            disableFuture
          />
        </Card>
      )}
      {period !== 'custom' && anchor !== today && (
        <Pressable onPress={() => setAnchor(today)}>
          <Caption style={styles.todayLink}>Back to now</Caption>
        </Pressable>
      )}
    </>
  );
}

// The day's own list — what was logged, each tapping through, with the
// "best moment" star that feeds Highlights and the story.
function DayList({ navigation, data, date }: { navigation: Nav; data: RecapData; date: string }) {
  const dayEvents = useMemo(() => eventsForDate(collectRecapEvents(data), date), [data, date]);
  const setBestMoment = useRecapStore((s) => s.setBestMoment);
  const clearBestMoment = useRecapStore((s) => s.clearBestMoment);
  const bestMoment = data.bestMoments.find((m) => m.date === date);

  if (dayEvents.length === 0) return null;
  return (
    <>
      <Eyebrow style={styles.blockLabel}>What you did</Eyebrow>
      <View style={styles.itemList}>
        {dayEvents.map((event) => {
          const meta = sectionsMeta.find((s) => s.id === event.sectionId);
          const accent = sectionAccents[event.sectionId];
          const isBest = bestMoment?.refId === event.id;
          return (
            <Pressable key={event.id} onPress={() => openSection(navigation, event.sectionId, event.navParams)}>
              <Card style={[styles.itemCard, { borderLeftColor: accent, borderLeftWidth: 3 }]}>
                {meta && <Ionicons name={meta.icon} size={18} color={accent} />}
                <View style={styles.itemBody}>
                  <Body>{event.title}</Body>
                  {event.detail && <Caption numberOfLines={2}>{event.detail}</Caption>}
                </View>
                <Pressable
                  hitSlop={8}
                  onPress={() => (isBest ? clearBestMoment(date) : setBestMoment(date, event.sectionId, event.title, event.id))}
                  accessibilityLabel={isBest ? 'Remove best moment' : 'Mark as best moment'}
                >
                  <Ionicons name={isBest ? 'star' : 'star-outline'} size={20} color={colors.amber} />
                </Pressable>
              </Card>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------
interface HomeProps {
  navigation: Nav;
  data: RecapData;
  hidden: SectionId[];
  period: RecapPeriod;
  stats: PeriodStats;
  previous: PeriodStats;
  granularity: 'day' | 'month';
  isCurrent: boolean;
  onOpenArea: (area: AreaId) => void;
  onOpenDay: (date: string) => void;
  onOpenStory: () => void;
}

function RecapHome({ navigation, data, hidden, period, stats, previous, granularity, isCurrent, onOpenArea, onOpenDay, onOpenStory }: HomeProps) {
  const comparison = useSettingsStore((s) => s.recapComparison);
  const areaPages = useFeature('recapAreaPages');
  const storyEnabled = useFeature('recapStory');
  const summary = useMemo(() => effortSummary(stats, comparison ? previous : undefined, period, isCurrent), [stats, previous, comparison, period, isCurrent]);
  const highlights = useMemo(() => buildHighlights(data, stats), [data, stats]);
  const areas = useMemo(() => areaSummaries(stats, hidden), [stats, hidden]);
  const events = useMemo(() => collectRecapEvents(data), [data]);
  const counts = useMemo(() => buildActivityCounts(events), [events]);
  const observations = useMemo(() => {
    const base = buildPatternObservations(events, stats.range.start, stats.range.end);
    const skillHabit = buildSkillHabitPatternObservation(data.skills, data.skillSessions, data.habits, data.habitCheckIns, stats.range.start, stats.range.end);
    return skillHabit ? [...base, skillHabit] : base;
  }, [events, data, stats.range]);
  const [heatMonth, setHeatMonth] = useState(stats.range.end);
  useEffect(() => setHeatMonth(stats.range.end > todayISO() ? todayISO() : stats.range.end), [stats.range.end]);

  const openHighlight = (h: Highlight) => (h.target.kind === 'day' ? onOpenDay(h.target.date) : openSection(navigation, h.target.section, h.target.params));

  // Effort over time — stacked by area, hours on the y-axis.
  const slots = useMemo(() => effortSlots(stats, granularity), [stats, granularity]);
  const labels = useMemo(() => domainLabels(stats.range.start, slots.length, granularity), [stats.range.start, slots.length, granularity]);
  const points: PositionedPoint[] = slots
    .map((slot, i) => ({
      key: slot.key,
      date: slot.date,
      score: slot.total / 60,
      domainIndex: i,
      segments: EFFORT_KINDS.filter((k) => slot.minutes[k] > 0).map((k) => ({ value: slot.minutes[k] / 60, color: sectionAccents[EFFORT_SECTION[k]] })),
      label: `${granularity === 'month' ? formatMonthLabel(slot.date) : formatDisplayDate(slot.date)} · ${formatDuration(slot.total)}`,
    }))
    .filter((p) => p.score > 0);
  const maxHours = Math.max(0.5, ...points.map((p) => p.score));
  const kindsUsed = EFFORT_KINDS.filter((k) => stats.minutes[k] > 0);
  const countsLine = [
    stats.tasksCompleted ? `${stats.tasksCompleted} tasks done` : null,
    stats.journalEntries ? `${stats.journalEntries} journal entries` : null,
    stats.habitCompletions ? `${stats.habitCompletions} habit check-ins` : null,
    stats.feelingsLogged ? `${stats.feelingsLogged} feelings named` : null,
  ].filter(Boolean);

  return (
    <>
      <Card style={styles.card}>
        {summary.numbers.length > 0 && (
          <View style={styles.bigGrid}>
            {summary.numbers.map((n) => (
              <Pressable key={n.id} style={styles.bigCell} onPress={() => openSection(navigation, n.section)} accessibilityRole="button">
                <SectionHeading style={styles.bigValue}>{n.display}</SectionHeading>
                <Caption>{n.label}</Caption>
                {n.delta && <Caption style={styles.delta}>{n.delta}</Caption>}
              </Pressable>
            ))}
          </View>
        )}
        <Body style={styles.sentence}>{summary.sentence}</Body>
      </Card>

      {period === 'today' && <DayList navigation={navigation} data={data} date={stats.range.start} />}

      <Card style={styles.card}>
        <Eyebrow style={{ color: ACCENT }}>Activity</Eyebrow>
        <MonthCalendar
          accent={ACCENT}
          month={heatMonth}
          onMonthChange={setHeatMonth}
          getDayColor={(date) => {
            const n = counts[date] ?? 0;
            if (n === 0) return undefined;
            return n === 1 ? withAlpha(ACCENT, 0.4) : n <= 3 ? withAlpha(ACCENT, 0.7) : ACCENT;
          }}
          onDayPress={onOpenDay}
        />
        <Caption>Darker days mean more logged. Tap a day to open it.</Caption>
      </Card>

      {highlights.length > 0 && (
        <Card style={styles.card}>
          <Eyebrow style={{ color: ACCENT }}>Highlights</Eyebrow>
          {highlights.map((h) => (
            <Pressable key={h.id} onPress={() => openHighlight(h)} style={styles.highlightRow}>
              <Ionicons name={h.id.startsWith('moment-') ? 'star' : 'sparkles-outline'} size={16} color={colors.amber} />
              <Body style={styles.flex}>{h.text}</Body>
              <Ionicons name="chevron-forward" size={14} color={colors.inkSoft} />
            </Pressable>
          ))}
        </Card>
      )}

      {areas.length > 0 && (
        <View style={styles.areaGrid}>
          {areas.map((a) => (
            <Pressable
              key={a.area}
              style={styles.areaCell}
              onPress={() => (areaPages ? onOpenArea(a.area) : openSection(navigation, AREA_SECTIONS[a.area][0]))}
              accessibilityRole="button"
            >
              <Card style={[styles.areaCard, { borderTopColor: AREA_ACCENT[a.area] }]}>
                <View style={styles.headerRow}>
                  <Eyebrow style={{ color: AREA_ACCENT[a.area] }}>{AREA_TITLES[a.area]}</Eyebrow>
                  <Ionicons name="chevron-forward" size={14} color={colors.inkSoft} />
                </View>
                {a.hasData ? (
                  a.stats.map((s) => (
                    <View key={s.label} style={styles.areaStat}>
                      <Caption style={styles.flex} numberOfLines={1}>{s.label}</Caption>
                      <Caption style={styles.areaStatValue}>{s.value}</Caption>
                    </View>
                  ))
                ) : (
                  <Caption style={styles.muted}>Nothing here yet</Caption>
                )}
                {a.area === 'reflect' ? <ZoneMixBar mix={stats.zoneMix} /> : <MiniBars values={a.bars} color={AREA_ACCENT[a.area]} />}
              </Card>
            </Pressable>
          ))}
        </View>
      )}

      {stats.dates.length > 1 && (
        <Card style={styles.card}>
          <Eyebrow style={{ color: ACCENT }}>Time invested</Eyebrow>
          {points.length > 0 ? (
            <>
              <React.Suspense fallback={<View style={styles.chartLoading} />}>
                <FeelingsGraph
                  variant="bars"
                  points={points}
                  domainSlots={slots.length}
                  formatLabel={(i) => labels[i] ?? ''}
                  yDomain={[0, maxHours * 1.15]}
                  baselineAt={null}
                  height={180}
                />
              </React.Suspense>
              <View style={styles.legendRow}>
                {kindsUsed.map((k) => (
                  <View key={k} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: sectionAccents[EFFORT_SECTION[k]] }]} />
                    <Caption>{EFFORT_LABEL[k]}</Caption>
                  </View>
                ))}
              </View>
              <Caption style={styles.muted}>Hours from timed sessions only.</Caption>
            </>
          ) : (
            <Caption style={styles.muted}>No timed sessions in this period.</Caption>
          )}
          {countsLine.length > 0 && <Caption>Also counted (not timed): {countsLine.join(' · ')}.</Caption>}
        </Card>
      )}

      {observations.length > 0 && (
        <Card style={styles.card}>
          <Eyebrow style={{ color: ACCENT }}>A few gentle patterns</Eyebrow>
          {observations.map((o) => (
            <Body key={o.id}>{o.text}</Body>
          ))}
          <Caption style={styles.muted}>Things that showed up together in your own data, with the counts. Never a diagnosis.</Caption>
        </Card>
      )}

      {storyEnabled && summary.numbers.length > 0 && (
        <PrimaryButton label={storyTitle(period)} variant="outline" onPress={onOpenStory} style={styles.storyButton} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Area pages
// ---------------------------------------------------------------------------
function Row({ label, value, onPress, color }: { label: string; value?: string; onPress?: () => void; color?: string }) {
  const inner = (
    <View style={styles.row}>
      {color && <View style={[styles.legendDot, { backgroundColor: color }]} />}
      <Body style={styles.flex}>{label}</Body>
      {value !== undefined && <Caption style={styles.rowValue}>{value}</Caption>}
      {onPress && <Ionicons name="chevron-forward" size={14} color={colors.inkSoft} />}
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{inner}</Pressable> : inner;
}

function ProgressBar({ fraction, color }: { fraction: number; color: string }) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`, backgroundColor: color }]} />
    </View>
  );
}

function AreaPage({
  area,
  navigation,
  data,
  stats,
  periodLabel,
  hidden,
  onBack,
}: {
  area: AreaId;
  navigation: Nav;
  data: RecapData;
  stats: PeriodStats;
  periodLabel: string;
  hidden: SectionId[];
  onBack: () => void;
}) {
  const color = AREA_ACCENT[area];
  const today = todayISO();
  const show = (s: SectionId) => !hidden.includes(s);
  const go = (s: SectionId, params?: Record<string, string>) => openSection(navigation, s, params);
  const plan = useMemo(() => planDetails(data, stats), [data, stats]);
  const grow = useMemo(() => growDetails(data, stats, today), [data, stats, today]);
  const learn = useMemo(() => learnDetails(data, stats), [data, stats]);
  const skillTime = useMemo(() => buildSkillsTimeBreakdown(data.skills, data.skillSessions, stats.range.start, stats.range.end), [data, stats.range]);
  // In the zone order, not sorted by count.
  const zones = (['lively', 'calm', 'tense', 'low', 'okay'] as (keyof PeriodStats['zoneMix'])[]).map((z) => [z, stats.zoneMix[z]] as [keyof PeriodStats['zoneMix'], number]).filter(([, n]) => n > 0);

  return (
    <>
      <Pressable onPress={onBack} style={styles.backLink}>
        <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
        <Caption> Recap</Caption>
      </Pressable>
      <ScreenTitle style={{ color }}>{AREA_TITLES[area]}</ScreenTitle>
      <Caption style={styles.subtitle}>{periodLabel}</Caption>

      {area === 'plan' && (
        <>
          {show('dailyPlanning') && (
            <Card style={styles.card}>
              <Eyebrow style={{ color }}>Daily Planning</Eyebrow>
              <Row label="Tasks done" value={`${stats.tasksCompleted} of ${stats.tasksPlanned}`} onPress={() => go('dailyPlanning')} />
              {plan.completionRate !== undefined && <Row label="Completion rate" value={`${plan.completionRate}%`} />}
              {plan.busiestDay && <Row label="Busiest day" value={`${formatDisplayDate(plan.busiestDay.date)} · ${plan.busiestDay.done} done`} />}
              <MiniBars values={stats.dates.length <= 31 ? stats.dates.map((d) => stats.tasksByDay[d]?.done ?? 0) : []} color={color} />
            </Card>
          )}
          {show('planBuilder') && plan.plans.length > 0 && (
            <Card style={styles.card}>
              <Eyebrow style={{ color }}>Plans</Eyebrow>
              {plan.plans.map((p) => (
                <Pressable key={p.id} onPress={() => navigation.navigate('planDetail', { planId: p.id })} style={styles.planRow}>
                  <View style={styles.row}>
                    <Body style={styles.flex}>{p.title}</Body>
                    <Caption>{p.done} of {p.total} steps</Caption>
                  </View>
                  <ProgressBar fraction={p.done / p.total} color={p.color} />
                </Pressable>
              ))}
            </Card>
          )}
          {(show('dietPlanning') && stats.mealsPlanned > 0) || (show('budget') && plan.spending.length > 0) ? (
            <Card style={styles.card}>
              <Eyebrow style={{ color }}>Meals & money</Eyebrow>
              {show('dietPlanning') && stats.mealsPlanned > 0 && <Row label="Meals planned" value={String(stats.mealsPlanned)} onPress={() => go('dietPlanning')} />}
              {show('budget') &&
                plan.spending.map((b) => (
                  <Row
                    key={b.budgetId}
                    label={b.name}
                    value={`${b.mode === 'goal' ? 'Saved' : 'Spent'} ${formatMoney(b.amount, b.currency)} of ${formatMoney(b.target, b.currency)}`}
                    onPress={() => go('budget', { openBudgetId: b.budgetId })}
                  />
                ))}
            </Card>
          ) : null}
        </>
      )}

      {area === 'reflect' && (
        <>
          {show('journaling') && (
            <Card style={styles.card}>
              <Eyebrow style={{ color }}>Journaling</Eyebrow>
              <Row label="Entries" value={String(stats.journalEntries)} onPress={() => go('journaling')} />
              <Row label="Words written" value={stats.journalWords.toLocaleString()} />
            </Card>
          )}
          {show('moodCheck') && (
            <Card style={styles.card}>
              <Eyebrow style={{ color }}>Feelings</Eyebrow>
              <Row label="Feelings named" value={String(stats.feelingsLogged)} onPress={() => go('moodCheck')} />
              {zones.length > 0 && (
                <>
                  <ZoneMixBar mix={stats.zoneMix} />
                  <Caption>{zones.map(([z, n]) => `${zoneMeta(z).label} ${n}`).join(' · ')}</Caption>
                </>
              )}
              {stats.topFeelings.length > 0 && <Caption>Feelings you named: {stats.topFeelings.map((f) => `${f.name.toLowerCase()} ${f.count}`).join(', ')}.</Caption>}
            </Card>
          )}
          {show('sleep') && stats.sleepLogs > 0 && (
            <Card style={styles.card}>
              <Eyebrow style={{ color }}>Sleep</Eyebrow>
              <Row label="Nights logged" value={String(stats.sleepLogs)} onPress={() => go('sleep')} />
              <Caption>
                {stats.restedNights === 0
                  ? 'None of the logged nights felt rested — worth being gentle with yourself.'
                  : `${stats.restedNights} of ${stats.sleepLogs} logged nights felt rested.`}
              </Caption>
            </Card>
          )}
        </>
      )}

      {area === 'grow' && (
        <>
          {show('habitBuilder') && grow.habits.length > 0 && (
            <Card style={styles.card}>
              <Eyebrow style={{ color }}>Habits</Eyebrow>
              {grow.habits.map((h) => (
                <Pressable key={h.id} onPress={() => go('habitBuilder', { openHabitId: h.id })} style={styles.planRow}>
                  <View style={styles.row}>
                    <Body style={styles.flex}>{h.name}</Body>
                    <Caption>{h.rate !== null ? `${Math.round(h.rate * 100)}%` : `${h.done} done`}</Caption>
                  </View>
                  {h.rate !== null && <ProgressBar fraction={h.rate} color={sectionAccents.habitBuilder} />}
                  {h.longest > 0 && <Caption style={styles.muted}>Longest run: {h.longest} {h.unit === 'week' ? 'weeks' : 'days'}</Caption>}
                </Pressable>
              ))}
            </Card>
          )}
          {show('quitHabit') && stats.resistedUrges > 0 && (
            <Card style={styles.card}>
              <Eyebrow style={{ color }}>Quitting</Eyebrow>
              <Row label="Urges ridden out" value={String(stats.resistedUrges)} onPress={() => go('quitHabit')} />
            </Card>
          )}
          {show('skills') && (
            <Card style={styles.card}>
              <Eyebrow style={{ color }}>Skills</Eyebrow>
              <Row label="Practice time" value={formatDuration(skillTime.totalMinutes)} onPress={() => go('skills')} />
              {skillTime.bySkill.map((s) => (
                <Row key={s.skillId} label={s.skillName} value={formatDuration(s.minutes)} onPress={() => go('skills', { openSkillId: s.skillId })} />
              ))}
            </Card>
          )}
        </>
      )}

      {area === 'learn' && (
        <>
          {show('studySession') && (
            <Card style={styles.card}>
              <Eyebrow style={{ color }}>Study</Eyebrow>
              <Row label="Focus time" value={formatDuration(stats.minutes.study)} onPress={() => go('studySession')} />
              <Row label="Sessions" value={String(stats.studySessions)} />
              {learn.bestFocusTime && <Caption>Most of your focus time started in the {learn.bestFocusTime}.</Caption>}
            </Card>
          )}
          {show('book') && (
            <Card style={styles.card}>
              <Eyebrow style={{ color }}>Reading</Eyebrow>
              <Row label="Pages read" value={String(stats.pagesRead)} onPress={() => go('book')} />
              <Row label="Reading time" value={formatDuration(stats.minutes.reading)} />
              {stats.quotesSaved > 0 && <Row label="Quotes saved" value={String(stats.quotesSaved)} />}
              {learn.books.map((b) => (
                <Pressable key={b.id} onPress={() => go('book', { openEntryId: b.id })} style={styles.planRow}>
                  <View style={styles.row}>
                    <Body style={styles.flex}>{b.title}</Body>
                    <Ionicons name="chevron-forward" size={14} color={colors.inkSoft} />
                  </View>
                  {b.fraction !== undefined && <ProgressBar fraction={b.fraction} color={sectionAccents.book} />}
                  {b.progress && <Caption style={styles.muted}>{b.progress}</Caption>}
                </Pressable>
              ))}
            </Card>
          )}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Story view
// ---------------------------------------------------------------------------
function StoryView({
  visible,
  onClose,
  cards,
  title,
  includeSensitive,
  reduceMotion,
}: {
  visible: boolean;
  onClose: () => void;
  cards: StoryCard[];
  title: string;
  includeSensitive: boolean;
  reduceMotion: boolean;
}) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const cardRef = useRef<View | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  useEffect(() => {
    if (visible) setIndex(0);
  }, [visible]);

  const current = cards[index];
  const canShare = !!current && shareableStoryCards([current], includeSensitive).length > 0;

  const share = async () => {
    if (!current || !canShare) return;
    const text = [current.title, current.headline, ...current.lines].join('\n');
    try {
      if (!cardRef.current) throw new Error('nothing to capture');
      const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
      const Sharing = await import('expo-sharing');
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
        return;
      }
      throw new Error('sharing unavailable');
    } catch {
      await Share.share({ message: `${text}\n\n— ${title}` });
    }
  };

  const goTo = (i: number) => {
    setIndex(i);
    scrollRef.current?.scrollTo({ x: i * width, animated: !reduceMotion });
  };

  return (
    <Modal visible={visible} animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose}>
      <SafeAreaView style={styles.storyRoot}>
        <View style={styles.storyTop}>
          <View style={styles.storyDots}>
            {cards.map((c, i) => (
              <View key={c.id} style={[styles.storyDot, i === index && styles.storyDotActive]} />
            ))}
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close story">
            <Ionicons name="close" size={24} color={colors.ink} />
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          onScroll={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          scrollEventThrottle={64}
        >
          {cards.map((card, i) => (
            <View key={card.id} style={[styles.storyPage, { width }]}>
              <View ref={i === index ? cardRef : undefined} collapsable={false} style={styles.storyCard}>
                <Eyebrow style={{ color: ACCENT }}>{i === 0 ? title : card.title}</Eyebrow>
                <SectionHeading style={styles.storyHeadline}>{card.headline}</SectionHeading>
                {card.lines.map((line) => (
                  <Body key={line} style={styles.storyLine}>{line}</Body>
                ))}
                <View style={styles.storyBrand}>
                  <OnaMark size={18} />
                  <OnaWordmark size={14} />
                </View>
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.storyBottom}>
          <Pressable onPress={() => index > 0 && goTo(index - 1)} disabled={index === 0} hitSlop={10} accessibilityLabel="Previous card">
            <Ionicons name="chevron-back" size={24} color={index === 0 ? colors.line : colors.ink} />
          </Pressable>
          {canShare ? (
            <PrimaryButton label="Share this card" variant="outline" onPress={share} />
          ) : (
            <Caption style={styles.storyNote}>Feelings and Quit cards aren't shared unless you turn that on in Settings → Sections → Recap.</Caption>
          )}
          <Pressable onPress={() => index < cards.length - 1 && goTo(index + 1)} disabled={index >= cards.length - 1} hitSlop={10} accessibilityLabel="Next card">
            <Ionicons name="chevron-forward" size={24} color={index >= cards.length - 1 ? colors.line : colors.ink} />
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
type Stage = { kind: 'home' } | { kind: 'area'; area: AreaId };

function describePeriod(period: RecapPeriod, start: string, end: string): string {
  const fmt = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, opts);
  if (period === 'today') return start === todayISO() ? `Today · ${fmt(start, { weekday: 'long', month: 'long', day: 'numeric' })}` : formatDisplayDate(start);
  if (period === 'month') return formatMonthLabel(start);
  if (period === 'year') return start.slice(0, 4);
  return `${fmt(start, { month: 'short', day: 'numeric' })} – ${fmt(end, { month: 'short', day: 'numeric', year: start.slice(0, 4) !== end.slice(0, 4) ? 'numeric' : undefined })}`;
}

export function RecapScreen({ navigation }: Props) {
  const weekStartsOn = useSettingsStore((s) => s.weekStartsOn);
  const hidden = useSettingsStore((s) => s.hiddenRecapSections);
  const shareSensitive = useSettingsStore((s) => s.shareSensitiveInRecap);
  const reduceMotion = useReduceMotion();

  const today = todayISO();
  const [period, setPeriod] = useState<RecapPeriod>('week');
  const [anchor, setAnchor] = useState(today);
  const [customRange, setCustomRange] = useState({ start: addDaysISO(today, -13), end: today });
  const [stack, setStack] = useState<Stage[]>([{ kind: 'home' }]);
  const [storyOpen, setStoryOpen] = useState(false);
  const stage = stack[stack.length - 1];
  const stepBack = () => setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));

  // Same scroll position after coming back from an area page or settings.
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const homeScrollY = useRef(0);
  const push = (s: Stage) => {
    homeScrollY.current = scrollY.current;
    setStack((prev) => [...prev, s]);
  };
  useEffect(() => {
    if (stage.kind === 'home') {
      const y = homeScrollY.current;
      const id = setTimeout(() => scrollRef.current?.scrollTo({ y, animated: false }), 50);
      return () => clearTimeout(id);
    }
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [stage.kind]);

  useBackHandler({ stepBack: stack.length > 1 ? stepBack : undefined });

  const raw = useRecapData();
  const data = useMemo(() => withoutHidden(raw, hidden), [raw, hidden]);
  const range = useMemo(() => periodRange(period, anchor, customRange, weekStartsOn), [period, anchor, customRange, weekStartsOn]);
  const prevRange = useMemo(() => previousPeriodRange(period, range, weekStartsOn), [period, range, weekStartsOn]);
  const stats = useMemo(() => periodStats(data, range), [data, range]);
  const previous = useMemo(() => periodStats(data, prevRange), [data, prevRange]);
  const isCurrent = today >= range.start && today <= range.end;
  const label = describePeriod(period, range.start, range.end);

  const story = useMemo(() => buildStory(data, stats, buildHighlights(data, stats), period, isCurrent, today), [data, stats, period, isCurrent, today]);

  const openDay = (date: string) => {
    setPeriod('today');
    setAnchor(date);
  };

  return (
    <Screen scrollRef={scrollRef} onScroll={(y) => (scrollY.current = y)}>
      {stage.kind === 'home' && (
        <>
          <View style={styles.brandHeaderRow}>
            <View style={styles.brandRow}>
              <OnaMark size={28} />
              <OnaWordmark size={22} />
            </View>
            <View style={styles.brandRow}>
              <Pressable
                hitSlop={8}
                onPress={() => navigation.navigate('settings', { page: 'section', section: 'recap' })}
                accessibilityLabel="Choose what Recap shows"
              >
                <Ionicons name="options-outline" size={20} color={colors.inkSoft} />
              </Pressable>
              <Pressable hitSlop={8} onPress={() => navigation.navigate('discover')} accessibilityRole="button" accessibilityLabel="Discover Ona" testID="home-discover">
                <Ionicons name="compass-outline" size={22} color={colors.teal} />
              </Pressable>
              <Pressable hitSlop={8} onPress={() => navigation.navigate('settings')} accessibilityLabel="Settings" testID="home-settings">
                <Ionicons name="settings-outline" size={22} color={colors.inkSoft} />
              </Pressable>
            </View>
          </View>

          <PlanNotice />
          <WeeklyReviewCard onOpenInsights={() => navigation.navigate('planningInsights')} />

          <ScreenTitle>Recap</ScreenTitle>
          <Caption style={styles.subtitle}>A calm look back, pulled from everywhere else in Ona.</Caption>

          <PeriodSwitch
            period={period}
            setPeriod={(p) => {
              setPeriod(p);
              setAnchor(today);
            }}
            anchor={anchor}
            setAnchor={setAnchor}
            customRange={customRange}
            setCustomRange={setCustomRange}
            label={label}
          />

          <RecapHome
            navigation={navigation}
            data={data}
            hidden={hidden}
            period={period}
            stats={stats}
            previous={previous}
            granularity={range.granularity}
            isCurrent={isCurrent}
            onOpenArea={(area) => push({ kind: 'area', area })}
            onOpenDay={openDay}
            onOpenStory={() => setStoryOpen(true)}
          />
        </>
      )}

      {stage.kind === 'area' && (
        <AreaPage area={stage.area} navigation={navigation} data={data} stats={stats} periodLabel={label} hidden={hidden} onBack={stepBack} />
      )}


      <StoryView
        visible={storyOpen}
        onClose={() => setStoryOpen(false)}
        cards={story}
        title={storyTitle(period)}
        includeSensitive={shareSensitive}
        reduceMotion={reduceMotion}
      />
    </Screen>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1 },
  muted: { color: colors.inkSoft },
  brandHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  subtitle: { marginTop: 2, marginBottom: spacing.lg },
  backLink: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  card: { gap: spacing.sm, marginBottom: spacing.md },
  blockLabel: { marginBottom: spacing.sm },

  periodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  periodChip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  periodChipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  segmented: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 2,
    marginBottom: spacing.sm,
  },
  // Grows to fill one row at normal text sizes; at the largest sizes the
  // segments wrap onto a second row instead of clipping.
  segment: { flexGrow: 1, flexBasis: 'auto', alignItems: 'center', paddingVertical: 6, paddingHorizontal: spacing.sm, borderRadius: radii.full },
  periodChipTextActive: { color: colors.white },
  dateNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  periodLabel: { fontFamily: fonts.bodyMedium },
  todayLink: { color: ACCENT, marginBottom: spacing.md, textAlign: 'center' },

  bigGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md },
  bigCell: { width: '50%', paddingRight: spacing.sm },
  bigValue: { color: colors.ink },
  delta: { color: colors.inkSoft, fontSize: 12 },
  sentence: { marginTop: spacing.xs },

  itemList: { gap: spacing.sm, marginBottom: spacing.md },
  itemCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemBody: { flex: 1, gap: 2 },

  highlightRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },

  areaGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.xs, marginBottom: spacing.sm },
  areaCell: { width: '50%', paddingHorizontal: spacing.xs, marginBottom: spacing.sm },
  areaCard: { gap: 6, borderTopWidth: 3, minHeight: 150 },
  areaStat: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  areaStatValue: { color: colors.ink },

  miniBars: { flexDirection: 'row', alignItems: 'flex-end', height: 28, gap: 2, marginTop: 'auto' },
  miniBar: { flex: 1, borderRadius: 2 },
  miniBarsEmpty: { height: 28, marginTop: 'auto' },
  zoneBar: { flexDirection: 'row', height: 10, borderRadius: radii.full, overflow: 'hidden', marginTop: 'auto' },

  chartLoading: { height: 180 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },

  storyButton: { marginBottom: spacing.lg },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  rowValue: { color: colors.ink },
  planRow: { gap: 4, paddingVertical: 4 },
  progressTrack: { height: 6, borderRadius: radii.full, backgroundColor: colors.line, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radii.full },

  storyRoot: { flex: 1, backgroundColor: colors.stone },
  storyTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
  storyDots: { flexDirection: 'row', gap: 6 },
  storyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.line },
  storyDotActive: { backgroundColor: ACCENT },
  storyPage: { padding: spacing.lg, justifyContent: 'center' },
  storyCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderLeftWidth: 4,
    borderLeftColor: ACCENT,
  },
  storyHeadline: { color: colors.ink },
  storyLine: { color: colors.ink },
  storyBrand: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md },
  storyBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, padding: spacing.lg },
  storyNote: { flex: 1, textAlign: 'center', color: colors.inkSoft },
}));
