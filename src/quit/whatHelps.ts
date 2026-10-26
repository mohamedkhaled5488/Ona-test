// "What helps you" in Quit's Analysis: for each tool, how many times it was
// used, how often the craving passed, and the average change in how strong
// it felt (after minus before, when both were rated). Owner's rules
// (2026-10-24, memory "no-rankings-in-insights"):
// - Counts and average change in a fixed order (the menu's), never ranked.
// - "tends to" only at or above the sample threshold; below it, "Not enough
//   uses yet".
// - A comparison only when the difference is meaningful (both tools above
//   the threshold, and at least MEANINGFUL_POINTS apart).
// - Correlational words only: never causal ("because", "works", "makes")
//   or diagnostic.
// The same rules for when cravings came; trigger tags are counts in the
// tag list's own order.
//
// Uses: craving sessions (each tool counted once per craving; if a craving
// used more than one tool, its change counts for each, and the card says
// so), plus urges logged before craving sessions existed (their approach,
// passed, no ratings).
import type { QuitCravingSession, QuitFeelingEntry, QuitHabit, QuitSlip, QuitTrack } from '../types/sections';
import { reasonTagOptions } from '../data/feelingsWheel';
import { allTools, timeOfDayOf, TIMES_OF_DAY, type TimeOfDay, type ToolDef, BUILT_IN_TOOLS } from './toolkit';

export const WHAT_HELPS_MIN_RATED = 5; // rated uses before "tends to"
export const MEANINGFUL_POINTS = 2; // on the 0–10 scale
export const TIMING_MIN_TOTAL = 10; // cravings before "tend to come in the …"

export interface ToolHelp {
  label: string;
  uses: number;
  passed: number;
  rated: number; // uses with both ratings
  avgChange?: number; // after − before, 1 decimal; negative is easier
}

export interface WhatHelps {
  tools: ToolHelp[];
  comparison?: { easier: ToolHelp; harder: ToolHelp };
  timing: { id: TimeOfDay; label: string; count: number }[];
  timingTotal: number;
  timingPeak?: { id: TimeOfDay; label: string; count: number };
  triggers: { tag: string; count: number }[];
  sessions: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function whatHelps(habit: QuitHabit, sessions: QuitCravingSession[], feelingEntries: QuitFeelingEntry[], tracks: QuitTrack[], slips: QuitSlip[] = [], catalog: ToolDef[] = BUILT_IN_TOOLS): WhatHelps {
  const own = sessions.filter((s) => s.quitHabitId === habit.id);
  const ended = own.filter((s) => s.outcome);
  const tools = allTools(habit, catalog);
  const labelOf = (toolId: string) => tools.find((t) => t.id === toolId)?.label ?? toolId;
  const by = new Map<string, { uses: number; passed: number; changes: number[] }>();
  const add = (label: string) => {
    const g = by.get(label) ?? { uses: 0, passed: 0, changes: [] };
    by.set(label, g);
    return g;
  };

  for (const s of ended) {
    const change = s.ratingBefore !== undefined && s.ratingAfter !== undefined ? s.ratingAfter - s.ratingBefore : undefined;
    for (const label of new Set(s.tools.map((t) => labelOf(t.toolId)))) {
      const g = add(label);
      g.uses += 1;
      if (s.outcome === 'passed') g.passed += 1;
      if (change !== undefined) g.changes.push(change);
    }
  }
  // Urges logged before craving sessions (not linked from one).
  const linked = new Set(own.map((s) => s.resistedEntryId).filter(Boolean));
  const trackIds = new Set(tracks.filter((t) => t.quitHabitId === habit.id).map((t) => t.id));
  for (const e of feelingEntries) {
    if (!trackIds.has(e.trackId) || !e.isResistedUrge || !e.approach || linked.has(e.id)) continue;
    const g = add(e.approach);
    g.uses += 1;
    if (e.urgePassed) g.passed += 1;
  }

  // The menu's order; anything else (older approach names) after, A to Z.
  const order = (label: string) => {
    const i = tools.findIndex((t) => t.label === label);
    return i < 0 ? tools.length : i;
  };
  const list: ToolHelp[] = [...by.entries()]
    .map(([label, g]) => ({ label, uses: g.uses, passed: g.passed, rated: g.changes.length, avgChange: g.changes.length ? round1(g.changes.reduce((a, b) => a + b, 0) / g.changes.length) : undefined }))
    .sort((a, b) => order(a.label) - order(b.label) || a.label.localeCompare(b.label));

  const enough = list.filter((t) => t.rated >= WHAT_HELPS_MIN_RATED && t.avgChange !== undefined);
  let comparison: WhatHelps['comparison'];
  if (enough.length >= 2) {
    const easier = enough.reduce((a, b) => (b.avgChange! < a.avgChange! ? b : a));
    const harder = enough.reduce((a, b) => (b.avgChange! > a.avgChange! ? b : a));
    if (harder.avgChange! - easier.avgChange! >= MEANINGFUL_POINTS) comparison = { easier, harder };
  }

  const timing = TIMES_OF_DAY.map((t) => ({ ...t, count: own.filter((s) => timeOfDayOf(new Date(s.startedAt)) === t.id).length }));
  const timingTotal = timing.reduce((n, t) => n + t.count, 0);
  const sorted = [...timing].sort((a, b) => b.count - a.count);
  const timingPeak = timingTotal >= TIMING_MIN_TOTAL && sorted[0].count >= 2 * sorted[1].count && sorted[0].count - sorted[1].count >= 3 ? sorted[0] : undefined;

  const tagCounts = new Map<string, number>();
  for (const s of own) if (s.triggerTag) tagCounts.set(s.triggerTag, (tagCounts.get(s.triggerTag) ?? 0) + 1);
  for (const sl of slips) if (sl.quitHabitId === habit.id) for (const t of sl.reasonTags ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const tagOrder = (t: string) => {
    const i = (reasonTagOptions as readonly string[]).indexOf(t);
    return i < 0 ? reasonTagOptions.length : i;
  };
  const triggers = [...tagCounts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => tagOrder(a.tag) - tagOrder(b.tag) || a.tag.localeCompare(b.tag));

  return { tools: list, comparison, timing, timingTotal, timingPeak, triggers, sessions: own.length };
}

const times = (n: number) => `${n} ${n === 1 ? 'time' : 'times'}`;
const points = (n: number) => `${Math.abs(n)} ${Math.abs(n) === 1 ? 'point' : 'points'}`;
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

// One line per tool. "tends to" only with enough rated uses.
export function toolLine(t: ToolHelp): string {
  const counts = `Used ${times(t.uses)}, passed ${t.passed} of ${t.uses}.`;
  if (t.rated < WHAT_HELPS_MIN_RATED || t.avgChange === undefined) return `${counts} Not enough uses yet to say more.`;
  const change = Math.abs(t.avgChange) < 0.5 ? 'tends to stay about the same' : t.avgChange < 0 ? `tends to ease by ${points(t.avgChange)}` : `tends to rise by ${points(t.avgChange)}`;
  return `${counts} With it, the craving's strength ${change} (${t.rated} rated).`;
}

export const WHAT_HELPS_COPY = {
  title: 'What helps you',
  empty: 'After a few cravings with the toolkit, what went along with them easing shows here.',
  comparison: (c: NonNullable<WhatHelps['comparison']>) => `Of the tools you've rated enough, the craving tends to ease more with ${c.easier.label} (${signed(c.easier.avgChange!)}) than with ${c.harder.label} (${signed(c.harder.avgChange!)}).`,
  timingHeading: 'When cravings came',
  timingCounts: (t: WhatHelps['timing']) => t.map((x) => `${x.label} ${x.count}`).join(' · '),
  timingPeak: (p: NonNullable<WhatHelps['timingPeak']>, total: number) => `Cravings tend to come in the ${p.label.toLowerCase()} (${p.count} of ${total}).`,
  triggersHeading: 'What set them off',
  triggersCounts: (t: WhatHelps['triggers']) => t.map((x) => `${x.tag} ${x.count}`).join(' · '),
  triggersNote: 'From "Name the craving" and hard days. One craving or day can have more than one.',
  footnote:
    "From your cravings: how strong each felt before and after, when you rated both. If you used more than one tool in a craving, its change counts for each. This shows what went along with cravings easing for you; it can't say why.",
};
