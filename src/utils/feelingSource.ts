import type { FeelingSource } from '../types/sections';

// Where a feeling was logged from, in words for the Feelings Log. The entry
// outlives its source: if the task/book/habit is gone the label says so
// ("deleted task") instead of the entry disappearing.

export interface FeelingSourceLookup {
  // Each returns the source's current name, or undefined if it no longer exists.
  task: (id: string) => string | undefined;
  book: (id: string) => string | undefined;
  habit: (id: string) => string | undefined;
  quitHabit: (id: string) => string | undefined;
  skill: (id: string) => string | undefined;
  study: (id: string) => string | undefined;
  journal: (id: string) => string | undefined; // the entry's date, in words
}

const kindWords: Record<FeelingSource['kind'], { prefix: string; noun: string }> = {
  task: { prefix: 'After a task', noun: 'task' },
  book: { prefix: 'After reading', noun: 'book' },
  habit: { prefix: 'Habit', noun: 'habit' },
  quitHabit: { prefix: 'Quit', noun: 'quit habit' },
  skill: { prefix: 'Skill', noun: 'skill' },
  study: { prefix: 'Study session', noun: 'study session' },
  journal: { prefix: 'Journal', noun: 'journal entry' },
};

export interface FeelingSourceLabel {
  text: string;
  deleted: boolean;
}

export function describeFeelingSource(source: FeelingSource | undefined, lookup: FeelingSourceLookup): FeelingSourceLabel | undefined {
  if (!source) return undefined;
  const words = kindWords[source.kind];
  if (!words) return undefined;
  const name = lookup[source.kind](source.refId);
  if (name === undefined) return { text: `From a deleted ${words.noun}`, deleted: true };
  const prefix = source.kind === 'task' && source.phase === 'before' ? 'Before a task' : words.prefix;
  return { text: name ? `${prefix}: ${name}` : prefix, deleted: false };
}
