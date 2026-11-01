// "Support for this feeling": what to show for the latest feeling, chosen by
// rules from hand-written content (src/content) and the person's own data on
// this phone. No generative AI, nothing claimed to "understand" anyone.
// Pure, so every rule is tested (support.test.ts):
// - Acknowledge (the word's own line, else the zone's for that strength), a
//   short note on what the feeling often is, and 2–4 options of different
//   kinds (Body, Mind, Do, Connect, Write).
// - Personal, quietly: what the person said helped comes first, what they hid
//   or said didn't help stays out or goes last, never the same wording twice
//   in a row; "Last time you tried this…" only from their own history.
// - Hard-feeling mode (Low or Tense felt strongly, the heaviest words, or
//   heavy feelings on 3 of the last 7 days): fewer words, breathing and
//   grounding first, "Talk to someone" in view.
// - Danger in the person's own words or tags: the support card and a caring
//   line, and nothing else.
// - Heavy pieces stay hidden until a clinician has reviewed them; breathing,
//   grounding and the support lines are always there.
import { HARD_MODE, WORD_SUPPORT, ZONE_SUPPORT, BREATHING_TOOL } from '../content';
import type { SupportKind, SupportLine, SupportOption } from '../content/types';
import type { FeelingCheckIn, FeelingZone } from '../types/sections';
import { showSupportCard } from '../reflect/revisit';
import { addDaysISO } from '../utils/date';

export type Helped = 'yes' | 'aLittle' | 'notReally';
export interface Votes {
  yes: number;
  aLittle: number;
  notReally: number;
}

export interface SupportShown {
  at: string;
  feelingId?: string;
  zone: FeelingZone;
  intensity?: number;
  ackId?: string;
  optionIds: string[];
  used: string[]; // options the person tried
  helped?: Helped;
}

export interface SupportMemory {
  votes: Record<string, Votes>;
  hidden: string[];
  history: SupportShown[]; // newest last
}

export interface SupportFeeling {
  zone: FeelingZone;
  feelingIds: string[];
  intensity?: number; // the strongest, 1–5
  tags?: string[];
  note?: string;
}

export type SupportMode = 'gentle' | 'hard' | 'danger';

export interface SupportPlan {
  mode: SupportMode;
  acknowledge?: SupportLine;
  understand?: SupportLine;
  lines: SupportLine[]; // hard-feeling mode's few words
  options: SupportOption[];
  // "Last time you tried this, the next feeling you logged was lighter."
  insights: Record<string, string>;
}

export const SAFE_TOOLS = new Set([BREATHING_TOOL, 'grounding', 'noticeFive']);
export const HEAVIEST_WORDS = new Set(['low-numb', 'mad-hateful', 'mad-rage', 'sad-ashamed', 'sad-depressed', 'sad-miserable', 'scared-helpless', 'scared-insignificant']);

// The person's own words that point to danger to themselves. Not a judgement
// of anyone's state: a clear phrase means the support card comes first.
const DANGER = /\b(kill(ing)? myself|suicid\w*|end(ing)? (it all|my life|my own life|things)|tak(e|ing) my (own )?life|self[- ]?harm\w*|hurt(ing)? myself|cut(ting)? myself|don'?t want to (be here|live|wake up)|want to die|better off (dead|without me)|no reason to live|overdose)\b/i;

export const strongest = (f: Pick<FeelingCheckIn, 'intensities'>) => Math.max(0, ...Object.values(f.intensities ?? {}).map((v) => v ?? 0)) || undefined;
export const fromCheckIn = (f: FeelingCheckIn): SupportFeeling => ({ zone: f.zone, feelingIds: f.feelingIds, intensity: strongest(f), tags: f.reasonTags, note: f.note });

const visible = (p: { reviewed: boolean; sensitivity: string }) => p.sensitivity === 'standard' || p.reviewed;
const fits = (p: { intensity: [number, number] }, i: number) => p.intensity[0] <= i && i <= p.intensity[1];

export function inDanger(f: SupportFeeling): boolean {
  return DANGER.test([f.note ?? '', ...(f.tags ?? [])].join(' \n '));
}

export function isHard(f: SupportFeeling, feelings: FeelingCheckIn[], today: string): boolean {
  if ((f.zone === 'low' || f.zone === 'tense') && (f.intensity ?? 0) >= 4) return true;
  if (f.feelingIds.some((id) => HEAVIEST_WORDS.has(id))) return true;
  // Heavy feelings on 3 of the last 7 days (the same rule as Reflection's card).
  return (f.zone === 'low' || f.zone === 'tense') && showSupportCard(feelings, today, undefined);
}

const ZONE_WEIGHT: Record<FeelingZone, number> = { low: 2, tense: 2, okay: 1, calm: 0, lively: 0 };
// The next feeling logged within 6 hours was lighter (a lighter zone, or the
// same zone felt less strongly).
function lighterAfter(shown: SupportShown, feelings: FeelingCheckIn[]): boolean {
  const until = new Date(new Date(shown.at).getTime() + 6 * 3600_000).toISOString();
  const next = feelings.filter((f) => f.createdAt > shown.at && f.createdAt <= until && f.id !== shown.feelingId).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (!next) return false;
  if (ZONE_WEIGHT[next.zone] < ZONE_WEIGHT[shown.zone]) return true;
  return next.zone === shown.zone && shown.intensity !== undefined && (strongest(next) ?? 99) < shown.intensity;
}

export const INSIGHT = { lighter: 'Last time you tried this, the next feeling you logged was lighter.', helped: 'You said this helped before.' };

export interface SupportContext {
  memory: SupportMemory;
  feelings: FeelingCheckIn[];
  now: Date;
  max?: number; // options to show (2–4)
}

export function planSupport(f: SupportFeeling, ctx: SupportContext): SupportPlan {
  const { memory, feelings, now } = ctx;
  const today = now.toISOString().slice(0, 10);
  const intensity = f.intensity ?? 3;
  const zone = ZONE_SUPPORT[f.zone];
  const word = f.feelingIds.map((id) => WORD_SUPPORT[id]).find((w) => w?.written);
  const last = memory.history[memory.history.length - 1];
  const supportOption = [...zone.options, ...Object.values(ZONE_SUPPORT).flatMap((z) => z.options)].find((o) => o.support && visible(o));

  if (inDanger(f)) return { mode: 'danger', lines: [], options: supportOption ? [supportOption] : [], insights: {} };

  const hard = isHard(f, feelings, today);
  const hidden = new Set(memory.hidden);

  // Acknowledge: the word's own line, unless it was the last one shown; else
  // the zone's for this strength, a different one from last time.
  const zoneAcks = zone.acknowledge.filter((a) => visible(a) && fits(a, intensity));
  const wordAck = word?.acknowledge.find(visible);
  const pickAck = () => {
    if (wordAck && wordAck.id !== last?.ackId) return wordAck;
    const fresh = zoneAcks.filter((a) => a.id !== last?.ackId);
    const list = fresh.length ? fresh : zoneAcks;
    return list.length ? list[memory.history.length % list.length] : wordAck;
  };
  const acknowledge = pickAck();
  const understand = hard ? undefined : zone.understand.find((u) => visible(u) && fits(u, intensity));
  const lines = hard ? HARD_MODE.lines.filter(visible) : [];

  // Every option that could be shown: the word's own first, then the zone's.
  const seen = new Set<string>();
  const pool = [...(word?.options ?? []), ...zone.options].filter((o) => {
    if (seen.has(o.id) || hidden.has(o.id) || !visible(o) || !fits(o, intensity)) return false;
    seen.add(o.id);
    return true;
  });

  const insights: Record<string, string> = {};
  for (const o of pool) {
    const v = memory.votes[o.id];
    const tried = memory.history.filter((h) => h.used.includes(o.id));
    if (tried.some((h) => lighterAfter(h, feelings))) insights[o.id] = INSIGHT.lighter;
    else if (v && v.yes > 0) insights[o.id] = INSIGHT.helped;
  }
  const hour = now.getHours();
  const night = hour >= 22 || hour < 6;
  const score = (o: SupportOption) => {
    const v = memory.votes[o.id] ?? { yes: 0, aLittle: 0, notReally: 0 };
    let s = 0;
    if (word?.options.includes(o)) s += 3;
    s += v.yes * 2 + v.aLittle - v.notReally * 3;
    if (insights[o.id] === INSIGHT.lighter) s += 2;
    if (last?.optionIds.includes(o.id)) s -= 4; // not the same twice in a row
    if (night && (o.tool === 'walk' || /outside|walk/i.test(o.title))) s -= 3;
    return s;
  };

  let options: SupportOption[];
  if (hard) {
    // Breathing and grounding first, then "Talk to someone".
    const body = pool.filter((o) => o.kind === 'body' && o.tool && SAFE_TOOLS.has(o.tool)).sort((a, b) => score(b) - score(a));
    const safeBody = body.length ? body : [...Object.values(ZONE_SUPPORT).flatMap((z) => z.options)].filter((o) => o.kind === 'body' && o.tool && SAFE_TOOLS.has(o.tool) && visible(o) && !hidden.has(o.id));
    options = [...new Map(safeBody.map((o) => [o.tool, o])).values()].slice(0, 2);
    if (supportOption) options.push(supportOption);
  } else {
    const max = Math.max(2, Math.min(4, ctx.max ?? 3));
    const ranked = pool.filter((o) => !o.support).map((o, i) => ({ o, s: score(o) - i * 0.01 })).sort((a, b) => b.s - a.s);
    options = [];
    const kinds = new Set<SupportKind>();
    for (const { o } of ranked) if (options.length < max && !kinds.has(o.kind)) (options.push(o), kinds.add(o.kind));
    for (const { o } of ranked) if (options.length < 2 && !options.includes(o)) options.push(o);
    // A stronger unpleasant feeling: "Talk to someone" is always one of them.
    const sup = pool.find((o) => o.support);
    if (sup && !options.includes(sup)) options.push(sup);
  }
  return { mode: hard ? 'hard' : 'gentle', acknowledge, understand, lines, options, insights };
}

// The gentle check-in an hour later, if asked: no feeling, no words of the person's.
export const CHECK_IN = { title: 'A gentle check-in', body: "How are you doing? Open Ona if you'd like to note it." };

// Trim the history to the last few months (it's only for choosing).
export const keepHistory = (h: SupportShown[], today: string) => h.filter((x) => x.at.slice(0, 10) >= addDaysISO(today, -120)).slice(-200);
