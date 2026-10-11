// A numeric PIN pad: dots for entered digits, a 3×4 keypad, and an OK key
// once enough digits are in. Works the same on every platform (no keyboard),
// and every key has a screen-reader label.
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Body, Caption, SectionHeading } from './Typography';
import { colors, fonts, radii, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';
import { PIN_LENGTH } from '../utils/pinLock';
import { tapFeedback } from '../utils/haptics';

interface PinPadProps {
  title: string;
  subtitle?: string;
  error?: string;
  disabled?: boolean;
  // Bumping this clears the entered digits (after a wrong PIN, or a step change).
  resetKey?: number | string;
  onSubmit: (pin: string) => void;
  // Optional extra key in the bottom-left corner (e.g. fingerprint / face).
  extraKey?: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void };
}

export function PinPad({ title, subtitle, error, disabled, resetKey, onSubmit, extraKey }: PinPadProps) {
  const [pin, setPin] = useState('');
  useEffect(() => setPin(''), [resetKey]);

  const press = (d: string) => {
    if (disabled || pin.length >= PIN_LENGTH.max) return;
    tapFeedback();
    setPin(pin + d);
  };
  const del = () => setPin(pin.slice(0, -1));
  const canSubmit = pin.length >= PIN_LENGTH.min && !disabled;

  const key = (d: string) => (
    <Pressable key={d} onPress={() => press(d)} style={({ pressed }) => [styles.key, pressed && styles.keyPressed]} accessibilityRole="button" accessibilityLabel={d} disabled={disabled}>
      <Body style={styles.keyText}>{d}</Body>
    </Pressable>
  );

  return (
    <View style={styles.wrap}>
      <SectionHeading style={styles.center}>{title}</SectionHeading>
      {subtitle ? <Caption style={styles.center}>{subtitle}</Caption> : null}
      <View style={styles.dots} accessibilityLabel={`${pin.length} digits entered`}>
        {Array.from({ length: Math.max(PIN_LENGTH.min, pin.length) }, (_, i) => (
          <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
        ))}
      </View>
      <Caption style={[styles.center, styles.error]} accessibilityLiveRegion="polite">
        {error ?? ' '}
      </Caption>
      <View style={styles.grid}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(key)}
        {extraKey ? (
          <Pressable onPress={extraKey.onPress} style={styles.key} accessibilityRole="button" accessibilityLabel={extraKey.label}>
            <Ionicons name={extraKey.icon} size={26} color={colors.teal} />
          </Pressable>
        ) : (
          <Pressable onPress={del} style={styles.key} accessibilityRole="button" accessibilityLabel="Delete digit" disabled={!pin}>
            <Ionicons name="backspace-outline" size={24} color={pin ? colors.ink : colors.line} />
          </Pressable>
        )}
        {key('0')}
        <Pressable
          onPress={() => canSubmit && onSubmit(pin)}
          style={[styles.key, canSubmit && styles.okKey]}
          accessibilityRole="button"
          accessibilityLabel="OK"
          accessibilityState={{ disabled: !canSubmit }}
        >
          <Ionicons name="checkmark" size={26} color={canSubmit ? colors.white : colors.line} />
        </Pressable>
      </View>
      {extraKey && pin.length > 0 ? (
        <Pressable onPress={del} hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete digit" style={styles.delLink}>
          <Caption>Delete</Caption>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  wrap: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  center: { textAlign: 'center' },
  error: { color: '#D97A70', minHeight: 20 },
  dots: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: colors.inkSoft },
  dotFilled: { backgroundColor: colors.ink, borderColor: colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: 3 * 76 + 2 * spacing.md, gap: spacing.md, justifyContent: 'center', marginTop: spacing.sm },
  key: { width: 76, height: 64, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  keyPressed: { opacity: 0.7 },
  okKey: { backgroundColor: colors.teal, borderColor: colors.teal },
  keyText: { fontFamily: fonts.headingMedium, fontSize: 24, lineHeight: 30 },
  delLink: { marginTop: spacing.xs },
}));
