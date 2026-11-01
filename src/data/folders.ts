import type { FolderId, SectionId } from '../types/sections';
import { onlyLive } from './sectionsMeta';

export interface FolderMeta {
  id: FolderId;
  title: string;
  tagline: string;
  icon: keyof typeof import('@expo/vector-icons/Ionicons').default.glyphMap;
  // Section ids shown as cards inside this folder. 'habits' is a special
  // pseudo-card (not a real SectionId) — it opens the Habits hub, a Build/Quit
  // mode switch over habitBuilder + quitHabit, rather than a section directly.
  sections: (SectionId | 'habits')[];
}

// The final navigation structure — Home (Recap) + 4 folders. See the Ona
// navigation restructure doc. Catch a Feeling or Idea lives inside Journaling
// (a header link there, not its own card) and Habit Builder + Quit a Habit
// are combined into one "Habits" card with a Build/Quit mode switch.
// Held sections (status in data/sectionsMeta.ts) are never listed here
// (heldSections.test.ts).
// Card metadata for the 'habits' pseudo-section (see FolderMeta above).
export const habitsCardMeta = {
  title: 'Habits',
  tagline: 'Build a new habit, or work on quitting one',
  icon: 'link-outline' as const,
};

export const folders: FolderMeta[] = [
  {
    id: 'plan',
    title: 'Plan',
    tagline: 'Build a plan, work your days, and keep the numbers straight',
    icon: 'compass-outline',
    sections: ['planBuilder', 'dailyPlanning', 'dietPlanning', 'budget'],
  },
  {
    id: 'reflect',
    title: 'Reflect',
    tagline: 'Write it down, name what you feel, wind down',
    icon: 'book-outline',
    // Reflection, Letters and Support: listed once live (held until then).
    sections: onlyLive<SectionId | 'habits'>(['journaling', 'moodCheck', 'sleep', 'reflection', 'letters', 'support']),
  },
  {
    id: 'grow',
    title: 'Grow',
    tagline: 'Build habits and track practice over time',
    icon: 'trending-up-outline',
    sections: ['habits', 'skills'],
  },
  {
    id: 'learn',
    title: 'Learn',
    tagline: 'Read, study, and focus',
    icon: 'library-outline',
    sections: ['book', 'studySession'],
  },
];
