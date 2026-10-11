// "Continue with Google", drawn to Google's sign-in branding guidelines:
// the standard multicolour "G" (never recoloured), Roboto Medium 14 text,
// Google's light (white / #747775 outline) or dark (#131314 / #8E918F
// outline) colours to match Ona's theme, and the pill shape Google allows.
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { currentScheme } from '../theme/runtime';

const GOOGLE = {
  light: { fill: '#FFFFFF', stroke: '#747775', text: '#1F1F1F' },
  dark: { fill: '#131314', stroke: '#8E918F', text: '#E3E3E3' },
};

function GoogleG({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

export function GoogleButton({ onPress, busy, disabled }: { onPress: () => void; busy?: boolean; disabled?: boolean }) {
  const c = GOOGLE[currentScheme()];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      style={({ pressed }) => [styles.button, { backgroundColor: c.fill, borderColor: c.stroke }, pressed && styles.pressed, (disabled || busy) && styles.dimmed]}
    >
      <View style={styles.logo} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{busy ? <ActivityIndicator size="small" color={c.text} /> : <GoogleG />}</View>
      <Text style={[styles.label, { color: c.text }]}>Continue with Google</Text>
    </Pressable>
  );
}

// Fixed sizes on purpose: Google's guidelines set them, so they don't follow
// Ona's text-size setting (the system's own font scaling still applies).
const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingLeft: 12,
    paddingRight: 12,
    borderWidth: 1,
    borderRadius: 999,
  },
  logo: { width: 20, height: 20, marginRight: 10, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: 'Roboto_500Medium', fontSize: 14, lineHeight: 20 },
  pressed: { opacity: 0.85 },
  dimmed: { opacity: 0.6 },
});
