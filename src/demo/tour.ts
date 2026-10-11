// The optional Demo mode tour: a few short cards, offered once after entering
// the demo. Skipping it, or finishing it, counts the same: it's never offered
// again (kept in the demo's meta, which survives "Reset demo data").
import { create } from 'zustand';
import type { RootStackParamList } from '../navigation/types';
import type { DemoMeta } from '../utils/dataSpaceController';

export interface TourStep {
  title: string;
  text: string;
  // "Show me": opens this screen and ends the tour.
  goTo: { route: keyof RootStackParamList; label: string };
}

export const TOUR_STEPS: TourStep[] = [
  {
    title: 'Start here: Plan',
    text: 'Plan Builder holds the bigger goals; Daily Planning is today. Tap a task to see everything it can hold, or swipe it for quick actions.',
    goTo: { route: 'dailyPlanning', label: 'Open Daily Planning' },
  },
  {
    title: 'See your feelings over time',
    text: 'Eight weeks of check-ins. Open the Feelings Log or the graph, zoom in, and compare one month with another.',
    goTo: { route: 'moodCheck', label: 'Open Identify the Feeling' },
  },
  {
    title: 'Habits that pause, never reset',
    text: 'A missed day pauses a streak instead of wiping it. The Quit journey keeps a slip as part of the story, not a restart.',
    goTo: { route: 'habitsHub', label: 'Open Habits' },
  },
  {
    title: 'Patterns, not verdicts',
    text: 'Insights look for patterns in your tasks and feelings, and always say how many days they are based on.',
    goTo: { route: 'planningInsights', label: 'Open Insights' },
  },
  {
    title: 'Your week in Recap',
    text: 'Home pulls it all together: time invested, what went well, and a gentle weekly review. Exit the demo any time from the bar at the top.',
    goTo: { route: 'Main', label: 'Go to Home' },
  },
];

// Offered once: only if it hasn't been finished or skipped.
export const shouldOfferTour = (meta: Pick<DemoMeta, 'tourDone'> | null): boolean => !!meta && !meta.tourDone;

interface TourState {
  open: boolean;
  step: number; // -1 = the offer ("Take a short tour?"), 0.. = the cards
  show: () => void;
  goto: (step: number) => void;
  close: () => void;
}

export const useTourStore = create<TourState>((set) => ({
  open: false,
  step: -1,
  show: () => set({ open: true, step: -1 }),
  goto: (step) => set({ step: Math.max(-1, Math.min(step, TOUR_STEPS.length - 1)) }),
  close: () => set({ open: false, step: -1 }),
}));
