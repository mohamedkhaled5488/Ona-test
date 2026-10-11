import React from 'react';
import { TextInput as RNTextInput, TextInputProps } from 'react-native';
import { colors, fonts, fontSizes } from '../theme';
import { themedStyles } from '../theme/runtime';

// The one place placeholder styling lives — every text field in the app
// should import TextInput from here instead of 'react-native' directly, so
// placeholder text always reads as distinctly muted (inkSoft) against real
// entered text (ink), without every screen having to remember to set it.
export function TextInput({ style, placeholderTextColor, ...props }: TextInputProps) {
  return (
    <RNTextInput
      placeholderTextColor={placeholderTextColor ?? colors.inkSoft}
      {...props}
      style={[styles.base, style]}
    />
  );
}

const styles = themedStyles(() => ({
  base: {
    fontFamily: fonts.body,
    fontSize: fontSizes.base,
    color: colors.ink,
  },
}));
