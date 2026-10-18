// The habit graph: a day-by-day pattern (done / minimum / missed / no
// check-in) and, for Build habits, a weekly completion line. Also used for
// Quit habits with their own meaning (clean / resisted / slip). No
// pleasantness or energy here: that belongs to the Feelings graph.
import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Body, Caption } from '../../components/Typography';
import type { PositionedPoint } from '../../components/FeelingsGraph';
import { colors, fonts, radii, spacing } from '../../theme';
import { themedStyles } from '../../theme/runtime';
import { withAlpha } from '../../utils/color';
import { formatDisplayDate, weekdayOfISO } from '../../utils/date';
import { getCalendarWeekStart } from '../../utils/date';
import type { PatternRange, WeekRate, MilestoneBar } from '../../utils/habitPattern';

const FeelingsGraph = React.lazy(() => import('../../components/FeelingsGraph').then((m) => ({ default: m.FeelingsGraph })));

// Missed is a soft neutral, never an alarming red.
export const SOFT_MISSED = '#A39E94';

export interface PatternLegendItem {
  key: string;
  label: string;
  color: string; // fill; 'outline' = empty with a border
  outline?: boolean;
}

export function RangeChips({ value, onChange }: { value: PatternRange; onChange: (r: PatternRange) => void }) {
  const items: { id: PatternRange; label: string }[] = [
    { id: 'month', label: 'This month' },
    { id: 'quarter', label: '3 months' },
    { id: 'all', label: 'All' },
  ];
  return (
    <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Period">
      {items.map((i) => (
        <Pressable
          key={i.id}
          onPress={() => onChange(i.id)}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === i.id }}
          hitSlop={4}
          style={[styles.chip, value === i.id && styles.chipActive]}
        >
          <Caption style={value === i.id ? styles.chipTextActive : undefined}>{i.label}</Caption>
        </Pressable>
      ))}
    </View>
  );
}

// A calendar-like grid: one row per week, one cell per day, the whole range.
export function DayStrip<S extends string>({
  days,
  colorFor,
  labelFor,
  legend,
}: {
  days: { date: string; status: S }[];
  colorFor: (s: S) => { fill: string; outline?: boolean } | null; // null = blank
  labelFor: (s: S) => string;
  legend: PatternLegendItem[];
}) {
  const ws = getCalendarWeekStart();
  const lead = days.length ? (weekdayOfISO(days[0].date) - ws + 7) % 7 : 0;
  const cells: ({ date: string; status: S } | null)[] = [...Array(lead).fill(null), ...days];
  const rows: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  const counts = new Map<string, number>();
  days.forEach((d) => counts.set(labelFor(d.status), (counts.get(labelFor(d.status)) ?? 0) + 1));
  const summary = [...counts.entries()].filter(([l]) => l).map(([l, n]) => `${l}: ${n}`).join(', ');
  return (
    <View>
      <View
        style={styles.grid}
        accessible
        accessibilityLabel={`${formatDisplayDate(days[0]?.date ?? '')} to ${formatDisplayDate(days[days.length - 1]?.date ?? '')}. ${summary}`}
      >
        {rows.map((row, r) => (
          <View key={r} style={styles.row}>
            {Array.from({ length: 7 }, (_, i) => {
              const cell = row[i];
              const look = cell ? colorFor(cell.status) : null;
              return (
                <View
                  key={i}
                  style={[
                    styles.cell,
                    look && !look.outline && { backgroundColor: look.fill },
                    look?.outline && { borderWidth: 1.5, borderColor: look.fill },
                  ]}
                />
              );
            })}
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        {legend.map((l) => (
          <View key={l.key} style={styles.legendItem}>
            <View style={[styles.legendSwatch, l.outline ? { borderWidth: 1.5, borderColor: l.color } : { backgroundColor: l.color }]} />
            <Caption>{l.label}</Caption>
          </View>
        ))}
      </View>
    </View>
  );
}

// Weekly completion, one point per week of the range.
export function WeeklyLine({ weeks, color }: { weeks: WeekRate[]; color: string }) {
  const points: PositionedPoint[] = weeks.flatMap((w, i) =>
    w.rate == null ? [] : [{ key: w.weekStart, date: w.weekStart, score: w.rate, domainIndex: i, color, radius: 4, label: `Week of ${formatDisplayDate(w.weekStart)}: ${w.done} of ${w.planned} (${w.rate}%)` }]
  );
  // Short labels so they never wrap: the month name where a month starts, otherwise the day.
  const labels = weeks.map((w, i) =>
    i === 0 || w.weekStart.slice(5, 7) !== weeks[i - 1].weekStart.slice(5, 7)
      ? new Date(`${w.weekStart}T00:00:00`).toLocaleDateString(undefined, { month: 'short' })
      : String(Number(w.weekStart.slice(8)))
  );
  return (
    <React.Suspense fallback={<View style={styles.chartLoading} />}>
      <FeelingsGraph
        points={points}
        domainSlots={Math.max(1, weeks.length)}
        formatLabel={(i) => labels[i] ?? ''}
        yDomain={[0, 100]}
        baselineAt={null}
        lineColor={color}
        height={170}
        emptyText="Nothing planned in this period yet."
      />
    </React.Suspense>
  );
}

// Two colors: filled up to today, the rest in the soft line color. Markers
// carry only their label; reached ones get a quiet check.
export function MilestoneBarView({ bar, color }: { bar: MilestoneBar; color: string }) {
  return (
    <View
      style={styles.barWrap}
      accessible
      accessibilityLabel={`Day ${bar.day}. ${bar.markers.filter((m) => m.reached).map((m) => m.label).join(', ') || 'No milestones yet'} reached.${bar.next ? ` ${bar.next.daysLeft} ${bar.next.daysLeft === 1 ? 'day' : 'days'} to ${bar.next.label}.` : ''}`}
    >
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${bar.progress * 100}%`, backgroundColor: color }]} />
        {bar.markers.map((m) => (
          <View
            key={m.day}
            style={[
              styles.marker,
              { left: `${m.position * 100}%` },
              m.reached && { backgroundColor: m.justReached ? colors.amber : color, borderColor: m.justReached ? colors.amber : color },
            ]}
          >
            {m.reached && <Ionicons name="checkmark" size={10} color={colors.white} />}
          </View>
        ))}
      </View>
      <View style={styles.markerLabels}>
        {bar.markers.map((m, i) => (
          <Caption
            key={m.day}
            numberOfLines={1}
            style={[
              styles.markerLabel,
              { left: `${m.position * 100}%` },
              i === bar.markers.length - 1 && styles.lastLabel,
              i === 0 && styles.firstLabel,
              m.reached && { color: colors.ink },
            ]}
          >
            {m.label}
          </Caption>
        ))}
      </View>
      {bar.next ? (
        <Body style={styles.next}>
          {bar.next.daysLeft} {bar.next.daysLeft === 1 ? 'day' : 'days'} to {bar.next.label}
        </Body>
      ) : (
        <Body style={styles.next}>Target reached</Body>
      )}
    </View>
  );
}

const CELL = 14;
const styles = themedStyles(() => ({
  chips: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  chip: { paddingVertical: 6, paddingHorizontal: spacing.sm + 2, borderRadius: radii.full, borderWidth: 1, borderColor: colors.line, minHeight: 34, justifyContent: 'center' },
  chipActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  chipTextActive: { color: colors.white },
  grid: { gap: 3 },
  row: { flexDirection: 'row', gap: 3 },
  cell: { width: CELL, height: CELL, borderRadius: 3 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  chartLoading: { height: 170 },
  barWrap: { paddingTop: spacing.sm, paddingHorizontal: spacing.sm },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.line, justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4 },
  marker: {
    position: 'absolute',
    width: 16,
    height: 16,
    marginLeft: -8,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerLabels: { height: 22, marginTop: spacing.sm },
  markerLabel: { position: 'absolute', width: 70, marginLeft: -35, textAlign: 'center', fontSize: 11, color: colors.inkSoft },
  firstLabel: { marginLeft: -8, textAlign: 'left' },
  lastLabel: { marginLeft: -62, textAlign: 'right' },
  next: { marginTop: spacing.xs, fontFamily: fonts.bodyMedium },
}));

export const BUILD_COLORS = (accent: string) => ({
  done: { fill: accent },
  minimum: { fill: withAlpha(accent, 0.45) },
  missed: { fill: SOFT_MISSED },
  none: { fill: colors.line, outline: true },
  off: { fill: withAlpha(colors.line, 0.45) },
  // Days still to come are drawn faintly, so the whole period is always visible.
  future: { fill: withAlpha(colors.line, 0.5), outline: true },
  before: null,
});
