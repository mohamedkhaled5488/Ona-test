// Applies Settings → Appearance (theme, accent, text size) to the shared theme
// tokens. Styles are written with themedStyles() instead of StyleSheet.create
// so they're rebuilt from the current tokens whenever the theme changes, and
// font sizes are scaled in one place instead of in every screen.
import { StyleSheet } from 'react-native';
import { colors, darkPalette, lightPalette } from './colors';
import { shadows, SHADOW_OPACITY } from './shadows';

export type ThemeScheme = 'light' | 'dark';
export type AccentId = 'teal' | 'sage' | 'indigo' | 'plum' | 'clay';
export type TextSize = 'system' | 'large' | 'larger' | 'largest';

// Accent colors stay inside the brand palette, with a deeper shade on the
// light theme so white button text keeps enough contrast.
export const ACCENTS: { id: AccentId; label: string; dark: string; light: string }[] = [
  { id: 'teal', label: 'Teal', dark: darkPalette.teal, light: lightPalette.teal },
  { id: 'sage', label: 'Sage', dark: '#7A9E8E', light: '#527565' },
  { id: 'indigo', label: 'Indigo', dark: '#6B7FD1', light: '#4A5DAF' },
  { id: 'plum', label: 'Plum', dark: '#9B87B0', light: '#715C88' },
  { id: 'clay', label: 'Clay', dark: '#C97B5A', light: '#A3583A' },
];

// "system" leaves sizing to the phone's own font-size setting (React Native
// applies it to every Text); the rest add an in-app step on top of it.
export const TEXT_SCALE: Record<TextSize, number> = { system: 1, large: 1.12, larger: 1.25, largest: 1.4 };

export interface ThemeInput {
  scheme: ThemeScheme;
  accent: AccentId;
  textSize: TextSize;
}

let current: ThemeInput = { scheme: 'dark', accent: 'teal', textSize: 'system' };
let version = 0;

export function themeVersion(): number {
  return version;
}

export function currentScheme(): ThemeScheme {
  return current.scheme;
}

export function fontScale(): number {
  return TEXT_SCALE[current.textSize] ?? 1;
}

// Returns true when anything changed (the caller remounts the tree so every
// screen re-reads the new tokens).
export function applyTheme(input: ThemeInput): boolean {
  if (input.scheme === current.scheme && input.accent === current.accent && input.textSize === current.textSize && version > 0) {
    return false;
  }
  current = input;
  const base = input.scheme === 'light' ? lightPalette : darkPalette;
  const accent = ACCENTS.find((a) => a.id === input.accent) ?? ACCENTS[0];
  Object.assign(colors, base, { teal: input.scheme === 'light' ? accent.light : accent.dark });
  const opacity = SHADOW_OPACITY[input.scheme];
  shadows.card.shadowOpacity = opacity.card;
  shadows.raised.shadowOpacity = opacity.raised;
  shadows.button.shadowOpacity = opacity.button;
  version += 1;
  return true;
}

function scaleFonts<T>(styles: T, scale: number): T {
  if (scale === 1) return styles;
  const out: Record<string, unknown> = {};
  for (const [key, style] of Object.entries(styles as Record<string, Record<string, unknown>>)) {
    const next = { ...style };
    if (typeof next.fontSize === 'number') next.fontSize = Math.round(next.fontSize * scale);
    if (typeof next.lineHeight === 'number') next.lineHeight = Math.round(next.lineHeight * scale);
    out[key] = next;
  }
  return out as T;
}

// Drop-in for StyleSheet.create that takes a factory, so the styles can be
// rebuilt from the current theme tokens. Built lazily on first use.
export function themedStyles<T extends StyleSheet.NamedStyles<T>>(factory: () => T): T {
  let built = -1;
  let cache = {} as T;
  const get = (): T => {
    if (built !== version) {
      cache = StyleSheet.create(scaleFonts(factory(), fontScale())) as T;
      built = version;
    }
    return cache;
  };
  return new Proxy({} as T, {
    get: (_t, key) => (get() as Record<string | symbol, unknown>)[key],
    has: (_t, key) => key in (get() as object),
    ownKeys: () => Reflect.ownKeys(get() as object),
    getOwnPropertyDescriptor: (_t, key) => {
      const value = (get() as Record<string | symbol, unknown>)[key];
      return value === undefined ? undefined : { value, enumerable: true, configurable: true, writable: false };
    },
  });
}
