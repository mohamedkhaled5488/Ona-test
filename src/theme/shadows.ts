// Soft, low-contrast shadows tuned to the stone/ink palette — depth without noise.
// react-native-web translates these into box-shadow automatically. The light
// theme uses much fainter shadows (see theme/runtime.ts).
export const shadows = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 3,
  },
  raised: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 8,
  },
  button: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
};

export const SHADOW_OPACITY = {
  dark: { card: 0.35, raised: 0.45, button: 0.35 },
  light: { card: 0.07, raised: 0.16, button: 0.12 },
};
