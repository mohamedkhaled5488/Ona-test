import type { SectionId, SectionMeta } from '../types/sections';

// The section registry. A section's `status` decides whether it exists for
// the person: everything that lists, links to, counts or exports sections
// reads only live ones (Home, Settings, the plan table and store text,
// Recap, Demo, Discover, export). Held sections keep their code and their
// data (on the phone and in sync), so turning one on is this one field.
// heldSections.test.ts checks every place.

export const sectionsMeta: SectionMeta[] = [
  {
    id: 'planBuilder',
    title: 'Plan Builder',
    tagline: 'Motive, steps, alternatives — build any plan your way',
    icon: 'compass-outline',
    status: 'live',
  },
  {
    id: 'dailyPlanning',
    title: 'Daily Planning',
    tagline: 'Tasks for any day, with reminders',
    icon: 'calendar-outline',
    status: 'live',
  },
  {
    id: 'journaling',
    title: 'Journaling',
    tagline: 'Color-coded days, one line at a time',
    icon: 'book-outline',
    status: 'live',
  },
  {
    id: 'catchAThought',
    title: 'Catch a Feeling or Idea',
    tagline: 'Quick capture for later',
    icon: 'sparkles-outline',
    status: 'live',
  },
  {
    id: 'studySession',
    title: 'Study Session',
    tagline: 'Pomodoro focus timer',
    icon: 'timer-outline',
    status: 'live',
  },
  {
    id: 'dietPlanning',
    title: 'Diet Planning',
    tagline: 'Plan meals, track cost',
    icon: 'restaurant-outline',
    status: 'live',
  },
  {
    id: 'songwriting',
    title: 'Songwriting',
    tagline: 'Structure and tips by song type',
    icon: 'musical-notes-outline',
    status: 'held',
  },
  {
    id: 'book',
    title: 'Book',
    tagline: 'Quotes, reading sessions & progress for what you’re reading',
    icon: 'library-outline',
    status: 'live',
  },
  {
    id: 'mindGames',
    title: 'Mind Games',
    tagline: 'Four quick mental workouts',
    icon: 'game-controller-outline',
    status: 'held',
  },
  {
    id: 'moodCheck',
    title: 'Identify the Feeling',
    tagline: 'Name it, understand it, work with it',
    icon: 'heart-outline',
    status: 'live',
  },
  {
    id: 'sleep',
    title: 'Sleep',
    tagline: 'Wind down, drift off, wake gently',
    icon: 'moon-outline',
    status: 'live',
  },
  {
    id: 'recap',
    title: 'Recap',
    tagline: 'Your day, at a glance',
    icon: 'grid-outline',
    status: 'live',
  },
  {
    id: 'skills',
    title: 'Skills',
    tagline: 'Track practice and watch it add up',
    icon: 'trending-up-outline',
    status: 'live',
  },
  {
    id: 'habitBuilder',
    title: 'Habit Builder',
    tagline: 'Small, consistent steps toward who you want to be',
    icon: 'link-outline',
    status: 'live',
  },
  {
    id: 'budget',
    title: 'Budget',
    tagline: 'Spending limits and savings goals, your way',
    icon: 'wallet-outline',
    status: 'live',
  },
  {
    id: 'quitHabit',
    title: 'Quit a Habit',
    tagline: 'A journey, not a single unbroken streak',
    icon: 'leaf-outline',
    status: 'live',
  },
  // Working name; held until the owner's final review.
  {
    id: 'reflection',
    title: 'Reflection',
    tagline: 'A space to think with yourself',
    icon: 'chatbubble-ellipses-outline',
    status: 'held',
  },
  // Working name; held until the owner's final review.
  {
    id: 'letters',
    title: 'Letters to Myself',
    tagline: 'Words from you, for the days you need them',
    icon: 'mail-outline',
    status: 'held',
  },
  // Working name; held until the owner's final review.
  {
    id: 'support',
    title: 'Support for this feeling',
    tagline: 'A few ideas for how you feel right now',
    icon: 'hand-left-outline',
    status: 'held',
  },
];

// Read from the list each time (a test can turn a held section on, as it
// will be once it's live).
export const isLive = (id: SectionId): boolean => sectionsMeta.find((m) => m.id === id)?.status === 'live';
export const liveSections = (): SectionMeta[] => sectionsMeta.filter((m) => m.status === 'live');
export const heldSectionIds = (): SectionId[] => sectionsMeta.filter((m) => m.status === 'held').map((m) => m.id);
// A list of sections, without the held ones.
export const onlyLive = <T extends string>(ids: T[]): T[] => ids.filter((id) => !sectionsMeta.some((m) => m.id === id) || isLive(id as never));
