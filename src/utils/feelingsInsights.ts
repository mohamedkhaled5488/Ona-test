// Feelings wording: what was logged, as counts in the zone order, never a
// ranking ("most often", "tends to"). With one or two entries it names them;
// from a few it adds "so far" (thresholds in config/feelingsAnalysis.ts).
// Every result carries its sample size for "Based on N entries". Never causal.
import type { FeelingCheckIn, FeelingSource, FeelingZone } from '../types/sections';
import { zoneMeta } from '../data/feelingsWheel';
import { confidenceFor, type FeelingsConfidence } from '../config/feelingsAnalysis';

// The app's zone order (the same as the zone buttons).
export const ZONE_ORDER: FeelingZone[] = ['lively', 'calm', 'tense', 'low', 'okay'];

const label = (z: FeelingZone) => zoneMeta(z).label;
const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

export interface ZoneTally {
  zone: FeelingZone;
  count: number;
}

// Zones that came up, in the zone order (not sorted by count).
export function zoneTally(entries: FeelingCheckIn[]): ZoneTally[] {
  const counts = new Map<FeelingZone, number>();
  entries.forEach((e) => counts.set(e.zone, (counts.get(e.zone) ?? 0) + 1));
  return ZONE_ORDER.filter((z) => counts.has(z)).map((zone) => ({ zone, count: counts.get(zone)! }));
}

export interface Insight {
  n: number;
  level: FeelingsConfidence;
  headline: string;
  detail?: string;
}

export const basedOn = (n: number) => `Based on ${n} ${n === 1 ? 'entry' : 'entries'}`;

const tallyText = (tally: ZoneTally[]) => tally.map((t) => `${label(t.zone)} ${t.count}`).join(' · ');
const entriesWord = (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'}`;

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
  return { n, level, headline: `${level === 'soFar' ? 'So far, across' : 'Across'} ${entriesWord(n)}: ${tallyText(tally)}.` };
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
  return { n, level, headline: `${tag} (${level === 'soFar' ? `${entriesWord(n)} so far` : entriesWord(n)}): ${tallyText(tally)}.` };
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
  return { n, level, headline: `${capitalize(after)} (${level === 'soFar' ? `${entriesWord(n)} so far` : entriesWord(n)}): ${tallyText(tally)}.` };
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
