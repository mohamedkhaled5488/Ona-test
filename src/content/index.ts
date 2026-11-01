// The written content (types.ts), loaded from its JSON files and typed. The
// app reads content only from here. A new Reflect theme's questions or a
// feeling word's Support text is a new JSON file added below.
import type { FeelingZone } from '../types/sections';
import type { ClosingCopy, FollowUp, HardModeCopy, LettersCopy, ReflectQuestion, ReflectTheme, SupportLine, SupportOption, WordSupport, ZoneSupport } from './types';
import themesJson from './reflect/themes.json';
import whereIAm from './reflect/where-i-am.json';
import knowMyself from './reflect/know-myself.json';
import gratitude from './reflect/gratitude.json';
import values from './reflect/values.json';
import lettingGo from './reflect/letting-go.json';
import decisionQuestions from './reflect/decision.json';
import relationshipsQuestions from './reflect/relationships.json';
import workQuestions from './reflect/work.json';
import fearsQuestions from './reflect/fears.json';
import reviewQuestions from './reflect/review.json';
import avoidingQuestions from './reflect/avoiding.json';
import becomingQuestions from './reflect/becoming.json';
import followUpsJson from './reflect/followUps.json';
import lettersJson from './letters/letters.json';
import lively from './support/lively.json';
import calm from './support/calm.json';
import tense from './support/tense.json';
import low from './support/low.json';
import okay from './support/okay.json';
import hardModeJson from './support/hardMode.json';
import wordsLively from './support/words/lively.json';
import wordsCalm from './support/words/calm.json';
import wordsTense from './support/words/tense.json';
import wordsLow from './support/words/low.json';
import wordsOkay from './support/words/okay.json';

export const REFLECT_THEMES = themesJson as ReflectTheme[];
export const REFLECT_QUESTIONS = [...whereIAm, ...knowMyself, ...gratitude, ...values, ...lettingGo, ...decisionQuestions, ...relationshipsQuestions, ...workQuestions, ...fearsQuestions, ...reviewQuestions, ...avoidingQuestions, ...becomingQuestions] as ReflectQuestion[];
export const FOLLOW_UPS = followUpsJson.followUps as FollowUp[];
export const REFLECT_CLOSING = followUpsJson.closing as ClosingCopy;

export const LETTERS = lettersJson as LettersCopy;

export const ZONE_SUPPORT = { lively, calm, tense, low, okay } as unknown as Record<FeelingZone, ZoneSupport>;
export const HARD_MODE = hardModeJson as HardModeCopy;
// Each of the 89 feeling words' own Support lines, by feeling id.
export const WORD_SUPPORT: Record<string, WordSupport> = Object.fromEntries(([...wordsLively, ...wordsCalm, ...wordsTense, ...wordsLow, ...wordsOkay] as WordSupport[]).map((w) => [w.feelingId, w]));

// Where a Support option can lead: a Quit toolkit tool (the same screen) or
// the shared breathing exercise. content.test.ts checks every link.
export const BREATHING_TOOL = 'breathing';

// Every piece with an id and a review flag, for the review document and the
// content checks.
export function allReviewable(): (ReflectQuestion | FollowUp | SupportLine | SupportOption | { id: string; reviewed: boolean; sensitivity: string; texts: string[] })[] {
  return [
    ...REFLECT_QUESTIONS,
    ...FOLLOW_UPS,
    ...LETTERS.kinds.map((k) => k.starters),
    ...Object.values(ZONE_SUPPORT).flatMap((z) => [...z.acknowledge, ...z.understand, ...z.options]),
    ...HARD_MODE.lines,
    ...Object.values(WORD_SUPPORT).flatMap((w) => [...w.acknowledge, ...w.options]),
  ];
}

// Every sentence a person can read, with where it's from (for the checks).
export function allText(): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  const add = (where: string, ...texts: (string | undefined)[]) => texts.forEach((text) => text && out.push({ where, text }));
  for (const t of REFLECT_THEMES) add(t.id, t.title, t.line, t.opening, t.closing);
  for (const q of REFLECT_QUESTIONS) add(q.id, q.text);
  for (const f of FOLLOW_UPS) add(f.id, f.text);
  add('reflect.closing', ...Object.values(REFLECT_CLOSING));
  for (const k of LETTERS.kinds) add(k.starters.id, k.title, k.line, ...k.starters.texts);
  add('letters', ...LETTERS.generalStarters, LETTERS.writeTip, LETTERS.hardFeelingTip, LETTERS.offer, LETTERS.offerRead, LETTERS.offerLater, LETTERS.offerNotNow, LETTERS.writtenOn, LETTERS.hideForNow, LETTERS.dontShowWhenIntense);
  for (const z of Object.values(ZONE_SUPPORT)) {
    for (const l of [...z.acknowledge, ...z.understand]) add(l.id, l.text);
    for (const o of z.options) add(o.id, o.title, o.text, o.why, o.prompt);
  }
  for (const l of HARD_MODE.lines) add(l.id, l.text);
  for (const w of Object.values(WORD_SUPPORT)) {
    for (const l of w.acknowledge) add(l.id, l.text);
    for (const o of w.options) add(o.id, o.title, o.text, o.why, o.prompt);
  }
  add('hardMode', HARD_MODE.talkTitle, HARD_MODE.talkLine, HARD_MODE.dangerTitle, HARD_MODE.dangerLine, HARD_MODE.checkInLater, ...Object.values(HARD_MODE.helped));
  return out;
}
