export interface DurationPreset {
  days: number;
  label: string;
  blurb: string;
}

export const durationPresets: DurationPreset[] = [
  { days: 21, label: '21 days', blurb: 'A familiar, approachable starting point' },
  { days: 30, label: '30 days', blurb: 'A full month, calendar-friendly' },
  { days: 66, label: '66 days', blurb: 'The real research-backed average' },
];

// Purely inspirational — never a requirement to pick from this list.
export const starterHabitIdeas: string[] = [
  'Drink a glass of water on waking',
  'Stretch for 2 minutes',
  'Read one page',
  'Make your bed',
  'Write down one thing you’re grateful for',
  'Put your phone away 30 minutes before bed',
  'Take a short walk after a meal',
  'Do 10 push-ups',
];
