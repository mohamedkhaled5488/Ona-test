// Realistic data for real-account tests: about eight weeks of every section,
// from the Demo mode generator, with its ids re-marked ("-seed-" for
// "-demo-") so Ona treats it as ordinary data, not leaked sample data.
//
// Made for a fixed reference date (and "now" at the end of that day), never
// the calendar, so every count in those tests is the same on every day.
// Tests pass the date in; the default is SEED_REFERENCE_DATE.
import { generateDemoData } from '../demo/generate';
import { normalizeField } from '../utils/localData';
import { feelingsToBringIn } from '../feelings/fromSections';
import type { FeelingCheckIn, JournalEntry, QuitFeelingEntry, QuitHabit, QuitTrack } from '../types/sections';

export const SEED_REFERENCE_DATE = '2026-10-21';

export function seededSections(today: string = SEED_REFERENCE_DATE, seed = 'ona-real-account-1'): Record<string, Record<string, unknown>> {
  const images = { sketchEarly: 'file:///seed/sketch-early.png', sketchLatest: 'file:///seed/sketch-latest.png', bookPage: 'file:///seed/book-page.png', practiceNotes: 'file:///seed/practice-notes.png' };
  const [y, m, d] = today.split('-').map(Number);
  const now = new Date(y, m - 1, d, 23, 59).getTime();
  const raw = generateDemoData({ today, seed, images, currency: 'EUR', now }) as unknown as Record<string, Record<string, unknown>>;
  // As the app keeps data: feelings noted in the journal or Quit are in the
  // Feelings log too (feelings/fromSections.ts), so loading it adds nothing.
  const feelings = (raw.feelings.entries ?? []) as FeelingCheckIn[];
  raw.feelings.entries = [
    ...feelings,
    ...feelingsToBringIn(
      {
        journal: (raw.journaling.entries ?? []) as JournalEntry[],
        quitMoments: (raw.quitHabit.feelingEntries ?? []) as QuitFeelingEntry[],
        tracks: (raw.quitHabit.tracks ?? []) as QuitTrack[],
        habits: (raw.quitHabit.habits ?? []) as QuitHabit[],
        feelings,
      },
      now
    ),
  ];
  const plain = JSON.parse(JSON.stringify(raw).split('-demo-').join('-seed-')) as Record<string, Record<string, unknown>>;
  return Object.fromEntries(Object.entries(plain).map(([section, state]) => [section, Object.fromEntries(Object.entries(state).map(([k, v]) => [k, normalizeField(section, k, v)]))]));
}
