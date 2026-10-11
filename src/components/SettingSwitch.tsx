import React from 'react';
import { Switch, View } from 'react-native';
import { Caption } from './Typography';
import { colors, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';

// A labelled on/off row for the small settings that live inside each feature.
export function SettingSwitch({
  label,
  value,
  onValueChange,
  accent,
}: {
  label: string;
  value: boolean;
  onValueChange: (on: boolean) => void;
  accent: string;
}) {
  return (
    <View style={styles.row}>
      <Caption style={styles.label}>{label}</Caption>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: accent, false: colors.line }} accessibilityLabel={label} />
    </View>
  );
}

const styles = themedStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.sm },
  label: { flex: 1, color: colors.inkSoft },
}));
