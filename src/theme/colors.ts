// Ona brand palette. Dark is the original theme: ink and stone swap roles
// (ink becomes the light text color, stone the near-black background), and
// teal is brightened so it stays legible as an icon/text accent. Light keeps
// the same brand family on a warm paper background.
//
// `colors` is one mutable object every screen reads from. Settings → Appearance
// swaps its values in place (see theme/runtime.ts), and styles built with
// themedStyles() rebuild themselves on the next render.

export interface Palette {
  stone: string; // background — stays warm
  surface: string; // elevated cards/chips
  teal: string; // primary actions, brand core (the user's accent choice)
  amber: string; // RESERVED for highlights/motivation — never general UI
  ink: string; // primary text
  inkSoft: string; // secondary/muted text
  line: string; // borders, dividers
  white: string;
}

export const darkPalette: Palette = {
  stone: '#17150F',
  surface: '#212226', // cool neutral gray, contrasts against the warm background
  teal: '#4F9B82',
  amber: '#D98F4E',
  ink: '#F2EEE6',
  inkSoft: '#9C968A',
  line: '#35373C', // cool to match the card surface
  white: '#FFFFFF',
};

export const lightPalette: Palette = {
  stone: '#F4F1EA',
  surface: '#FFFFFF',
  teal: '#3E806B',
  amber: '#B96F2E',
  ink: '#1E1C17',
  inkSoft: '#6A655B',
  line: '#DDD8CD',
  white: '#FFFFFF',
};

export const colors: Palette = { ...darkPalette };
