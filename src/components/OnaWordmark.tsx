import React from 'react';
import { Text, TextProps } from 'react-native';
import { colors, fonts } from '../theme';

interface OnaWordmarkProps extends Omit<TextProps, 'style'> {
  size?: number;
  color?: string;
  style?: TextProps['style'];
}

// Shared "Ona" wordmark — Space Grotesk, used anywhere the app name appears
// in-app (About section, onboarding, etc.) instead of re-implementing the
// text styling in multiple places.
export function OnaWordmark({ size = 24, color = colors.ink, style, ...props }: OnaWordmarkProps) {
  return (
    <Text
      {...props}
      style={[{ fontFamily: fonts.headingSemiBold, fontSize: size, color }, style]}
    >
      Ona
    </Text>
  );
}
