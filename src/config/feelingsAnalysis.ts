// How confident Feelings wording is allowed to sound, by how many entries
// back it up. One place for every threshold, so Analysis, the habit and skill
// "Feelings after" cards and the info note all agree.
//
//   1–2 entries  -> facts only ("You logged Calm once, tagged Work")
//   3–6 entries  -> "so far"   ("So far, Calm comes up most: 3 of 5")
//   7+ entries   -> "tends to" ("You tend to feel Calm most often: 12 of 20")
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
  `Early on, this page sticks to facts. From ${FEELINGS_CONFIDENCE.factsMax + 1} entries it says "so far", ` +
  `and from ${FEELINGS_CONFIDENCE.soFarMax + 1} it says "tends to". It shows what came up together, never what caused what.`;
