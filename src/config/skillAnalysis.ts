// Every tunable threshold behind Skills' progression insights, in one place.
// Insights only appear once the data clears these — below them, the honest
// answer is "keep logging", not a guess.

export const SKILL_ANALYSIS = {
  // Plateau: the primary metric hasn't moved beyond normal session-to-session
  // variation for this long, with at least this many entries in that window.
  plateauWindowDays: 28,
  plateauMinEntries: 5,
  // How many entries at each end of the window are compared (by median, so a
  // single outlier session can't fake or hide a plateau).
  plateauEdgeEntries: 3,

  // Sweet spot: needs this many difficulty-rated sessions and metric entries.
  sweetSpotMinRatedSessions: 10,
  sweetSpotMinMetricEntries: 6,
  // How much more often "Just right"/"Challenging" must show up in the
  // stronger stretches before it's worth saying anything.
  sweetSpotMinShareGap: 0.15,

  // Effort and progress: needs this many weeks with both practice time and a
  // metric change, and at least this strong a (positive) correlation.
  effortMinWeeks: 6,
  effortMinCorrelation: 0.3,

  // Neglected sub-skill: not practiced in this many days.
  neglectedSubSkillDays: 21,

  // Most frequent struggle: looks at this many recent "struggled with" entries.
  struggleLookback: 8,
  struggleMinCount: 3,

  // Feeling after practice / time of day: the same minimum as every other
  // Analysis page in the app (feelingsStats' ANALYSIS_MIN_TAG_COUNT).
  minSamples: 3,
} as const;

// Analysis is ungated for now (free vs. paid is undecided). Every entry point
// to it checks this one function, so a gate can be added in a single place.
export function isSkillAnalysisAvailable(): boolean {
  return true;
}
