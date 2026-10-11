import type { SectionId } from '../types/sections';

// A distinct accent per section — separate from the reserved mood palette
// (that stays exclusive to Journaling) and from amber (reserved for
// motivation/highlight moments). These give each section's icon badge and
// small details their own identity against the dark stone/surface chrome.
export const sectionAccents: Record<SectionId, string> = {
  planBuilder: '#D98F4E', // amber — this section is literally about motivation
  dailyPlanning: '#4F9B82', // brand teal
  journaling: '#9B87B0', // echoes its own reflective mood tone
  catchAThought: '#C97B5A', // warm coral
  studySession: '#5B8FC7', // focused blue
  dietPlanning: '#7FAE68', // fresh green
  songwriting: '#B072A0', // magenta-violet
  book: '#8C6239', // warm saddle-brown — personal commonplace-book feel
  mindGames: '#3FA0A0', // teal-cyan
  moodCheck: '#D98F4E', // amber — highlight/motivation moment
  sleep: '#6B7FD1', // dusky indigo — night
  recap: '#5FA88A', // muted teal-green — distinct from brand teal, window/overview feel
  skills: '#8A8F4D', // olive — growth/practice, distinct from dietPlanning's fresher green
  habitBuilder: '#6E7F91', // slate blue-gray — steady, unshowy consistency; distinct from the blue/indigo/teal family already in use
  budget: '#4E9A7A', // money-green, distinct from dietPlanning's fresher green and skills' olive
  quitHabit: '#7A9E8E', // soft sage — calm, self-compassionate, deliberately not clinical or alarm-toned
};
