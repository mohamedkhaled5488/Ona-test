import type { SongType } from '../types/sections';

export const songTypes: SongType[] = [
  {
    id: 'pop',
    name: 'Pop',
    structure: ['Verse 1', 'Pre-Chorus', 'Chorus', 'Verse 2', 'Pre-Chorus', 'Chorus', 'Bridge', 'Chorus'],
    tips: ['Keep the chorus hook under 10 words', 'Repeat the title early and often'],
    partTips: {
      Verse: 'Set a scene or tell part of the story — save the big statement for the chorus.',
      'Pre-Chorus': 'Build tension here so the chorus feels like a release.',
      Chorus: 'This is the hook — keep it simple and repeatable, and land the title in it.',
      Bridge: 'Shift the perspective or energy once, then let the final chorus hit harder.',
    },
  },
  {
    id: 'ballad',
    name: 'Ballad',
    structure: ['Verse 1', 'Verse 2', 'Chorus', 'Verse 3', 'Chorus', 'Bridge', 'Final Chorus'],
    tips: ['Let the melody breathe with longer notes', 'Build dynamics slowly toward the bridge'],
    partTips: {
      Verse: 'Let details accumulate — ballads reward specificity over three verses.',
      Chorus: 'Keep it emotionally direct rather than clever.',
      Bridge: 'A good spot for the emotional turn or the line that reframes everything before it.',
      'Final Chorus': 'Consider raising the key or adding one new line to justify repeating it again.',
    },
  },
  {
    id: 'rap',
    name: 'Rap',
    structure: ['Intro', 'Verse 1 (16 bars)', 'Hook', 'Verse 2 (16 bars)', 'Hook', 'Verse 3 (16 bars)', 'Outro'],
    tips: ['Vary your flow between verses', 'Save your best punchline for the last verse'],
    partTips: {
      Intro: 'Set tone fast — you have a few bars before people decide to keep listening.',
      Verse: 'Vary your rhyme scheme and flow so 16 bars in a row doesn’t feel flat.',
      Hook: 'Make it chantable — simpler than the verses, and repeatable after one listen.',
      Outro: 'Land on your strongest line, not a fade-out afterthought.',
    },
  },
  {
    id: 'folk',
    name: 'Folk',
    structure: ['Verse 1', 'Verse 2', 'Chorus', 'Verse 3', 'Chorus', 'Verse 4'],
    tips: ['Favor plain, concrete language over abstraction', 'A strong refrain matters more than a big chorus'],
    partTips: {
      Verse: 'Folk lives in narrative detail — a name, a place, a specific object.',
      Chorus: 'Often more of a refrain than a pop chorus — a line that recurs and deepens with context.',
    },
  },
  {
    id: 'rnb',
    name: 'R&B',
    structure: ['Verse 1', 'Pre-Chorus', 'Chorus', 'Verse 2', 'Pre-Chorus', 'Chorus', 'Bridge', 'Chorus'],
    tips: ['Leave room in the lyric for melodic runs and ad-libs', 'Groove matters as much as the words'],
    partTips: {
      Verse: 'Conversational phrasing works well — like you’re telling someone directly.',
      'Pre-Chorus': 'A good place for a melodic lift before the chorus lands.',
      Chorus: 'Simple, repeatable phrasing leaves room for vocal runs on top.',
      Bridge: 'A natural spot for a key change or a stripped-back moment.',
    },
  },
];
