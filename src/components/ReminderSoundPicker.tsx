// The one sound picker for reminders (tasks, Sleep), with a preview on tap.
// `value` undefined = the default reminder sound from Settings.
import React from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Caption } from './Typography';
import { alarmSoundOptions } from '../data/alarmSounds';
import { playAlarmPreview } from '../utils/alarmPreview';
import { useSettingsStore } from '../store/useSettingsStore';
import { colors, radii, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';
import type { AlarmSoundId } from '../types/sections';

export function ReminderSoundPicker({ value, onChange, testID }: { value: AlarmSoundId | undefined; onChange: (id: AlarmSoundId) => void; testID?: string }) {
  const fallback = useSettingsStore((s) => s.defaultAlarmSound);
  const current = value ?? fallback;
  return (
    <View style={styles.row} accessibilityRole="radiogroup" testID={testID}>
      {alarmSoundOptions.map((opt) => {
        const active = current === opt.id;
        return (
          <Pressable
            key={opt.id}
            onPress={() => {
              onChange(opt.id);
              playAlarmPreview(opt.id);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Sound: ${opt.label}`}
            hitSlop={4}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Ionicons name="musical-note-outline" size={14} color={active ? colors.white : colors.inkSoft} />
            <Caption style={active ? styles.chipTextActive : undefined}>{opt.label}</Caption>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = themedStyles(() => ({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    minHeight: 34,
  },
  chipActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  chipTextActive: { color: colors.white },
}));
