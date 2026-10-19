import React, { useMemo, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TextInput } from '../components/TextInput';
import { Card } from '../components/Card';
import { MonthCalendar } from '../components/MonthCalendar';
import { ScreenTitle, Body, Caption } from '../components/Typography';
import { PrimaryButton } from '../components/PrimaryButton';
import { StatRow, InsightCard, DashboardSectionLabel } from '../components/AnalysisParts';
import type { PositionedPoint } from '../components/FeelingsGraph';
import { useUi } from '../components/UiProvider';
import { colors, fonts, radii, spacing } from '../theme';
import { withAlpha } from '../utils/color';
import { addDaysISO, formatDisplayDate, todayISO } from '../utils/date';
import { daysBetweenISO, domainLabels } from '../utils/feelingsStats';
import { weekStart } from '../utils/habitFrequency';
import { zoneMeta } from '../data/feelingsWheel';
import { sessionTagOptions } from '../data/skillPresets';
import { useSkillsStore } from '../store/useSkillsStore';
import { useFeelingsStore } from '../store/useFeelingsStore';
import { minutesByTimeOfDay } from '../utils/skillStats';
import { basedOn, itemFeelingInsight } from '../utils/feelingsInsights';
import { sessionLengthLines } from '../utils/habitStats';
import { shareSkillPortfolioAsText, exportSkillPortfolioAsPdf } from '../utils/skillExport';
import {
  DIFFICULTY_LABELS,
  DIFFICULTY_ORDER,
  detectPlateau,
  effortAndProgress,
  feelingBySubSkill,
  formatHours,
  formatMetricValue,
  learningDuration,
  linearTrend,
  metricSeries,
  monthlyRecap,
  struggleCounts,
  neglectedSubSkills,
  plateauPeriods,
  primaryMetric,
  skillSessionsChrono,
  skillSummary,
  subSkillTime,
  sweetSpot,
  weeklyDifficulty,
  weeklyMinutes,
} from '../utils/skillProgress';
import { LevelDots } from './SkillSetupSheet';
import { SessionDetails } from './SkillParts';
import type { SessionDifficulty } from '../types/sections';
import { themedStyles } from '../theme/runtime';

// Lazy for the same reason as in MoodCheckScreen: Skia's web backend must not
// evaluate before App.tsx has loaded CanvasKit.
const FeelingsGraph = React.lazy(() => import('../components/FeelingsGraph').then((m) => ({ default: m.FeelingsGraph })));

export const DIFFICULTY_COLORS: Record<SessionDifficulty, string> = {
  tooEasy: '#9B87B0',
  justRight: '#4F9B82',
  challenging: '#C99A3D',
  tooHard: '#C97B5A',
};

type MetricView = 'metric' | 'hours' | 'both';

function Toggle<T extends string>({ value, options, onChange, color }: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void; color: string }) {
  return (
    <View style={styles.toggleRow}>
      {options.map((o) => (
        <Pressable key={o.key} onPress={() => onChange(o.key)} style={[styles.chip, value === o.key && { backgroundColor: color, borderColor: color }]}>
          <Caption style={value === o.key ? styles.chipTextActive : undefined}>{o.label}</Caption>
        </Pressable>
      ))}
    </View>
  );
}

// Progression, not consistency: what's improving, where the time goes, and
// what went together with the stretches of more progress — correlational, gated by the
// thresholds in config/skillAnalysis.ts.
export function SkillAnalysisStage({ skillId, onBack, onOpenSession }: { skillId: string; onBack: () => void; onOpenSession: (sessionId: string) => void }) {
  const skills = useSkillsStore((s) => s.skills);
  const allSessions = useSkillsStore((s) => s.sessions);
  const feelings = useFeelingsStore((s) => s.entries);
  const { showToast } = useUi();
  const [metricView, setMetricView] = useState<MetricView>('metric');
  const [month, setMonth] = useState(todayISO());
  const [search, setSearch] = useState('');
  const [subFilter, setSubFilter] = useState<string | null>(null);
  const [difficultyFilter, setDifficultyFilter] = useState<SessionDifficulty | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const skill = skills.find((s) => s.id === skillId);
  const sessions = useMemo(() => skillSessionsChrono(allSessions, skillId), [allSessions, skillId]);

  if (!skill) {
    return (
      <>
        <Pressable onPress={onBack} style={styles.backLink}>
          <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
          <Caption> Back</Caption>
        </Pressable>
        <Body>This skill isn't in your list anymore.</Body>
      </>
    );
  }

  const color = skill.color;
  const today = todayISO();
  const start = sessions[0] && sessions[0].date < skill.startDate ? sessions[0].date : skill.startDate;
  const totalMinutes = sessions.reduce((sum, s) => sum + s.minutes, 0);
  const milestonesReached = skill.milestones.filter((m) => m.achieved).length;
  const dayIndex = (date: string) => daysBetweenISO(start, date);
  const daySlots = Math.max(7, dayIndex(today) + 1);
  const dayLabels = domainLabels(start, daySlots, 'day');

  // --- Chart 1: progress metric ---
  const metric = primaryMetric(skill);
  const series = metric ? metricSeries(allSessions, skillId, metric.id) : [];
  const trend = linearTrend(series);
  const plateaus = metric ? plateauPeriods(series, metric.direction) : [];
  const values = series.map((p) => p.value);
  const vMin = values.length ? Math.min(...values) : 0;
  const vMax = values.length ? Math.max(...values) : 1;
  const pad = Math.max(1, (vMax - vMin) * 0.15);
  // Cumulative hours, one point per day.
  const cumulative: { date: string; hours: number }[] = [];
  let running = 0;
  for (let d = start; d <= today; d = addDaysISO(d, 1)) {
    running += sessions.filter((s) => s.date === d).reduce((sum, s) => sum + s.minutes, 0);
    cumulative.push({ date: d, hours: running / 60 });
  }
  const hoursMax = Math.max(1, running / 60);
  const scale01 = (v: number, lo: number, hi: number) => (hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100);

  const metricPoints: PositionedPoint[] = series.map((p) => ({
    key: p.date,
    date: p.date,
    score: metricView === 'both' ? scale01(p.value, vMin, vMax) : p.value,
    domainIndex: dayIndex(p.date),
    color,
    radius: 4,
    label: metric ? formatMetricValue(p.value, metric.unit) : '',
  }));
  const trendPoints: PositionedPoint[] =
    trend && series.length >= 2
      ? Array.from({ length: dayIndex(series[series.length - 1].date) - dayIndex(series[0].date) + 1 }, (_, i) => {
          const idx = dayIndex(series[0].date) + i;
          const v = trend.intercept + trend.slope * i;
          return { key: `t${idx}`, date: addDaysISO(start, idx), score: v, domainIndex: idx, radius: 0, label: 'Trend' };
        })
      : [];
  const hoursPoints: PositionedPoint[] = cumulative.map((c, i) => ({
    key: `h${c.date}`,
    date: c.date,
    score: metricView === 'both' ? scale01(c.hours, 0, hoursMax) : c.hours,
    domainIndex: i,
    radius: 0,
    label: `${formatHours(Math.round(c.hours * 60))} in total`,
  }));
  const bands = plateaus.map((p) => ({ start: dayIndex(p.start), end: dayIndex(p.end), color: withAlpha(color, 0.14) }));

  // --- Chart 2 & 4: weeks ---
  const weeks = weeklyMinutes(allSessions, skillId, start, today);
  const weekLabel = (i: number) => {
    const every = Math.max(1, Math.ceil(weeks.length / 6));
    return i === 0 || i === weeks.length - 1 || i % every === 0 ? formatShort(weeks[i]?.weekStart) : '';
  };
  const weekPoints: PositionedPoint[] = weeks.map((w, i) => ({
    key: w.weekStart,
    date: w.weekStart,
    score: w.minutes / 60,
    domainIndex: i,
    color,
    label: `Week of ${formatShort(w.weekStart)} · ${formatHours(w.minutes)}`,
  }));
  const difficultyWeeks = weeklyDifficulty(allSessions, skillId, start, today);
  const anyRated = sessions.some((s) => s.difficulty);
  const difficultyPoints: PositionedPoint[] = difficultyWeeks.map((w, i) => {
    const total = DIFFICULTY_ORDER.reduce((sum, d) => sum + w.counts[d], 0);
    return {
      key: `d${w.weekStart}`,
      date: w.weekStart,
      score: total,
      domainIndex: i,
      segments: DIFFICULTY_ORDER.map((d) => ({ value: w.counts[d], color: DIFFICULTY_COLORS[d] })),
      label: total ? DIFFICULTY_ORDER.filter((d) => w.counts[d]).map((d) => `${w.counts[d]} ${DIFFICULTY_LABELS[d].toLowerCase()}`).join(', ') : 'No rated sessions',
    };
  });
  const maxRated = Math.max(1, ...difficultyPoints.map((p) => p.score));

  // --- Chart 3: sub-skill balance ---
  const balance = subSkillTime(skill, allSessions);
  const balanceMax = Math.max(1, ...balance.map((b) => b.minutes));

  // --- Insights ---
  const plateau = metric ? detectPlateau(series, metric.direction, today) : undefined;
  const sweet = metric ? sweetSpot(allSessions, skillId, series, metric.direction) : undefined;
  const effort = metric ? effortAndProgress(allSessions, skillId, series, metric.direction) : undefined;
  const neglected = neglectedSubSkills(skill, allSessions, today).slice(0, 2);
  const struggle = struggleCounts(skill, allSessions);
  const skillFeelings = feelings.filter((f) => f.source?.kind === 'skill' && f.source.refId === skillId);
  const feeling = itemFeelingInsight(skillFeelings, 'after practicing');
  const feelingBySub = feelingBySubSkill(skill, allSessions, feelings);
  const timeOfDay = sessionLengthLines(minutesByTimeOfDay(allSessions, skillId));
  const thisMonth = monthlyRecap(skill, allSessions, today.slice(0, 7));
  const hasInsights = plateau || sweet || effort || neglected.length || struggle || feeling || !!timeOfDay;

  // --- Log ---
  const q = search.trim().toLowerCase();
  const log = [...sessions]
    .reverse()
    .filter((s) => !subFilter || (s.focusSubSkillIds ?? []).includes(subFilter) || (s.struggledSubSkillIds ?? []).includes(subFilter))
    .filter((s) => !difficultyFilter || s.difficulty === difficultyFilter)
    .filter((s) => !tagFilter || s.tag === tagFilter)
    .filter((s) => !q || [s.notes, s.struggledText, s.feedback?.text, formatDisplayDate(s.date)].some((t) => t?.toLowerCase().includes(q)));
  const sessionByDate = new Map(sessions.map((s) => [s.date, s.id]));

  return (
    <>
      <Pressable onPress={onBack} style={styles.backLink}>
        <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
        <Caption> {skill.name}</Caption>
      </Pressable>
      <ScreenTitle>Analysis</ScreenTitle>
      <Caption style={styles.subtitle}>{skill.name} · since {formatDisplayDate(start)}</Caption>

      <StatRow
        accent={color}
        stats={[
          { value: formatHours(totalMinutes), label: 'invested' },
          { value: String(sessions.length), label: sessions.length === 1 ? 'session' : 'sessions' },
          { value: learningDuration(start, today), label: 'learning so far' },
          { value: String(milestonesReached), label: milestonesReached === 1 ? 'milestone reached' : 'milestones reached' },
        ]}
      />
      <Caption style={styles.legend}>Hours are a record of effort, not a measure of mastery.</Caption>

      <Card style={styles.summaryCard}>
        <Body>{skillSummary(skill, allSessions, today) ?? 'Log a few sessions and a summary of how this skill is going will show up here.'}</Body>
      </Card>

      <DashboardSectionLabel>Progress over time</DashboardSectionLabel>
      <Card style={styles.chartCard}>
        {!metric ? (
          <Caption style={styles.empty}>Add a progress metric in setup (anything you can measure, or an overall self-rating) to see your learning curve here.</Caption>
        ) : (
          <>
            <Toggle
              value={metricView}
              color={color}
              onChange={setMetricView}
              options={[
                { key: 'metric', label: metric.name },
                { key: 'hours', label: 'Hours' },
                { key: 'both', label: 'Both' },
              ]}
            />
            <React.Suspense fallback={<View style={styles.chartLoading} />}>
              <FeelingsGraph
                points={metricView === 'hours' ? hoursPoints : metricPoints}
                comparePoints={metricView === 'metric' ? trendPoints : metricView === 'both' ? hoursPoints : undefined}
                compareColor={metricView === 'both' ? colors.inkSoft : color}
                domainSlots={daySlots}
                formatLabel={(i) => dayLabels[i] ?? ''}
                yDomain={metricView === 'metric' ? [vMin - pad, vMax + pad] : metricView === 'hours' ? [0, hoursMax * 1.1] : [0, 105]}
                baselineAt={null}
                lineColor={metricView === 'hours' ? colors.inkSoft : color}
                bands={metricView === 'hours' ? undefined : bands}
                height={220}
                emptyText={metricView === 'hours' ? 'No practice logged yet.' : `No ${metric.name.toLowerCase()} values yet — log one under "Add details" after a session.`}
              />
            </React.Suspense>
            <Caption style={styles.legend}>
              {metricView === 'metric' &&
                `${metric.name}${metric.unit ? ` (${metric.unit})` : ''} · ${metric.direction === 'lower' ? 'lower is better' : 'higher is better'}. Dashed line: the overall trend.`}
              {metricView === 'hours' && 'Total hours invested over time.'}
              {metricView === 'both' && `Solid: ${metric.name}. Dashed: total hours. Each is scaled to its own range so effort and results sit side by side.`}
              {metricView !== 'hours' && plateaus.length > 0 && ' Shaded: steady stretches.'}
            </Caption>
            <Caption style={styles.legend}>Pinch to zoom, drag with two fingers to pan.</Caption>
          </>
        )}
      </Card>

      <DashboardSectionLabel>Practice time per week</DashboardSectionLabel>
      <Card style={styles.chartCard}>
        <React.Suspense fallback={<View style={styles.chartLoading} />}>
          <FeelingsGraph
            variant="bars"
            points={sessions.length ? weekPoints : []}
            domainSlots={Math.max(4, weeks.length)}
            formatLabel={weekLabel}
            yDomain={[0, Math.max(1, ...weekPoints.map((p) => p.score)) * 1.15]}
            baselineAt={skill.weeklyGoalMinutes ? skill.weeklyGoalMinutes / 60 : null}
            height={180}
            emptyText="No practice logged yet."
          />
        </React.Suspense>
        {skill.weeklyGoalMinutes ? <Caption style={styles.legend}>Dashed line: your weekly goal of {formatHours(skill.weeklyGoalMinutes)} — a guide, not a test.</Caption> : null}
      </Card>

      <DashboardSectionLabel>Sub-skill balance</DashboardSectionLabel>
      <Card style={styles.chartCard}>
        {balance.length === 0 ? (
          <Caption style={styles.empty}>Add sub-skills in setup and pick a focus when you log a session to see where your time goes.</Caption>
        ) : (
          balance.map((b) => (
            <View key={b.subSkill.id} style={styles.balanceRow}>
              <View style={styles.balanceHead}>
                <Body style={styles.flex}>{b.subSkill.name}{b.subSkill.archivedAt ? ' (archived)' : ''}</Body>
                <LevelDots value={b.subSkill.level} color={color} />
              </View>
              <View style={styles.balanceTrack}>
                <View style={[styles.balanceFill, { width: `${(b.minutes / balanceMax) * 100}%`, backgroundColor: color }]} />
              </View>
              <Caption style={styles.legend}>{b.minutes > 0 ? `${formatHours(b.minutes)} · ${b.sessions} session${b.sessions === 1 ? '' : 's'}` : 'Not practiced yet'}</Caption>
            </View>
          ))
        )}
      </Card>

      <DashboardSectionLabel>Difficulty feel over time</DashboardSectionLabel>
      <Card style={styles.chartCard}>
        {!anyRated ? (
          <Caption style={styles.empty}>Rate how a session felt (too easy → too hard) under "Add details" to see this over time.</Caption>
        ) : (
          <>
            <React.Suspense fallback={<View style={styles.chartLoading} />}>
              <FeelingsGraph variant="bars" points={difficultyPoints} domainSlots={Math.max(4, difficultyWeeks.length)} formatLabel={weekLabel} yDomain={[0, maxRated * 1.15]} baselineAt={null} height={160} />
            </React.Suspense>
            <View style={styles.legendRow}>
              {DIFFICULTY_ORDER.map((d) => (
                <View key={d} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: DIFFICULTY_COLORS[d] }]} />
                  <Caption style={styles.legend}>{DIFFICULTY_LABELS[d]}</Caption>
                </View>
              ))}
            </View>
            <Caption style={styles.legend}>Research on learning suggests practice near the edge of what you can do helps you improve.</Caption>
          </>
        )}
      </Card>

      <DashboardSectionLabel>Insights</DashboardSectionLabel>
      {!hasInsights && <Caption style={styles.empty}>Keep logging — this gets more useful with more sessions.</Caption>}
      {plateau && metric && (
        <Card style={[styles.plateauCard, { borderLeftColor: color }]}>
          <Caption style={{ color }}>A steady stretch</Caption>
          <Body style={styles.plateauHeadline}>
            Your {metric.name.toLowerCase()} has been steady for about {plateau.weeks} weeks. Plateaus are common in learning and don't mean you've stopped improving.
          </Body>
          <Caption style={styles.legend}>Some things people find useful:</Caption>
          {[
            'Vary the type of practice',
            neglected[0] ? `Spend time on a weaker area, like ${neglected[0].subSkill.name.toLowerCase()}` : 'Spend time on a specific weak area',
            'Adjust the difficulty up or down',
            'Ask someone for feedback',
            "Make sure you're resting enough",
          ].map((t) => (
            <Caption key={t}>• {t}</Caption>
          ))}
        </Card>
      )}
      {sweet && (
        <InsightCard
          kind="Difficulty and progress"
          accent={DIFFICULTY_COLORS.justRight}
          headline={`In stretches where your measure improved more, ${Math.round(sweet.strongShare * 100)}% of rated sessions were "Just right" or "Challenging". In the other stretches, ${Math.round(sweet.weakShare * 100)}%.`}
          evidence="A stretch is the time between two measurements. These went together; that doesn't mean one caused the other."
        />
      )}
      {effort && (
        <InsightCard
          kind="Effort and progress"
          accent={color}
          headline={`Across ${effort.weeks} weeks with a measured change, more practice time and bigger gains went together.`}
          evidence={`How closely they moved together, from 0 (not at all) to 1 (exactly): ${effort.r.toFixed(2)}. That doesn't mean one caused the other.`}
        />
      )}
      {neglected.map((n) => (
        <InsightCard
          key={n.subSkill.id}
          kind="Not practiced lately"
          accent={color}
          headline={n.daysSince === null ? `You haven't practiced ${n.subSkill.name.toLowerCase()} yet.` : `You haven't practiced ${n.subSkill.name.toLowerCase()} in ${n.daysSince >= 14 ? `${Math.round(n.daysSince / 7)} weeks` : `${n.daysSince} days`}.`}
        />
      ))}
      {struggle && (
        <InsightCard
          kind="Struggled with"
          accent={DIFFICULTY_COLORS.tooHard}
          headline={struggle.counts.map((c) => `${c.subSkill.name} ${c.count}`).join(' · ')}
          evidence={`How often each sub-skill was marked in your last ${struggle.of} "struggled with" entries.`}
        />
      )}
      {feeling && (
        <InsightCard
          kind="Feelings after"
          accent={color}
          headline={feeling.headline}
          evidence={[...feelingBySub.map((f) => itemFeelingInsight(f.entries, `after ${f.subSkill.name}`)!.headline), `${basedOn(feeling.n)} logged after a session.`]
            .filter(Boolean)
            .join(' · ')}
        />
      )}
      {timeOfDay && <InsightCard kind="Time of day" accent={color} headline={timeOfDay.headline} evidence={timeOfDay.evidence} />}
      <InsightCard
        kind="This month"
        accent={color}
        headline={`${formatHours(thisMonth.minutes)}, ${thisMonth.sessions} session${thisMonth.sessions === 1 ? '' : 's'}, ${thisMonth.milestones} milestone${thisMonth.milestones === 1 ? '' : 's'} reached.`}
      />

      <DashboardSectionLabel>Practice rhythm</DashboardSectionLabel>
      <Card style={styles.chartCard}>
        <MonthCalendar
          accent={color}
          month={month}
          onMonthChange={setMonth}
          getDayColor={(d) => (sessionByDate.has(d) ? color : undefined)}
          onDayPress={(d) => {
            const id = sessionByDate.get(d);
            if (id) onOpenSession(id);
          }}
        />
        <Caption style={styles.legend}>Context, not a scorecard — tap a day to open that session.</Caption>
      </Card>

      <DashboardSectionLabel>Full log</DashboardSectionLabel>
      {sessions.length === 0 ? (
        <Caption style={styles.empty}>Nothing logged yet.</Caption>
      ) : (
        <>
          <TextInput value={search} onChangeText={setSearch} placeholder="Search notes, struggles, feedback..." placeholderTextColor={colors.inkSoft} style={styles.searchInput} />
          {(skill.subSkills ?? []).length > 0 && (
            <View style={styles.toggleRow}>
              {(skill.subSkills ?? []).map((sub) => (
                <Pressable key={sub.id} onPress={() => setSubFilter(subFilter === sub.id ? null : sub.id)} style={[styles.chip, subFilter === sub.id && { backgroundColor: color, borderColor: color }]}>
                  <Caption style={subFilter === sub.id ? styles.chipTextActive : undefined}>{sub.name}</Caption>
                </Pressable>
              ))}
            </View>
          )}
          <View style={styles.toggleRow}>
            {DIFFICULTY_ORDER.map((d) => (
              <Pressable key={d} onPress={() => setDifficultyFilter(difficultyFilter === d ? null : d)} style={[styles.chip, difficultyFilter === d && { backgroundColor: DIFFICULTY_COLORS[d], borderColor: DIFFICULTY_COLORS[d] }]}>
                <Caption style={difficultyFilter === d ? styles.chipTextActive : undefined}>{DIFFICULTY_LABELS[d]}</Caption>
              </Pressable>
            ))}
            {sessionTagOptions.map((t) => (
              <Pressable key={t} onPress={() => setTagFilter(tagFilter === t ? null : t)} style={[styles.chip, tagFilter === t && { backgroundColor: color, borderColor: color }]}>
                <Caption style={tagFilter === t ? styles.chipTextActive : undefined}>{t}</Caption>
              </Pressable>
            ))}
          </View>
          <View style={styles.logList}>
            {log.map((s) => (
              <Pressable key={s.id} onPress={() => onOpenSession(s.id)}>
                <Card style={[styles.logCard, { borderLeftColor: s.breakthrough ? color : colors.line }]}>
                  <View style={styles.logHead}>
                    <Body>{formatDisplayDate(s.date)}</Body>
                    <Caption>{s.minutes ? formatHours(s.minutes) : ''}</Caption>
                  </View>
                  {s.tag && <Caption style={{ color }}>{s.tag}</Caption>}
                  {s.notes && <Caption numberOfLines={2}>{s.notes}</Caption>}
                  <SessionDetails skill={skill} session={s} compact />
                  {!!s.photoUri && <Image source={{ uri: s.photoUri }} style={styles.logPhoto} resizeMode="cover" />}
                </Card>
              </Pressable>
            ))}
            {log.length === 0 && <Caption style={styles.empty}>No sessions match these filters.</Caption>}
          </View>
        </>
      )}

      {sessions.length > 0 && (
        <>
          <DashboardSectionLabel>Export</DashboardSectionLabel>
          <Card style={styles.exportCard}>
            <Caption style={styles.legend}>Your whole record — sessions, metric history, milestones and the journey.</Caption>
            <View style={styles.row}>
              <PrimaryButton label="Share as text" variant="outline" style={styles.flex} onPress={() => shareSkillPortfolioAsText(skill, sessions)} />
              <PrimaryButton
                label="Export as PDF"
                variant="outline"
                style={styles.flex}
                onPress={async () => {
                  const result = await exportSkillPortfolioAsPdf(skill, sessions);
                  if (!result.ok && result.reason) showToast({ message: result.reason });
                }}
              />
            </View>
          </Card>
        </>
      )}
    </>
  );
}

function formatShort(date: string | undefined): string {
  if (!date) return '';
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const styles = themedStyles(() => ({
  backLink: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  subtitle: { marginTop: 2, marginBottom: spacing.lg },
  summaryCard: { marginTop: spacing.sm },
  chartCard: { gap: spacing.sm },
  chartLoading: { height: 200 },
  legend: { color: colors.inkSoft },
  empty: { color: colors.inkSoft },
  toggleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.xs },
  chip: { paddingVertical: 5, paddingHorizontal: spacing.sm, borderRadius: radii.full, borderWidth: 1, borderColor: colors.line },
  chipTextActive: { color: colors.white },
  balanceRow: { gap: 4, marginBottom: spacing.xs },
  balanceHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  balanceTrack: { height: 10, borderRadius: radii.full, backgroundColor: colors.line, overflow: 'hidden' },
  balanceFill: { height: '100%', borderRadius: radii.full },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: radii.full },
  plateauCard: { borderLeftWidth: 4, gap: spacing.xs, marginBottom: spacing.sm },
  plateauHeadline: { fontFamily: fonts.bodyMedium },
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
  logList: { gap: spacing.sm, marginBottom: spacing.sm },
  logCard: { borderLeftWidth: 3, gap: 2 },
  logHead: { flexDirection: 'row', justifyContent: 'space-between' },
  logPhoto: { width: '100%', height: 120, borderRadius: radii.md, marginTop: spacing.xs },
  exportCard: { gap: spacing.sm, marginBottom: spacing.xl },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
}));
