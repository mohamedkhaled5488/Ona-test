import type { PlanPriority } from '../types/sections';

// Distinct from the reserved mood palette and from the section accents — a
// small fixed scale used only for step priority indicators.
export const priorityColors: Record<PlanPriority, string> = {
  high: '#B65C4E',
  medium: '#C99A3D',
  low: '#6F8FAE',
};

export const priorityLabels: Record<PlanPriority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const priorityOrder: PlanPriority[] = ['high', 'medium', 'low'];
