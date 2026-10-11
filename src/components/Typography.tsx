import React from 'react';
import { Text, TextProps } from 'react-native';
import { colors, fonts, fontSizes, lineHeights, letterSpacing } from '../theme';
import { themedStyles } from '../theme/runtime';

export function DisplayTitle({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.displayTitle, style]} />;
}

export function ScreenTitle({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.screenTitle, style]} />;
}

export function SectionHeading({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.sectionHeading, style]} />;
}

export function Body({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.body, style]} />;
}

export function Caption({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.caption, style]} />;
}

// Small uppercase label — the one place besides mood/highlight moments where
// amber is allowed, reserved for framing what a section is really about.
export function Eyebrow({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.eyebrow, style]} />;
}

const styles = themedStyles(() => ({
  displayTitle: {
    fontFamily: fonts.headingSemiBold,
    fontSize: fontSizes.display,
    lineHeight: lineHeights.display,
    letterSpacing: letterSpacing.tight,
    color: colors.ink,
  },
  screenTitle: {
    fontFamily: fonts.headingSemiBold,
    fontSize: fontSizes.xxl,
    lineHeight: lineHeights.xxl,
    letterSpacing: letterSpacing.tight,
    color: colors.ink,
  },
  sectionHeading: {
    fontFamily: fonts.headingMedium,
    fontSize: fontSizes.lg,
    lineHeight: lineHeights.lg,
    color: colors.ink,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: fontSizes.base,
    lineHeight: lineHeights.base,
    color: colors.ink,
  },
  caption: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    lineHeight: lineHeights.sm,
    color: colors.inkSoft,
  },
  eyebrow: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.xs,
    lineHeight: 16,
    letterSpacing: letterSpacing.eyebrow,
    textTransform: 'uppercase',
    color: colors.amber,
  },
}));
