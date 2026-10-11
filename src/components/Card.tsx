import React from 'react';
import { View, ViewProps } from 'react-native';
import { colors, radii, shadows, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';

interface CardProps extends ViewProps {
  flat?: boolean; // no shadow/border — for cards that sit inside another card/surface
}

export function Card({ style, flat, ...props }: CardProps) {
  return <View {...props} style={[styles.card, flat && styles.flat, style]} />;
}

const styles = themedStyles(() => ({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md + 2,
    ...shadows.card,
  },
  flat: {
    shadowOpacity: 0,
    elevation: 0,
    borderWidth: 0,
  },
}));
