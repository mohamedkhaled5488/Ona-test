// Ona type system — Space Grotesk for headings, Inter for body/UI. Caveat and
// Patrick Hand are opt-in handwriting styles offered only inside Journaling's
// entry font picker — never the default, never used for headings/wordmark.
export const fonts = {
  headingMedium: 'SpaceGrotesk_500Medium',
  headingSemiBold: 'SpaceGrotesk_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  handwritingCaveat: 'Caveat_500Medium',
  handwritingPatrickHand: 'PatrickHand_400Regular',
} as const;

export const fontSizes = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 19,
  xl: 23,
  xxl: 30,
  display: 38,
} as const;

export const lineHeights = {
  xs: 16,
  sm: 20,
  base: 24,
  lg: 26,
  xl: 30,
  xxl: 36,
  display: 42,
} as const;

export const letterSpacing = {
  tight: -0.6,
  eyebrow: 1.2,
} as const;
