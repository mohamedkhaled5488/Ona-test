import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Caption, SectionHeading } from './Typography';
import { colors, radii, spacing } from '../theme';
import { addMonthsISO, formatMonthLabel, getMonthGrid, rotateWeekdays, todayISO } from '../utils/date';
import { useSettingsStore } from '../store/useSettingsStore';
import { themedStyles } from '../theme/runtime';

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface MonthCalendarProps {
  accent: string;
  month: string; // any ISO date within the month being shown
  onMonthChange: (month: string) => void;
  // Returns the fill color for a day that has something logged, or undefined
  // for an empty day (rendered as an outlined, unfilled cell). Ignored when
  // getDayColors is also supplied.
  getDayColor?: (date: string) => string | undefined;
  // For a day with more than one thing logged in different colors (e.g.
  // Identify the Feeling's blended two-word check-ins) — up to 2 colors,
  // rendered as a split cell instead of picking one arbitrarily. Takes
  // priority over getDayColor when both are given.
  getDayColors?: (date: string) => string[] | undefined;
  onDayPress?: (date: string) => void;
  disableFuture?: boolean;
  disablePast?: boolean; // e.g. picking a date to reschedule something to
}

// A real, readable month-calendar grid — large tappable day cells with the
// day number always visible, a week header, month navigation, and a clear
// ring around today. Shared by Skills' practice calendar, Habit Builder's
// streak calendar, Journaling, and Identify the Feeling's Patterns tab, so
// all four stay visually consistent.
export function MonthCalendar({
  accent,
  month,
  onMonthChange,
  getDayColor,
  getDayColors,
  onDayPress,
  disableFuture = true,
  disablePast = false,
}: MonthCalendarProps) {
  const weekStartsOn = useSettingsStore((s) => s.weekStartsOn);
  const grid = getMonthGrid(month, weekStartsOn);
  const today = todayISO();

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable hitSlop={8} onPress={() => onMonthChange(addMonthsISO(month, -1))}>
          <Ionicons name="chevron-back" size={20} color={colors.ink} />
        </Pressable>
        <SectionHeading>{formatMonthLabel(month)}</SectionHeading>
        <Pressable hitSlop={8} onPress={() => onMonthChange(addMonthsISO(month, 1))}>
          <Ionicons name="chevron-forward" size={20} color={colors.ink} />
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {rotateWeekdays(weekdayLabels, weekStartsOn).map((label) => (
          <Caption key={label} style={styles.weekdayLabel}>
            {label}
          </Caption>
        ))}
      </View>

      <View style={styles.grid}>
        {grid.map((date, i) => {
          if (!date) return <View key={`blank-${i}`} style={styles.dayCell} />;
          const colors2 = getDayColors?.(date);
          const color = colors2?.[0] ?? getDayColor?.(date);
          const isSplit = !!colors2 && colors2.length >= 2;
          const isToday = date === today;
          const isFuture = date > today;
          const dayNumber = Number(date.slice(-2));
          const disabled = (disableFuture && isFuture) || (disablePast && date < today);
          return (
            <Pressable
              key={date}
              disabled={disabled || !onDayPress}
              onPress={() => onDayPress?.(date)}
              style={styles.dayCell}
            >
              <View
                style={[
                  styles.dayBlock,
                  !isSplit && (color ? { backgroundColor: color } : styles.dayBlockEmpty),
                  isToday && { borderWidth: 2, borderColor: accent },
                  disabled && styles.dayBlockDisabled,
                ]}
              >
                {isSplit && (
                  <View style={styles.splitFill} pointerEvents="none">
                    <View style={[styles.splitHalf, { backgroundColor: colors2![0] }]} />
                    <View style={[styles.splitHalf, { backgroundColor: colors2![1] }]} />
                  </View>
                )}
                <Caption style={[styles.dayNumber, !!color && styles.dayNumberOnColor]}>{dayNumber}</Caption>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const CELL_SIZE = 42;

const styles = themedStyles(() => ({
  wrap: {
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayLabel: {
    width: `${100 / 7}%`,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingVertical: 3,
  },
  dayBlock: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  splitFill: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
  },
  splitHalf: {
    flex: 1,
  },
  dayBlockEmpty: {
    backgroundColor: colors.stone,
    borderWidth: 1,
    borderColor: colors.line,
  },
  dayBlockDisabled: {
    opacity: 0.35,
  },
  dayNumber: {
    fontSize: 14,
  },
  dayNumberOnColor: {
    color: colors.white,
  },
}));
