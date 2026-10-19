import React from 'react';
import { Pressable, Text, PressableProps } from 'react-native';
import { colors, fonts, fontSizes, radii, shadows, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';

interface PrimaryButtonProps extends PressableProps {
  label: string;
  variant?: 'primary' | 'outline';
}

export function PrimaryButton({ label, variant = 'primary', disabled, style, ...props }: PrimaryButtonProps) {
  const isOutline = variant === 'outline';
  return (
    <Pressable
      disabled={disabled}
      // Screen readers hear "button" and, when it is, "dimmed/disabled".
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      {...props}
      style={({ pressed }) => [
        styles.base,
        isOutline ? styles.outline : styles.primary,
        pressed && styles.pressed,
        disabled && styles.disabled,
        typeof style === 'function' ? undefined : style,
      ]}
    >
      <Text style={[styles.label, isOutline && styles.outlineLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  base: {
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: colors.teal,
    ...shadows.button,
  },
  outline: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.teal,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.base,
    color: colors.white,
    // Centered even when a long label wraps onto two lines.
    textAlign: 'center',
  },
  outlineLabel: {
    color: colors.teal,
  },
}));
