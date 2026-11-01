// A Pressable whose tap always visibly registers (docs/ona-design-philosophy.md,
// principle 5): a light dip in opacity while pressed. Takes a plain style.
import React from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

export function Tappable({ style, ...props }: Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle> }) {
  return <Pressable {...props} style={({ pressed }) => [style, pressed && { opacity: 0.7 }]} />;
}
