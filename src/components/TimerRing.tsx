import React from 'react';
import { View } from 'react-native';
import { Card } from './Card';
import { PrimaryButton } from './PrimaryButton';
import { SectionHeading, Caption } from './Typography';
import { colors, radii, spacing } from '../theme';
import { withAlpha } from '../utils/color';
import { themedStyles } from '../theme/runtime';

interface TimerRingProps {
  caption: string; // e.g. "Stay with it" / "Reading..."
  timeText: string; // pre-formatted, e.g. "24:10"
  subCaption?: string; // e.g. "Cycle 2"
  variant?: 'default' | 'alt'; // a second accent, e.g. Study's break phase
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

// Shared timer UI — the same ring, clock, and button layout for any section
// that runs a timed session (Study Session's focus/break Pomodoro, Book's
// reading session, and anywhere else a timer belongs later). Purely
// presentational: each caller drives its own clock value and button behavior.
export function TimerRing({
  caption,
  timeText,
  subCaption,
  variant = 'default',
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: TimerRingProps) {
  const isAlt = variant === 'alt';
  return (
    <Card style={[styles.card, isAlt && styles.cardAlt]}>
      <Caption>{caption}</Caption>
      <View style={[styles.ring, isAlt && styles.ringAlt]}>
        <SectionHeading style={styles.timeText}>{timeText}</SectionHeading>
      </View>
      {subCaption && <Caption>{subCaption}</Caption>}
      <View style={styles.buttonRow}>
        <PrimaryButton label={primaryLabel} variant="outline" style={styles.button} onPress={onPrimary} />
        {secondaryLabel && onSecondary && (
          <PrimaryButton label={secondaryLabel} variant="outline" style={styles.button} onPress={onSecondary} />
        )}
      </View>
    </Card>
  );
}

const styles = themedStyles(() => ({
  card: {
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
    paddingVertical: spacing.lg,
  },
  cardAlt: {
    backgroundColor: withAlpha(colors.amber, 0.1),
  },
  ring: {
    width: 160,
    height: 160,
    borderRadius: radii.full,
    borderWidth: 6,
    borderColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringAlt: {
    borderColor: colors.amber,
  },
  timeText: {
    fontSize: 32,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  button: {
    flex: 1,
  },
}));
