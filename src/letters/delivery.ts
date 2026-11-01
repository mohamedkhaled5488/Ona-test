// When a letter to yourself is offered. Pure, so every rule is tested:
// - Only after the person logs a matching feeling (any section, through
//   logFeeling), at most one offer per feeling logged, never opened without a
//   choice. Or, for a dated letter, on and after its day.
// - "To me, when I feel…": the colour or the specific feeling; "when I doubt
//   myself" / "when I'm proud": feelings of that kind; "on a hard day": Low or
//   Tense.
// - A very strong feeling (4 or 5 of 5): only letters the person said may be
//   shown then.
// - Several match: the one not shown for longest first ("See another" goes on).
// - Paused, hidden, or the other phone's copy after a conflict: never offered.
import type { FeelingCheckIn, Letter, LetterKind } from '../types/sections';
import { localDateOf } from '../quit/journey';

// Feelings that read as doubting yourself, or as pride (feelingsWheel ids).
export const DOUBT_FEELINGS = ['scared-insecure', 'sad-inadequate', 'sad-inferior', 'scared-insignificant', 'okay-unsure', 'scared-foolish', 'sad-stupid', 'scared-discouraged', 'scared-weak', 'scared-helpless'];
export const PROUD_FEELINGS = ['powerful-proud', 'powerful-confident', 'powerful-satisfied', 'powerful-worthwhile', 'powerful-valuable', 'powerful-respected', 'powerful-appreciated'];

export const isIntense = (f: Pick<FeelingCheckIn, 'intensities'>) => Object.values(f.intensities ?? {}).some((v) => (v ?? 0) >= 4);

export function letterMatches(l: Letter, f: Pick<FeelingCheckIn, 'zone' | 'feelingIds'>): boolean {
  switch (l.kind) {
    case 'feeling':
      return l.zones.includes(f.zone) || f.feelingIds.some((id) => l.feelingIds.includes(id));
    case 'doubt':
      return f.feelingIds.some((id) => DOUBT_FEELINGS.includes(id));
    case 'proud':
      return f.feelingIds.some((id) => PROUD_FEELINGS.includes(id));
    case 'hardDay':
      return f.zone === 'low' || f.zone === 'tense';
    case 'date':
      return false;
  }
}

const offerable = (l: Letter) => !l.paused && !l.hidden && !l.conflictCopyOf && l.text.trim().length > 0;
const byLongestUnseen = (a: Letter, b: Letter) => (a.lastShownAt ?? '') .localeCompare(b.lastShownAt ?? '') || a.createdAt.localeCompare(b.createdAt);

// The letters to offer for this feeling, the first one first. Only letters
// written before the feeling was (a letter isn't offered for the feeling it
// was just written in).
export function lettersFor(f: FeelingCheckIn, letters: Letter[]): Letter[] {
  const strong = isIntense(f);
  return letters.filter((l) => offerable(l) && l.createdAt < f.createdAt && letterMatches(l, f) && (!strong || l.showWhenIntense)).sort(byLongestUnseen);
}

// Dated letters whose day has come and that haven't been opened.
export function lettersDue(letters: Letter[], today: string): Letter[] {
  return letters.filter((l) => l.kind === 'date' && offerable(l) && !!l.deliverOn && l.deliverOn <= today && !l.deliveredAt).sort((a, b) => a.deliverOn!.localeCompare(b.deliverOn!));
}

// What a person sees with a letter: when they wrote it, never more.
export const writtenOnDate = (l: Letter) => localDateOf(l.createdAt);

// A hard-feeling letter gets the gentle tip while it's written.
export const needsHardTip = (kind: LetterKind, zones: Letter['zones']) => kind === 'hardDay' || kind === 'doubt' || zones.includes('low') || zones.includes('tense');

// The reminder for a dated letter: nothing of the letter and no feeling, so a
// locked screen shows nothing private. Local 9:00 on the day (the phone's own
// time zone, whatever the day's daylight saving).
export const LETTER_REMINDER = { title: 'Something you wrote is waiting for you', body: "Open Ona when you're ready." };
export function reminderTime(deliverOn: string): Date {
  const [y, m, d] = deliverOn.split('-').map(Number);
  return new Date(y, m - 1, d, 9, 0, 0, 0);
}
