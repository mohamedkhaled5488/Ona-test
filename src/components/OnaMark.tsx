import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';

interface OnaMarkProps {
  size?: number;
  style?: StyleProp<ImageStyle>;
}

// The source icon art is a 1024px square with a 220px corner radius —
// matching that ratio keeps the mark's rounding consistent at any size.
const CORNER_RATIO = 220 / 1024;

// The icon-only Ona mark (teal square, converging strokes, amber center) —
// the same source used for the app icon, for anywhere the logo itself
// (not just the wordmark) should appear in-app.
export function OnaMark({ size = 40, style }: OnaMarkProps) {
  return (
    <Image
      source={require('../../assets/icon.png')}
      style={[{ width: size, height: size, borderRadius: size * CORNER_RATIO }, style]}
    />
  );
}
