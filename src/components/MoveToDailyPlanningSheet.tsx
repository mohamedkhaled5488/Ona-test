import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SheetModal } from './SheetModal';
import { MonthCalendar } from './MonthCalendar';
import { TimePickerModal } from './TimePickerModal';
import { PrimaryButton } from './PrimaryButton';
import { SectionHeading, Body, Caption } from './Typography';
import { colors, fonts, radii, spacing } from '../theme';
import { addDaysISO, formatDisplayDate, todayISO } from '../utils/date';
import { themedStyles } from '../theme/runtime';

interface MoveToDailyPlanningSheetProps {
  visible: boolean;
  stepTitle: string;
  onClose: () => void;
  onConfirm: (date: string, time: string | undefined) => void;
}

// The inline date + time picker for "move to Daily Planning" — used the same
// way from every step and sub-step in Plan Builder, so the action always
// looks and behaves identically no matter how deep the step is nested.
export function MoveToDailyPlanningSheet({ visible, stepTitle, onClose, onConfirm }: MoveToDailyPlanningSheetProps) {
  const [date, setDate] = useState(todayISO());
  const [month, setMonth] = useState(todayISO());
  const [showCalendar, setShowCalendar] = useState(false);
  const [time, setTime] = useState<string | undefined>(undefined);
  const [showTimePicker, setShowTimePicker] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const today = todayISO();
    setDate(today);
    setMonth(today);
    setShowCalendar(false);
    setTime(undefined);
  }, [visible]);

  const tomorrow = addDaysISO(todayISO(), 1);

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <SectionHeading>Move to Daily Planning</SectionHeading>
      <Caption style={styles.subtitle} numberOfLines={2}>
        "{stepTitle}" — choose when it should appear.
      </Caption>

      <View style={styles.chipRow}>
        <Pressable
          onPress={() => {
            setDate(todayISO());
            setShowCalendar(false);
          }}
          style={[styles.chip, date === todayISO() && !showCalendar && styles.chipActive]}
        >
          <Body style={date === todayISO() && !showCalendar ? styles.chipTextActive : undefined}>Today</Body>
        </Pressable>
        <Pressable
          onPress={() => {
            setDate(tomorrow);
            setShowCalendar(false);
          }}
          style={[styles.chip, date === tomorrow && !showCalendar && styles.chipActive]}
        >
          <Body style={date === tomorrow && !showCalendar ? styles.chipTextActive : undefined}>Tomorrow</Body>
        </Pressable>
        <Pressable onPress={() => setShowCalendar((v) => !v)} style={[styles.chip, showCalendar && styles.chipActive]}>
          <Body style={showCalendar ? styles.chipTextActive : undefined}>Choose a date</Body>
        </Pressable>
      </View>

      {showCalendar && (
        <MonthCalendar
          accent={colors.teal}
          month={month}
          onMonthChange={setMonth}
          getDayColor={(d) => (d === date ? colors.teal : undefined)}
          onDayPress={setDate}
          disableFuture={false}
        />
      )}

      <Pressable onPress={() => setShowTimePicker(true)} style={styles.timeRow}>
        <Ionicons name="time-outline" size={18} color={time ? colors.teal : colors.inkSoft} />
        <Body style={time ? undefined : styles.timeHint}>{time ?? 'No specific time (optional)'}</Body>
      </Pressable>

      <PrimaryButton
        label={`Add to ${formatDisplayDate(date)}`}
        style={styles.confirmButton}
        onPress={() => {
          onConfirm(date, time);
          onClose();
        }}
      />

      <TimePickerModal
        visible={showTimePicker}
        value={time}
        title="Set a time (optional)"
        onClose={() => setShowTimePicker(false)}
        onPick={setTime}
      />
    </SheetModal>
  );
}

const styles = themedStyles(() => ({
  subtitle: {
    marginTop: 2,
    marginBottom: spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  chipTextActive: {
    color: colors.white,
    fontFamily: fonts.bodyMedium,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  timeHint: {
    color: colors.inkSoft,
  },
  confirmButton: {
    marginTop: spacing.md,
  },
}));
