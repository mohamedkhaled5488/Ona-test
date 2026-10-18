// "See how this works": a quiet link in a section's empty state that opens
// the Discover tour at that section.
import React from 'react';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Caption } from '../components/Typography';
import { navigateWhenReady } from '../navigation/navigationRef';
import { colors, fonts, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';
import { t } from './content';

export function SeeHowItWorks({ sectionId }: { sectionId: string }) {
  return (
    <Pressable onPress={() => navigateWhenReady('discoverTour', { sectionId })} accessibilityRole="button" accessibilityHint="Opens a short tour of this section" style={styles.row} hitSlop={6}>
      <Ionicons name="compass-outline" size={15} color={colors.teal} />
      <Caption style={styles.text}>{t('seeHow')}</Caption>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, alignSelf: 'flex-start', marginBottom: spacing.sm },
  text: { color: colors.teal, fontFamily: fonts.bodyMedium },
}));
