// Feelings wording that grows with the data: facts with one or two entries,
// "so far" with a few, "tends to" with more (thresholds in
// config/feelingsAnalysis.ts). Every result carries its sample size so the
// card can say "Based on N entries". Never causal.
import type { FeelingCheckIn, FeelingSource, FeelingZone } from '../types/sections';
import { zoneMeta } from '../data/feelingsWheel';
import { confidenceFor, type FeelingsConfidence } from '../config/feelingsAnalysis';

export const ZONE_ORDER: FeelingZone[] = ['lively', 'calm', 'okay', 'tense', 'low'];

const label = (z: FeelingZone) => zoneMeta(z).label;
const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

export interface ZoneTally {
  zone: FeelingZone;
  count: number;
}

// Zones that came up, most first (ties in the usual zone order).
export function zoneTally(entries: FeelingCheckIn[]): ZoneTally[] {
  const counts = new Map<FeelingZone, number>();
  entries.forEach((e) => counts.set(e.zone, (counts.get(e.zone) ?? 0) + 1));
  return ZONE_ORDER.filter((z) => counts.has(z))
    .map((zone) => ({ zone, count: counts.get(zone)! }))
    .sort((a, b) => b.count - a.count);
}

// The zone that clearly comes up most, or undefined when it's a tie.
function leader(tally: ZoneTally[]): ZoneTally | undefined {
  if (tally.length === 0) return undefined;
  if (tally[1] && tally[1].count === tally[0].count) return undefined;
  return tally[0];
}

export interface Insight {
  n: number;
  level: FeelingsConfidence;
  headline: string;
  detail?: string;
}

export const basedOn = (n: number) => `Based on ${n} ${n === 1 ? 'entry' : 'entries'}`;

const tallyText = (tally: ZoneTally[]) => tally.map((t) => `${label(t.zone)} ${t.count}`).join(' · ');

// The overall picture for a set of entries.
export function overviewInsight(entries: FeelingCheckIn[], nameOf: (id: string) => string | undefined): Insight | undefined {
  const n = entries.length;
  if (n === 0) return undefined;
  const level = confidenceFor(n);
  const tally = zoneTally(entries);
  if (level === 'facts') {
    if (n === 1) {
      const e = entries[0];
      const words = e.feelingIds.map(nameOf).filter((w): w is string => !!w).map((w) => w.toLowerCase());
      const tags = e.reasonTags ?? [];
      return {
        n,
        level,
        headline: `You logged ${label(e.zone)} once${words.length ? ` (${list(words)})` : ''}${tags.length ? `, tagged ${list(tags)}` : ''}.`,
      };
    }
    return { n, level, headline: `You've logged ${n} feelings: ${list(tally.map((t) => `${label(t.zone)} ${times(t.count)}`))}.` };
  }
  const top = leader(tally);
  const detail = tallyText(tally);
  if (level === 'soFar') {
    return top
      ? { n, level, headline: `So far, ${label(top.zone)} comes up most: ${top.count} of ${n} entries.`, detail }
      : { n, level, headline: `So far it's a mix: no one feeling comes up more than the others.`, detail };
  }
  return top
    ? { n, level, headline: `You tend to feel ${label(top.zone)} most often: ${top.count} of ${n} entries.`, detail }
    : { n, level, headline: `Your feelings tend to be spread out, with no one zone ahead.`, detail };
}

// What came up alongside one tag. The level goes by how often the tag was used.
export function tagInsight(entries: FeelingCheckIn[], tag: string): Insight | undefined {
  const matches = entries.filter((e) => (e.reasonTags ?? []).includes(tag));
  const n = matches.length;
  if (n === 0) return undefined;
  const level = confidenceFor(n);
  const tally = zoneTally(matches);
  if (level === 'facts') {
    return { n, level, headline: `${tag}: tagged ${times(n)}, with ${list(tally.map((t) => label(t.zone)))}.` };
  }
  const top = leader(tally);
  const detail = tallyText(tally);
  if (level === 'soFar') {
    return top
      ? { n, level, headline: `So far, ${tag} has mostly come with feeling ${label(top.zone)}: ${top.count} of ${n}.`, detail }
      : { n, level, headline: `So far, ${tag} has come with mixed feelings.`, detail };
  }
  return top
    ? { n, level, headline: `${tag} tends to go with feeling ${label(top.zone)}: ${top.count} of ${n}.`, detail }
    : { n, level, headline: `${tag} tends to come with mixed feelings.`, detail };
}

// "Feelings after" a habit, a practice session or a Quit moment.
export function itemFeelingInsight(matches: FeelingCheckIn[], after: string): Insight | undefined {
  const n = matches.length;
  if (n === 0) return undefined;
  const level = confidenceFor(n);
  const tally = zoneTally(matches);
  if (level === 'facts') {
    return { n, level, headline: `${capitalize(after)}, you logged ${list(tally.map((t) => `${label(t.zone)} ${times(t.count)}`))}.` };
  }
  const top = leader(tally);
  const detail = tallyText(tally);
  if (level === 'soFar') {
    return top
      ? { n, level, headline: `So far, you've mostly felt ${label(top.zone)} ${after}: ${top.count} of ${n}.`, detail }
      : { n, level, headline: `So far, your feelings ${after} are mixed.`, detail };
  }
  return top
    ? { n, level, headline: `You tend to feel ${label(top.zone)} ${after}: ${top.count} of ${n}.`, detail }
    : { n, level, headline: `Your feelings ${after} tend to be mixed.`, detail };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// --- Where a feeling was logged from ----------------------------------------

export type SourceGroup = 'all' | 'standalone' | 'habits' | 'practice' | 'tasks' | 'quit' | 'other';

export const SOURCE_GROUP_LABEL: Record<SourceGroup, string> = {
  all: 'All',
  standalone: 'Standalone',
  habits: 'After habits',
  practice: 'After practice',
  tasks: 'After tasks',
  quit: 'Quit moments',
  other: 'Other',
};

export function sourceGroupOf(source: FeelingSource | undefined): Exclude<SourceGroup, 'all'> {
  if (!source) return 'standalone';
  switch (source.kind) {
    case 'habit':
      return 'habits';
    case 'skill':
      return 'practice';
    case 'task':
      return 'tasks';
    case 'quitHabit':
      return 'quit';
    default:
      return 'other'; // reading, study sessions
  }
}

export function filterBySource(entries: FeelingCheckIn[], group: SourceGroup): FeelingCheckIn[] {
  return group === 'all' ? entries : entries.filter((e) => sourceGroupOf(e.source) === group);
}

// The groups that have entries, with counts, in a fixed order ("All" first).
export function sourceBreakdown(entries: FeelingCheckIn[]): { group: SourceGroup; count: number }[] {
  const counts = new Map<SourceGroup, number>();
  entries.forEach((e) => {
    const g = sourceGroupOf(e.source);
    counts.set(g, (counts.get(g) ?? 0) + 1);
  });
  const order: SourceGroup[] = ['standalone', 'habits', 'practice', 'tasks', 'quit', 'other'];
  return [{ group: 'all' as SourceGroup, count: entries.length }, ...order.filter((g) => counts.has(g)).map((group) => ({ group, count: counts.get(group)! }))];
}
