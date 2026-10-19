// How Feelings wording grows with the data. It never ranks or says "tends
// to": it shows what was logged, as counts, and says how many entries that is.
//
//   1–2 entries  -> the entries themselves ("You logged Calm once, tagged Work")
//   3–6 entries  -> counts, marked "so far" ("So far, across 5 entries: Calm 3 · Low 2")
//   7+ entries   -> counts                  ("Across 20 entries: Calm 12 · Tense 5 · Okay 3")
//
// Never causal wording, at any size.

export const FEELINGS_CONFIDENCE = {
  factsMax: 2,
  soFarMax: 6,
} as const;

export type FeelingsConfidence = 'facts' | 'soFar' | 'tends';

export function confidenceFor(n: number): FeelingsConfidence {
  if (n <= FEELINGS_CONFIDENCE.factsMax) return 'facts';
  if (n <= FEELINGS_CONFIDENCE.soFarMax) return 'soFar';
  return 'tends';
}

// Shown once, in a small info note on Analysis.
export const CONFIDENCE_NOTE =
  `These are counts of what you logged, listed in the same order each time, not a ranking. With 1 or 2 entries the page lists them; ` +
  `up to ${FEELINGS_CONFIDENCE.soFarMax} it says "so far". It shows what came up together, never what caused what.`;
