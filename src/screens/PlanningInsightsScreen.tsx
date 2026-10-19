// Daily Planning → Insights. Every card: a simple chart, plain lines from
// utils/planningInsights.ts (correlational, never causal), how many data
// points it's based on, and "Show the data". Below the minimum, a card says
// how far along it is instead of guessing.
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { SheetModal } from '../components/SheetModal';
import { MonthCalendar } from '../components/MonthCalendar';
import { SettingSwitch } from '../components/SettingSwitch';
import { TagChip } from '../components/TagPicker';
import { useUi } from '../components/UiProvider';
import { Body, Caption, Eyebrow, SectionHeading } from '../components/Typography';
import type { PositionedPoint } from '../components/FeelingsGraph';
import { useDailyPlanningStore, resolveTaskDone, resolveTaskTitle } from '../store/useDailyPlanningStore';
import { useFeelingsStore } from '../store/useFeelingsStore';
import { usePlanStore } from '../store/usePlanStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { feelingZones } from '../data/feelingsWheel';
import { addDaysISO, formatDisplayDate, todayISO } from '../utils/date';
import { domainLabels } from '../utils/feelingsStats';
import { withAlpha } from '../utils/color';
import {
  MIN_POINTS,
  TIME_OF_DAY_LABEL,
  buckets,
  completionInsight,
  energyInsight,
  estimateInsight,
  feelGoodInsight,
  feelingsInsight,
  granularityFor,
  insightRange,
  movedOften,
  occurrences,
  overloadInsight,
  planningDays,
  planningStreak,
  previousRange,
  tagInsight,
  timeOfDay,
  type Gate,
  type RangeKind,
  type TimeOfDay,
} from '../utils/planningInsights';
import { colors, fonts, radii, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';
import type { RootStackParamList } from '../navigation/types';
import type { DailyTask } from '../types/sections';

const FeelingsGraph = React.lazy(() => import('../components/FeelingsGraph').then((m) => ({ default: m.FeelingsGraph })));

type Props = NativeStackScreenProps<RootStackParamList, 'planningInsights'>;

const RANGES: { id: RangeKind; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'quarter', label: '3 months' },
  { id: 'custom', label: 'Custom' },
];

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: active }} hitSlop={4} style={[styles.chip, active && styles.chipActive]}>
      <Caption style={active ? styles.chipTextActive : undefined}>{label}</Caption>
    </Pressable>
  );
}

// A horizontal bar for "x of y" style values.
function HBar({ label, value, max, text, color = colors.teal }: { label: string; value: number; max: number; text: string; color?: string }) {
  return (
    <View style={styles.hbarRow} accessible accessibilityLabel={`${label}: ${text}`}>
      <Caption style={styles.hbarLabel} numberOfLines={1}>
        {label}
      </Caption>
      <View style={styles.hbarTrack}>
        <View style={[styles.hbarFill, { width: `${max ? Math.max(2, (value / max) * 100) : 0}%`, backgroundColor: color }]} />
      </View>
      <Caption style={styles.hbarValue}>{text}</Caption>
    </View>
  );
}

function InsightCard({
  title,
  gate,
  lines,
  chart,
  data,
  extra,
}: {
  title: string;
  gate: Gate;
  lines: string[];
  chart?: React.ReactNode;
  data?: { label: string; value: string }[];
  extra?: React.ReactNode;
}) {
  const [showData, setShowData] = useState(false);
  return (
    <Card style={styles.card}>
      <Eyebrow accessibilityRole="header">{title}</Eyebrow>
      {gate.enough ? (
        <>
          {chart}
          {lines.map((l) => (
            <Body key={l}>{l}</Body>
          ))}
          {extra}
          <Caption style={styles.muted}>
            Based on {gate.n} {gate.unit}. These are counts from your own logs, in a fixed order: not a ranking, and not causes.
          </Caption>
          {data && data.length > 0 && (
            <>
              <Pressable onPress={() => setShowData((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showData }} style={styles.dataToggle}>
                <Caption style={styles.link}>{showData ? 'Hide the data' : 'Show the data'}</Caption>
              </Pressable>
              {showData &&
                data.map((r, i) => (
                  <View key={`${r.label}-${i}`} style={styles.dataRow}>
                    <Caption style={styles.flex}>{r.label}</Caption>
                    <Caption>{r.value}</Caption>
                  </View>
                ))}
            </>
          )}
        </>
      ) : (
        <Caption style={styles.muted}>
          Not enough yet: this needs at least {gate.needed} {gate.unit}, and there {gate.n === 1 ? 'is' : 'are'} {gate.n} so far.
        </Caption>
      )}
    </Card>
  );
}

export function PlanningInsightsScreen({ navigation }: Props) {
  const tasks = useDailyPlanningStore((s) => s.tasks);
  const tags = useDailyPlanningStore((s) => s.tags);
  const entries = useFeelingsStore((s) => s.entries);
  usePlanStore((s) => s.plans); // linked steps' done state
  const prefs = useSettingsStore((s) => s.planningInsights);
  const weekStartsOn = useSettingsStore((s) => s.weekStartsOn);
  const available = useSettingsStore((s) => s.dailyAvailableMinutes);
  const showStreak = useSettingsStore((s) => s.planningStreakCard);
  const setSetting = useSettingsStore((s) => s.set);
  const { showToast } = useUi();
  const setPrefs = (patch: Partial<typeof prefs>) => setSetting('planningInsights', { ...prefs, ...patch });

  const [customStep, setCustomStep] = useState<'start' | 'end' | null>(null);
  const [customStart, setCustomStart] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState(todayISO());
  const [moveTarget, setMoveTarget] = useState<DailyTask | null>(null);

  const today = todayISO();
  const doneOn = (t: DailyTask, d: string) => resolveTaskDone(t, d);
  const range = insightRange(prefs.range, today, weekStartsOn, prefs.custom ?? undefined);
  const gran = granularityFor(range);
  const bs = buckets(range, gran, weekStartsOn);

  const all = useMemo(() => {
    const occ = occurrences(tasks, range, doneOn, entries, prefs.tagIds);
    const prevRange = previousRange(range);
    const prevOcc = prefs.compare ? occurrences(tasks, prevRange, doneOn, entries, prefs.tagIds) : [];
    return {
      occ,
      completion: completionInsight(occ, bs),
      previous: prefs.compare ? completionInsight(prevOcc, buckets(prevRange, gran, weekStartsOn)) : undefined,
      prevRange,
      byTag: tagInsight(occ, tasks, tags),
      estimate: estimateInsight(occ),
      energy: energyInsight(occ),
      feelings: feelingsInsight(occ, tags),
      feelGood: feelGoodInsight(occ, tags),
      overload: overloadInsight(occ, available),
      moved: movedOften(tasks, doneOn),
      streak: planningStreak(planningDays(tasks, addDaysISO(today, -365), today), today),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, tags, entries, range.start, range.end, prefs.tagIds, prefs.compare, available, gran, weekStartsOn]);

  const c = all.completion;
  const labels =
    gran === 'day'
      ? domainLabels(range.start, bs.length, 'day')
      : // Weeks: the month's name under the first week of each month.
        bs.map((b, i) => (i === 0 || b.start.slice(5, 7) !== bs[i - 1].start.slice(5, 7) ? new Date(`${b.start}T00:00:00`).toLocaleDateString(undefined, { month: 'short' }) : ''));
  const points: PositionedPoint[] = c.series
    .map((s, i) => ({
      key: s.key,
      date: s.start,
      score: s.planned,
      domainIndex: i,
      segments: [
        { value: s.done, color: colors.teal },
        { value: s.planned - s.done, color: withAlpha(colors.teal, 0.25) },
      ],
      label: `${formatDisplayDate(s.start)}: ${s.done} of ${s.planned} done`,
    }))
    .filter((p) => p.score > 0);
  const comparePoints: PositionedPoint[] | undefined = all.previous?.series.slice(0, bs.length).map((s, i) => ({ key: `prev-${s.key}`, date: s.start, score: s.done, domainIndex: i, radius: 0 }));
  const yMax = Math.max(1, ...c.series.map((s) => s.planned), ...(all.previous?.series.map((s) => s.done) ?? []));

  const timeCounts = (['morning', 'afternoon', 'evening', 'night'] as TimeOfDay[]).map((t) => ({
    t,
    n: all.occ.filter((o) => o.completedAt && timeOfDay(o.completedAt) === t).length,
    high: all.occ.filter((o) => o.completedAt && o.energy === 'high' && timeOfDay(o.completedAt) === t).length,
  }));

  const letGo = (t: DailyTask) => {
    useDailyPlanningStore.getState().letGo(t.id, t.date);
    showToast({ message: 'Let go. Kept in the archive.', actionLabel: 'Undo', onAction: () => useDailyPlanningStore.getState().undoLetGo(t.id, t.date) });
  };

  return (
    <Screen>
      <View style={styles.chipRow} accessibilityRole="radiogroup" accessibilityLabel="Period">
        {RANGES.map((r) => (
          <Chip
            key={r.id}
            label={r.label}
            active={prefs.range === r.id}
            onPress={() => {
              if (r.id === 'custom') {
                setCustomStart(null);
                setCalMonth(today);
                setCustomStep('start');
              } else setPrefs({ range: r.id });
            }}
          />
        ))}
      </View>
      <Caption style={styles.rangeText}>
        {formatDisplayDate(range.start)} to {formatDisplayDate(range.end)}
      </Caption>
      {tags.length > 0 && (
        <View style={styles.chipRow}>
          {tags.map((t) => (
            <TagChip
              key={t.id}
              tag={t}
              selected={prefs.tagIds.includes(t.id)}
              onPress={() => setPrefs({ tagIds: prefs.tagIds.includes(t.id) ? prefs.tagIds.filter((x) => x !== t.id) : [...prefs.tagIds, t.id] })}
            />
          ))}
        </View>
      )}
      <SettingSwitch label="Compare with the period before" value={prefs.compare} onValueChange={(compare) => setPrefs({ compare })} accent={colors.teal} />

      <InsightCard
        title="Completion over time"
        gate={c}
        lines={c.lines}
        chart={
          <>
            <React.Suspense fallback={<View style={styles.chartLoading} />}>
              <FeelingsGraph
                variant="bars"
                points={points}
                comparePoints={comparePoints}
                compareColor={colors.amber}
                domainSlots={bs.length}
                formatLabel={(i) => labels[i] ?? ''}
                yDomain={[0, yMax * 1.15]}
                baselineAt={null}
                height={170}
                emptyText="No tasks in this period."
              />
            </React.Suspense>
            <View style={styles.legend}>
              <View style={[styles.legendDot, { backgroundColor: colors.teal }]} />
              <Caption>Done</Caption>
              <View style={[styles.legendDot, { backgroundColor: withAlpha(colors.teal, 0.25) }]} />
              <Caption>Planned</Caption>
              {all.previous && (
                <>
                  <View style={[styles.legendDot, { backgroundColor: colors.amber }]} />
                  <Caption>Done, period before</Caption>
                </>
              )}
            </View>
          </>
        }
        extra={
          all.previous ? (
            <Caption>
              Period before ({formatDisplayDate(all.prevRange.start)} to {formatDisplayDate(all.prevRange.end)}):{' '}
              {all.previous.planned ? `${all.previous.done} of ${all.previous.planned} (${all.previous.rate}%)` : 'no tasks'}.
            </Caption>
          ) : undefined
        }
        data={c.series.filter((s) => s.planned).map((s) => ({ label: gran === 'day' ? formatDisplayDate(s.start) : `Week of ${formatDisplayDate(s.start)}`, value: `${s.done} of ${s.planned}` }))}
      />

      <InsightCard
        title="By tag"
        gate={all.byTag}
        lines={all.byTag.lines}
        chart={
          all.byTag.tags.length > 0 ? (
            <View>
              {all.byTag.tags.map((s) => (
                <HBar key={s.tag.id} label={s.tag.name} value={s.done} max={s.planned} text={`${s.done}/${s.planned}`} color={s.tag.color} />
              ))}
            </View>
          ) : undefined
        }
        data={all.byTag.tags.map((s) => ({ label: s.tag.name, value: `${s.done}/${s.planned} done · ${s.minutes} min timed · moved ${s.moved}×` }))}
      />

      <InsightCard
        title="Estimate accuracy"
        gate={all.estimate}
        lines={all.estimate.lines}
        chart={
          <View>
            <HBar label="Estimated" value={100} max={Math.max(100, all.estimate.ratio * 100)} text="100%" color={withAlpha(colors.teal, 0.5)} />
            <HBar label="Actual" value={all.estimate.ratio * 100} max={Math.max(100, all.estimate.ratio * 100)} text={`${Math.round(all.estimate.ratio * 100)}%`} />
          </View>
        }
        data={all.estimate.pairs.map((p, i) => ({ label: `Task ${i + 1}`, value: `estimated ${p.estimate} min, took ${p.actual} min` }))}
      />

      <InsightCard
        title="Energy match"
        gate={all.energy}
        lines={all.energy.lines}
        chart={
          <View>
            {timeCounts.map((x) => (
              <HBar
                key={x.t}
                label={x.t[0].toUpperCase() + x.t.slice(1)}
                value={x.n}
                max={Math.max(...timeCounts.map((y) => y.n), 1)}
                text={`${x.n}`}
                color={colors.teal}
              />
            ))}
          </View>
        }
        data={timeCounts.map((x) => ({ label: `Finished in ${TIME_OF_DAY_LABEL[x.t]}`, value: `${x.n} tasks, ${x.high} high-energy` }))}
      />

      <InsightCard
        title="Feelings after tasks"
        gate={all.feelings}
        lines={all.feelings.lines}
        chart={
          <View style={styles.zoneBar} accessible accessibilityLabel={feelingZones.map((z) => `${z.label} ${all.feelings.mix[z.id]}`).join(', ')}>
            {feelingZones
              .filter((z) => all.feelings.mix[z.id] > 0)
              .map((z) => (
                <View key={z.id} style={{ flex: all.feelings.mix[z.id], backgroundColor: z.accent }} />
              ))}
          </View>
        }
        data={[
          ...feelingZones.map((z) => ({ label: z.label, value: String(all.feelings.mix[z.id]) })),
          ...all.feelings.byTag.map((t) => ({ label: `Tagged ${t.tag.name}`, value: feelingZones.filter((z) => t.mix[z.id] > 0).map((z) => `${z.label} ${t.mix[z.id]}`).join(', ') })),
        ]}
      />

      <InsightCard
        title="Feelings after each tag"
        gate={all.feelGood}
        lines={all.feelGood.lines}
        data={[
          ...all.feelGood.perTag.map((t) => ({ label: t.tag.name, value: `Lively or Calm ${t.pleasant} · Tense or Low ${t.unpleasant} (of ${t.n})` })),
        ]}
      />

      <InsightCard
        title="Busy days"
        gate={all.overload}
        lines={all.overload.lines}
        chart={
          all.overload.days.length > 0 ? (
            <View>
              <HBar label="Busy days" value={all.overload.overRate} max={100} text={`${all.overload.overRate}%`} color={withAlpha(colors.amber, 0.8)} />
              <HBar label="Other days" value={all.overload.otherRate} max={100} text={`${all.overload.otherRate}%`} />
            </View>
          ) : undefined
        }
        data={all.overload.days.map((d) => ({ label: formatDisplayDate(d.date), value: `${Math.round(d.plannedMinutes / 6) / 10} h planned · ${d.rate}% done` }))}
      />

      <Card style={styles.card}>
        <Eyebrow accessibilityRole="header">Moved a few times</Eyebrow>
        {all.moved.length === 0 ? (
          <Caption style={styles.muted}>Nothing has been moved 3 or more times.</Caption>
        ) : (
          <>
            <Caption style={styles.muted}>Some tasks keep moving. That happens; here are three ways to settle them.</Caption>
            {all.moved.slice(0, 5).map((t) => (
              <View key={t.id} style={styles.movedRow}>
                <Body numberOfLines={2}>{resolveTaskTitle(t) || 'Untitled task'}</Body>
                <Caption style={styles.muted}>Moved {t.moveCount} times</Caption>
                <View style={styles.chipRow}>
                  <Pressable style={styles.smallBtn} onPress={() => navigation.push('taskEditor', { taskId: t.id, date: t.date })} accessibilityRole="button" accessibilityHint="Opens the task to add smaller steps">
                    <Caption style={styles.link}>Break it down</Caption>
                  </Pressable>
                  <Pressable
                    style={styles.smallBtn}
                    onPress={() => {
                      setCalMonth(today);
                      setMoveTarget(t);
                    }}
                    accessibilityRole="button"
                  >
                    <Caption style={styles.link}>Reschedule</Caption>
                  </Pressable>
                  <Pressable style={styles.smallBtn} onPress={() => letGo(t)} accessibilityRole="button">
                    <Caption style={styles.link}>Let it go</Caption>
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        )}
      </Card>

      {showStreak && (
        <Card style={styles.card}>
          <View style={styles.cardTop}>
            <Eyebrow accessibilityRole="header">Planning days</Eyebrow>
            <Pressable onPress={() => setSetting('planningStreakCard', false)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Hide the planning days card">
              <Caption style={styles.muted}>Hide</Caption>
            </Pressable>
          </View>
          <SectionHeading>
            {all.streak.current} {all.streak.current === 1 ? 'day' : 'days'}
          </SectionHeading>
          <Caption style={styles.muted}>
            {all.streak.current === 0
              ? 'Plan a day and it starts again from here. Nothing was lost.'
              : all.streak.paused
                ? 'Paused for now. A day or two off never resets it.'
                : 'A day or two off pauses it; it never resets.'}
            {all.streak.best > all.streak.current ? ` Longest run: ${all.streak.best}.` : ''}
          </Caption>
        </Card>
      )}

      <Caption style={styles.footnote}>Insights need at least {MIN_POINTS} data points, and only look at tasks on this phone{prefs.tagIds.length ? ' with the chosen tags' : ''}.</Caption>

      <SheetModal visible={customStep !== null} onClose={() => setCustomStep(null)}>
        <SectionHeading>{customStep === 'start' ? 'From' : 'To'}</SectionHeading>
        <Caption style={styles.muted}>{customStep === 'start' ? 'Pick the first day.' : `From ${customStart ? formatDisplayDate(customStart) : ''}. Pick the last day.`}</Caption>
        <MonthCalendar
          accent={colors.teal}
          month={calMonth}
          onMonthChange={setCalMonth}
          disableFuture={false}
          getDayColor={(d) => (d === customStart ? colors.teal : undefined)}
          onDayPress={(d) => {
            if (customStep === 'start') {
              setCustomStart(d);
              setCustomStep('end');
            } else if (customStart) {
              setPrefs({ range: 'custom', custom: d < customStart ? { start: d, end: customStart } : { start: customStart, end: d } });
              setCustomStep(null);
            }
          }}
        />
      </SheetModal>

      <SheetModal visible={!!moveTarget} onClose={() => setMoveTarget(null)}>
        <SectionHeading>Reschedule</SectionHeading>
        <Caption style={styles.muted}>{moveTarget ? resolveTaskTitle(moveTarget) : ''}</Caption>
        <MonthCalendar
          accent={colors.teal}
          month={calMonth}
          onMonthChange={setCalMonth}
          disableFuture={false}
          disablePast
          onDayPress={(d) => {
            if (moveTarget) {
              useDailyPlanningStore.getState().rescheduleTask(moveTarget.id, moveTarget.date, d, moveTarget.scheduledTime);
              showToast({ message: `Moved to ${formatDisplayDate(d)}` });
            }
            setMoveTarget(null);
          }}
        />
      </SheetModal>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1 },
  muted: { color: colors.inkSoft },
  link: { color: colors.teal, fontFamily: fonts.bodyMedium },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  chip: { paddingVertical: 6, paddingHorizontal: spacing.sm + 2, borderRadius: radii.full, borderWidth: 1, borderColor: colors.line, minHeight: 34, justifyContent: 'center' },
  chipActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  chipTextActive: { color: colors.white },
  rangeText: { color: colors.inkSoft, marginBottom: spacing.sm },
  card: { gap: spacing.sm, marginTop: spacing.md },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chartLoading: { height: 170 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginLeft: spacing.xs },
  hbarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 28 },
  hbarLabel: { width: 90 },
  hbarTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.line, overflow: 'hidden' },
  hbarFill: { height: 10, borderRadius: 5 },
  hbarValue: { minWidth: 44, textAlign: 'right' },
  zoneBar: { flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', backgroundColor: colors.line },
  dataToggle: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' },
  dataRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 4, borderTopWidth: 1, borderTopColor: colors.line },
  movedRow: { gap: 4, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line },
  smallBtn: { paddingVertical: 6, paddingHorizontal: spacing.sm + 2, borderRadius: radii.full, borderWidth: 1, borderColor: colors.teal, minHeight: 34, justifyContent: 'center' },
  footnote: { color: colors.inkSoft, textAlign: 'center', marginTop: spacing.lg },
}));
