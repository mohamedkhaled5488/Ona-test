import type { Plan, PlanStep } from '../types/sections';

function renderStep(step: PlanStep, depth: number): string {
  const indent = '  '.repeat(depth);
  const check = step.done ? '[x]' : '[ ]';
  const bits: string[] = [`${indent}${check} ${step.title}`];
  if (step.priority) bits.push(`${indent}    Priority: ${step.priority}`);
  if (step.dueDate) bits.push(`${indent}    Due: ${step.dueDate}`);
  if (step.timeEstimate) bits.push(`${indent}    Estimate: ${step.timeEstimate}`);
  if (step.resources) bits.push(`${indent}    Resources: ${step.resources}`);
  if (step.risks) bits.push(`${indent}    Risks: ${step.risks}`);
  if (step.notes) bits.push(`${indent}    Notes: ${step.notes}`);
  step.alternatives.forEach((alt) => bits.push(`${indent}    Alternative: ${alt.label}`));
  step.subSteps.forEach((sub) => bits.push(renderStep(sub, depth + 1)));
  return bits.join('\n');
}

export function planToText(plan: Plan): string {
  const lines: string[] = [plan.title, `Motive: ${plan.motive}`, ''];
  plan.steps.forEach((step) => lines.push(renderStep(step, 0), ''));
  if (plan.reflection) {
    lines.push('Reflection', `What worked: ${plan.reflection.worked}`, `What I'd do differently: ${plan.reflection.differently}`);
  }
  return lines.join('\n').trim();
}
