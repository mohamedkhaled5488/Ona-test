import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Body, Caption } from './Typography';
import { colors, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';

// A checkbox with a label — for consents, which must be ticked on purpose
// (never pre-ticked).
export function CheckRow({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      style={styles.row}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
    >
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={22} color={checked ? colors.teal : colors.inkSoft} />
      <View style={styles.text}>
        <Body>{label}</Body>
        {detail ? <Caption>{detail}</Caption> : null}
      </View>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.xs },
  text: { flex: 1, gap: 2 },
}));
