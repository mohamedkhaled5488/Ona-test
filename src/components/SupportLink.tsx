// "Need to talk to someone now? Support lines": one tap to Settings → Safety
// (the verified lines for the person's region). The same link everywhere a
// hard moment can happen: Quit, Reflection, Support for this feeling.
import React from 'react';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Caption } from './Typography';
import { colors, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';
import { openSection } from '../navigation/navigationRef';

export const SUPPORT_LINK_TEXT = 'Need to talk to someone now? Support lines';

export function SupportLink() {
  return (
    <Pressable onPress={() => openSection('settings', { page: 'safety' })} accessibilityRole="link" hitSlop={8} style={styles.link} testID="support-lines-link">
      <Ionicons name="call-outline" size={14} color={colors.inkSoft} />
      <Caption> {SUPPORT_LINK_TEXT}</Caption>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: spacing.lg,
    minHeight: 44,
  },
}));
