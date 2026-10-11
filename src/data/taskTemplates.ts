import type { TaskTemplate } from '../types/sections';

// A few ready-made task templates. The user can hide any of them
// (hiddenStarterTemplates); they're never stored or synced themselves.
export const STARTER_TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: 'starter-deep-work',
    name: 'Focused work block',
    createdAt: '2026-01-01T00:00:00.000Z',
    fields: { title: 'Focused work', tagIds: [], priority: 'medium', energy: 'high', estimateMinutes: 60, durationMinutes: 60, subtaskTitles: [], reminders: [{ minutesBefore: 5 }] },
  },
  {
    id: 'starter-weekly-review',
    name: 'Weekly review',
    createdAt: '2026-01-01T00:00:00.000Z',
    fields: {
      title: 'Weekly review',
      tagIds: [],
      priority: 'low',
      energy: 'medium',
      estimateMinutes: 30,
      subtaskTitles: ['Look back at last week', 'Clear the inbox', 'Pick three things for next week'],
      reminders: [],
    },
  },
  {
    id: 'starter-errand',
    name: 'Quick errand',
    createdAt: '2026-01-01T00:00:00.000Z',
    fields: { title: 'Errand', tagIds: [], priority: 'none', energy: 'low', estimateMinutes: 15, context: 'Out and about', subtaskTitles: [], reminders: [] },
  },
];
