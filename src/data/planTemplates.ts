import type { PlanStep } from '../types/sections';

export interface PlanTemplate {
  id: string;
  name: string;
  description: string;
  motive: string;
  steps: Omit<PlanStep, 'id' | 'attachments' | 'alternatives' | 'subSteps'>[];
}

// Pre-filled starting points for a new plan — fully editable after creation.
// "Start from scratch" (an empty plan) is always offered alongside these.
export const builtInPlanTemplates: PlanTemplate[] = [
  {
    id: 'template-career-change',
    name: 'Career Change',
    description: 'Move into a new role or field with a clear runway.',
    motive: 'Move into a role I actually want',
    steps: [
      { title: 'Get clear on the target role and what it requires', priority: 'high' },
      { title: 'Fill the biggest skill or experience gaps', priority: 'high' },
      { title: 'Update resume, portfolio, and LinkedIn', priority: 'medium' },
      { title: 'Reach out to people already in that role', priority: 'medium' },
      { title: 'Apply and interview', priority: 'medium' },
    ],
  },
  {
    id: 'template-learn-skill',
    name: 'Learn a New Skill',
    description: 'Structure for going from zero to competent.',
    motive: 'Learn a new skill I keep putting off',
    steps: [
      { title: 'Pick a specific, concrete first goal', priority: 'high' },
      { title: 'Find the right course, book, or mentor', priority: 'medium' },
      { title: 'Practice on a regular schedule', priority: 'high' },
      { title: 'Build one small real project with it', priority: 'medium' },
    ],
  },
  {
    id: 'template-launch-project',
    name: 'Launch a Project',
    description: 'Take an idea from concept to something real.',
    motive: 'Launch this idea instead of just thinking about it',
    steps: [
      { title: 'Define the smallest version worth building', priority: 'high' },
      { title: 'Build the first version', priority: 'high' },
      { title: 'Get it in front of a few real people', priority: 'medium' },
      { title: 'Iterate based on what they say', priority: 'medium' },
      { title: 'Decide whether to keep going or wrap up', priority: 'low' },
    ],
  },
  {
    id: 'template-fitness-goal',
    name: 'Fitness Goal',
    description: 'A realistic structure for a physical goal.',
    motive: 'Reach a fitness goal that actually sticks',
    steps: [
      { title: 'Set one specific, measurable target', priority: 'high' },
      { title: 'Pick a routine that fits my actual schedule', priority: 'high' },
      { title: 'Track progress weekly', priority: 'medium' },
      { title: 'Adjust when motivation dips instead of quitting', priority: 'medium' },
    ],
  },
  {
    id: 'template-life-event',
    name: 'Life Event',
    description: 'Plan a move, a wedding, a trip, or another big event.',
    motive: 'Get this life event planned without the last-minute scramble',
    steps: [
      { title: 'List everything that has to be true by the date', priority: 'high' },
      { title: 'Set a budget', priority: 'medium' },
      { title: 'Book the things that need the most lead time first', priority: 'high' },
      { title: 'Handle the smaller logistics', priority: 'low' },
      { title: 'Final walkthrough a week before', priority: 'medium' },
    ],
  },
];
