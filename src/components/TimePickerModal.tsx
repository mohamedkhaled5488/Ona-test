import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SheetModal } from './SheetModal';
import { PrimaryButton } from './PrimaryButton';
import { SectionHeading, Body, Caption } from './Typography';
import { colors, fonts, radii, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const pad = (n: number) => String(n).padStart(2, '0');

interface TimePickerModalProps {
  visible: boolean;
  value?: string; // HH:MM
  title?: string;
  onClose: () => void;
  onPick: (time: string | undefined) => void;
}

// The hour/minute columns on their own, for screens that need a time inside
// a sheet they already have open (a second stacked Modal is unreliable on iOS).
export function TimeColumns({
  hour,
  minute,
  onHour,
  onMinute,
}: {
  hour: number;
  minute: number;
  onHour: (h: number) => void;
  onMinute: (m: number) => void;
}) {
  return (
    <View style={styles.columns}>
      <View style={styles.column}>
        <Caption style={styles.columnLabel}>Hour</Caption>
        <ScrollView style={styles.scroller} nestedScrollEnabled>
          {HOURS.map((h) => (
            <Pressable key={h} onPress={() => onHour(h)} style={[styles.option, hour === h && styles.optionActive]}>
              <Body style={hour === h ? styles.optionTextActive : undefined}>{pad(h)}</Body>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <View style={styles.column}>
        <Caption style={styles.columnLabel}>Minute</Caption>
        <ScrollView style={styles.scroller} nestedScrollEnabled>
          {MINUTES.map((m) => (
            <Pressable key={m} onPress={() => onMinute(m)} style={[styles.option, minute === m && styles.optionActive]}>
              <Body style={minute === m ? styles.optionTextActive : undefined}>{pad(m)}</Body>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

// "HH:MM" -> the nearest 5-minute slot the columns can show.
export function parseTimeSlot(value: string | undefined): { hour: number; minute: number } {
  if (!value) return { hour: 9, minute: 0 };
  const [h, m] = value.split(':').map(Number);
  const rounded = Math.round(m / 5) * 5;
  return { hour: h, minute: rounded === 60 ? 55 : rounded };
}

export function formatTimeSlot(hour: number, minute: number): string {
  return `${pad(hour)}:${pad(minute)}`;
}

// A picker that behaves identically on iOS, Android and web (no native dependency).
export function TimePickerModal({ visible, value, title = 'Set a time', onClose, onPick }: TimePickerModalProps) {
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const slot = parseTimeSlot(value);
    setHour(slot.hour);
    setMinute(slot.minute);
  }, [visible, value]);

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <SectionHeading>{title}</SectionHeading>
      <Caption style={styles.preview}>{pad(hour)}:{pad(minute)}</Caption>

      <TimeColumns hour={hour} minute={minute} onHour={setHour} onMinute={setMinute} />

      <View style={styles.actions}>
        <PrimaryButton
          label="No time"
          variant="outline"
          style={styles.button}
          onPress={() => {
            onPick(undefined);
            onClose();
          }}
        />
        <PrimaryButton
          label="Set time"
          style={styles.button}
          onPress={() => {
            onPick(`${pad(hour)}:${pad(minute)}`);
            onClose();
          }}
        />
      </View>
    </SheetModal>
  );
}

const styles = themedStyles(() => ({
  preview: {
    fontFamily: fonts.headingSemiBold,
    fontSize: 32,
    lineHeight: 38,
    color: colors.teal,
    textAlign: 'center',
  },
  columns: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  column: {
    flex: 1,
  },
  columnLabel: {
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  scroller: {
    height: 180,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
  },
  option: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  optionActive: {
    backgroundColor: colors.teal,
  },
  optionTextActive: {
    color: colors.white,
    fontFamily: fonts.bodyMedium,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  button: {
    flex: 1,
  },
}));
