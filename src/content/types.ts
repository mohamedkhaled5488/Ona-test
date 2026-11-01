// The written content of the reflective sections: Reflect's questions, Letters
// to Myself, and "Support for this feeling". All of it is hand-written and
// lives in JSON files beside this one (content, not code), each piece with an
// id and a `reviewed` flag. Nothing here is generated. content.test.ts checks
// the shape, the ids and the words (no shame, no diagnosis, no promises).
//
// reviewed: read and approved by a clinician or psychologist (not yet: every
// piece is false until that review). sensitivity "heavy": about loss, the past,
// or the heaviest feelings; heavy Support content is not shown until reviewed
// (the safe grounding and the support list are, always).
import type { FeelingZone } from '../types/sections';

export type Sensitivity = 'standard' | 'heavy';

export interface Reviewable {
  id: string;
  reviewed: boolean;
  sensitivity: Sensitivity;
}

// --- Reflect ---------------------------------------------------------------
export type Depth = 'light' | 'medium' | 'deep';
// A session's shape: arrive, explore, deepen, close.
export type Stage = 'arrive' | 'explore' | 'deepen' | 'close';

export interface ReflectTheme {
  id: string;
  title: string;
  line: string; // under the title, on the theme picker
  opening: string; // the first thing a session in this theme says
  closing: string; // the last
  written: boolean; // false: its questions aren't written yet (not offered)
  reviewed: boolean;
}

export interface ReflectQuestion extends Reviewable {
  theme: string;
  depth: Depth;
  stage: Stage;
  text: string;
  tags: string[];
}

export interface FollowUp extends Reviewable {
  themes: string[]; // empty: any theme
  text: string;
}

export interface ClosingCopy {
  takeaway: string;
  takeawayHint: string;
  deepNote: string; // before a deep question
  saved: string;
  letterOffer: string;
}

// --- Letters to Myself -----------------------------------------------------
export type { LetterKind } from '../types/sections';
import type { LetterKind } from '../types/sections';

export interface LetterKindCopy {
  kind: LetterKind;
  title: string; // "To me when I'm..."
  line: string;
  starters: Reviewable & { texts: string[] };
}

export interface LettersCopy {
  kinds: LetterKindCopy[];
  generalStarters: string[];
  writeTip: string;
  hardFeelingTip: string; // when writing for a Tense or Low feeling
  offer: string; // in the feeling sheet: "You left yourself a note..."
  offerRead: string;
  offerLater: string;
  offerNotNow: string;
  writtenOn: string; // "You wrote this on {date}."
  hideForNow: string;
  dontShowWhenIntense: string;
}

// --- Support for this feeling ----------------------------------------------
export type SupportKind = 'body' | 'mind' | 'do' | 'connect' | 'write';
// Intensity as the feeling sheet records it, 1 (a little) to 5 (very).
export type IntensityRange = [number, number];

export interface SupportLine extends Reviewable {
  intensity: IntensityRange;
  text: string;
}

export interface SupportOption extends Reviewable {
  kind: SupportKind;
  intensity: IntensityRange;
  title: string;
  text: string; // what to do, in a line or two
  why: string; // "Why this can help", modest
  // Where it leads (at most one): a tool from the Quit toolkit (the same
  // screen), the shared breathing exercise, a question to write about (opens
  // Reflect with it), a letter of this kind, or the support lines.
  tool?: string;
  prompt?: string;
  letter?: LetterKind;
  support?: true;
}

export interface ZoneSupport {
  zone: FeelingZone;
  acknowledge: SupportLine[];
  understand: SupportLine[];
  options: SupportOption[];
}

export interface HardModeCopy {
  lines: SupportLine[]; // "You don't have to fix this right now."
  talkTitle: string;
  talkLine: string;
  dangerTitle: string; // when the person's own words or tags point to danger
  dangerLine: string;
  helped: { question: string; yes: string; aLittle: string; notReally: string };
  checkInLater: string;
}
