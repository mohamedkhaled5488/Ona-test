import type { SkillType } from '../types/sections';

export const skillTypeMeta: Record<SkillType, { label: string; prompt: string }> = {
  music: { label: 'Music', prompt: 'What did you work on — technique, repertoire, or theory?' },
  language: { label: 'Language', prompt: 'New vocab, grammar, or conversation practice today?' },
  art: { label: 'Art', prompt: 'What technique or subject did you focus on?' },
  sport: { label: 'Sport', prompt: 'What skill, drill, or drill combo did you work on?' },
  craft: { label: 'Craft', prompt: 'What technique or project did you move forward?' },
  other: { label: 'Other', prompt: 'What did you work on, and what felt hard or improved?' },
};

export const skillTypeOptions: SkillType[] = ['music', 'language', 'art', 'sport', 'craft', 'other'];

export const skillColorOptions: string[] = [
  '#8A8F4D', // olive (default, matches the section accent)
  '#C97B5A', // coral
  '#5B8FC7', // blue
  '#B072A0', // magenta-violet
  '#C9A430', // gold
  '#6B7FD1', // indigo
  '#7FAE68', // green
  '#9B87B0', // lavender
];

export const skillIconOptions: (keyof typeof import('@expo/vector-icons/Ionicons').default.glyphMap)[] = [
  'musical-notes-outline',
  'language-outline',
  'color-palette-outline',
  'basketball-outline',
  'hammer-outline',
  'barbell-outline',
  'code-slash-outline',
  'trending-up-outline',
];

export const sessionTagOptions: string[] = ['technique', 'creative practice', 'theory', 'review'];

export interface MetricTemplate {
  name: string;
  unit: string;
  direction: 'higher' | 'lower';
  selfRating?: boolean;
}

// For skills with no natural number (drawing, writing).
export const SELF_RATING_METRIC: MetricTemplate = { name: 'Overall self-rating', unit: '/10', direction: 'higher', selfRating: true };

// Suggestions only — every one is editable or skippable.
export const skillTemplates: Record<SkillType, { subSkills: string[]; metrics: MetricTemplate[] }> = {
  music: {
    subSkills: ['Chords', 'Rhythm', 'Technique', 'Reading', 'Repertoire'],
    metrics: [
      { name: 'Songs played cleanly', unit: 'songs', direction: 'higher' },
      { name: 'Tempo', unit: 'BPM', direction: 'higher' },
      SELF_RATING_METRIC,
    ],
  },
  language: {
    subSkills: ['Vocabulary', 'Grammar', 'Listening', 'Speaking', 'Reading', 'Writing'],
    metrics: [
      { name: 'Vocabulary learned', unit: 'words', direction: 'higher' },
      { name: 'Conversation length', unit: 'min', direction: 'higher' },
      SELF_RATING_METRIC,
    ],
  },
  art: {
    subSkills: ['Line', 'Shading', 'Color', 'Composition', 'Anatomy'],
    metrics: [SELF_RATING_METRIC, { name: 'Pieces finished', unit: 'pieces', direction: 'higher' }],
  },
  sport: {
    subSkills: ['Endurance', 'Technique', 'Strength', 'Speed', 'Flexibility'],
    metrics: [
      { name: '5K time', unit: 'min', direction: 'lower' },
      { name: 'Plank hold', unit: 'sec', direction: 'higher' },
      SELF_RATING_METRIC,
    ],
  },
  craft: {
    subSkills: ['Technique', 'Precision', 'Design', 'Finishing'],
    metrics: [SELF_RATING_METRIC, { name: 'Projects finished', unit: 'projects', direction: 'higher' }],
  },
  other: {
    subSkills: [],
    metrics: [
      { name: 'Typing speed', unit: 'WPM', direction: 'higher' },
      { name: 'Time to complete', unit: 'min', direction: 'lower' },
      SELF_RATING_METRIC,
    ],
  },
};
