import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Plan, PlanStep, PlanReflection } from '../types/sections';
import { mockPlans } from '../data/mockData';
import type { PlanTemplate } from '../data/planTemplates';
import { genId } from '../utils/id';
import { todayISO } from '../utils/date';

// A "path" is the chain of step ids from a top-level step down to the target step.
function findParentArray(steps: PlanStep[], path: string[]): PlanStep[] | undefined {
  if (path.length === 0) return undefined;
  if (path.length === 1) return steps;
  let current = steps;
  for (let i = 0; i < path.length - 1; i++) {
    const node = current.find((s) => s.id === path[i]);
    if (!node) return undefined;
    current = node.subSteps;
  }
  return current;
}

function findStep(steps: PlanStep[], path: string[]): PlanStep | undefined {
  const parentArray = findParentArray(steps, path);
  if (!parentArray) return undefined;
  return parentArray.find((s) => s.id === path[path.length - 1]);
}

function setDoneRecursive(step: PlanStep, done: boolean): void {
  step.done = done;
  step.subSteps.forEach((s) => setDoneRecursive(s, done));
}

// After a step's `done` (or its children) changed, keep every ancestor's
// `done` in sync: a step with sub-steps is complete exactly when all of them
// are, and reverts to incomplete the moment any of them isn't.
function recomputeAncestors(steps: PlanStep[], path: string[]): void {
  if (path.length < 2) return;
  const parentPath = path.slice(0, -1);
  const parent = findStep(steps, parentPath);
  if (!parent) return;
  if (parent.subSteps.length > 0) {
    parent.done = parent.subSteps.every((s) => s.done);
  }
  recomputeAncestors(steps, parentPath);
}

function buildStepsFromTemplate(templateSteps: PlanTemplate['steps']): PlanStep[] {
  return templateSteps.map((s) => ({
    ...s,
    id: genId('step'),
    attachments: [],
    alternatives: [],
    subSteps: [],
  }));
}

interface PlanState {
  plans: Plan[];
  personalTemplates: PlanTemplate[];

  createPlan: (title: string, motive: string, color: string, templateSteps?: PlanTemplate['steps']) => string;
  archivePlan: (planId: string, reflection: PlanReflection) => void;
  reopenPlan: (planId: string) => void;
  deletePlan: (planId: string) => void;
  setPlanTags: (planId: string, tags: string[]) => void;
  setReviewInterval: (planId: string, days: number | undefined) => void;
  saveAsTemplate: (planId: string, name: string, description: string) => void;

  setPlanTitle: (planId: string, title: string) => void;
  setMotive: (planId: string, motive: string) => void;
  addStep: (planId: string, parentPath: string[], title: string) => void;
  moveStep: (planId: string, path: string[], direction: -1 | 1) => void;
  updateStep: (
    planId: string,
    path: string[],
    updates: Partial<
      Pick<PlanStep, 'title' | 'notes' | 'color' | 'priority' | 'dueDate' | 'resources' | 'risks' | 'timeEstimate'>
    >
  ) => void;
  toggleStepDone: (planId: string, path: string[]) => void;
  deleteStep: (planId: string, path: string[]) => void;
  addAlternative: (planId: string, path: string[], label: string) => void;
  removeAlternative: (planId: string, path: string[], alternativeId: string) => void;
  addAttachment: (planId: string, path: string[], label: string) => void;
  removeAttachment: (planId: string, path: string[], attachmentId: string) => void;
}

export const usePlanStore = create<PlanState>()(
  immer((set) => ({
    plans: mockPlans,
    personalTemplates: [],

    createPlan: (title, motive, color, templateSteps) => {
      const id = genId('plan');
      set((state) => {
        state.plans.push({
          id,
          title: title.trim() || 'Untitled plan',
          motive: motive.trim(),
          status: 'active',
          color,
          tags: [],
          createdAt: todayISO(),
          steps: templateSteps ? buildStepsFromTemplate(templateSteps) : [],
        });
      });
      return id;
    },

    archivePlan: (planId, reflection) =>
      set((state) => {
        const plan = state.plans.find((p) => p.id === planId);
        if (!plan) return;
        plan.status = 'archived';
        plan.reflection = reflection;
      }),

    reopenPlan: (planId) =>
      set((state) => {
        const plan = state.plans.find((p) => p.id === planId);
        if (plan) plan.status = 'active';
      }),

    deletePlan: (planId) =>
      set((state) => {
        state.plans = state.plans.filter((p) => p.id !== planId);
      }),

    setPlanTags: (planId, tags) =>
      set((state) => {
        const plan = state.plans.find((p) => p.id === planId);
        if (plan) plan.tags = tags;
      }),

    setReviewInterval: (planId, days) =>
      set((state) => {
        const plan = state.plans.find((p) => p.id === planId);
        if (plan) plan.reviewIntervalDays = days;
      }),

    saveAsTemplate: (planId, name, description) =>
      set((state) => {
        const plan = state.plans.find((p) => p.id === planId);
        if (!plan) return;
        const stripSteps = (steps: PlanStep[]): PlanTemplate['steps'] =>
          steps.map((s) => ({
            title: s.title,
            notes: s.notes,
            priority: s.priority,
            timeEstimate: s.timeEstimate,
            resources: s.resources,
            risks: s.risks,
          }));
        state.personalTemplates.push({
          id: genId('template'),
          name,
          description,
          motive: plan.motive,
          steps: stripSteps(plan.steps),
        });
      }),

    setPlanTitle: (planId, title) =>
      set((state) => {
        const plan = state.plans.find((p) => p.id === planId);
        if (plan) plan.title = title;
      }),

    setMotive: (planId, motive) =>
      set((state) => {
        const plan = state.plans.find((p) => p.id === planId);
        if (plan) plan.motive = motive;
      }),

    addStep: (planId, parentPath, title) =>
      set((state) => {
        const trimmed = title.trim();
        if (!trimmed) return;
        const plan = state.plans.find((p) => p.id === planId);
        if (!plan) return;
        const targetArray = parentPath.length === 0 ? plan.steps : findStep(plan.steps, parentPath)?.subSteps;
        if (!targetArray) return;
        const newStep: PlanStep = {
          id: genId('step'),
          title: trimmed,
          done: false,
          attachments: [],
          alternatives: [],
          subSteps: [],
        };
        targetArray.push(newStep);
        // A freshly-added, incomplete sub-step means its parent can no longer
        // be "done" purely by having had zero sub-steps before.
        if (parentPath.length > 0) recomputeAncestors(plan.steps, [...parentPath, newStep.id]);
      }),

    moveStep: (planId, path, direction) =>
      set((state) => {
        const plan = state.plans.find((p) => p.id === planId);
        if (!plan) return;
        const siblings = findParentArray(plan.steps, path);
        if (!siblings) return;
        const index = siblings.findIndex((s) => s.id === path[path.length - 1]);
        const swapIndex = index + direction;
        if (index === -1 || swapIndex < 0 || swapIndex >= siblings.length) return;
        // The step object carries its whole subSteps tree with it, so moving
        // it here automatically moves every one of its sub-steps too.
        const [moved] = siblings.splice(index, 1);
        siblings.splice(swapIndex, 0, moved);
      }),

    updateStep: (planId, path, updates) =>
      set((state) => {
        const plan = state.plans.find((p) => p.id === planId);
        if (!plan) return;
        const step = findStep(plan.steps, path);
        if (!step) return;
        Object.assign(step, updates);
      }),

    // Toggling a step with sub-steps marks all of them the same way (checking
    // a parent completes its children; unchecking it reopens them), and
    // toggling any step re-evaluates its ancestors so a parent auto-completes
    // once every sub-step is done, and auto-reverts the moment one isn't.
    toggleStepDone: (planId, path) =>
      set((state) => {
        const plan = state.plans.find((p) => p.id === planId);
        if (!plan) return;
        const step = findStep(plan.steps, path);
        if (!step) return;
        setDoneRecursive(step, !step.done);
        recomputeAncestors(plan.steps, path);
      }),

    deleteStep: (planId, path) =>
      set((state) => {
        const plan = state.plans.find((p) => p.id === planId);
        if (!plan) return;
        const parentArray = findParentArray(plan.steps, path);
        if (!parentArray) return;
        const index = parentArray.findIndex((s) => s.id === path[path.length - 1]);
        if (index === -1) return;
        parentArray.splice(index, 1);
        // Removing a step may leave its remaining siblings all-done, which
        // should complete their shared parent.
        recomputeAncestors(plan.steps, path);
      }),

    addAlternative: (planId, path, label) =>
      set((state) => {
        const trimmed = label.trim();
        if (!trimmed) return;
        const plan = state.plans.find((p) => p.id === planId);
        if (!plan) return;
        const step = findStep(plan.steps, path);
        if (!step) return;
        step.alternatives.push({ id: genId('alt'), label: trimmed });
      }),

    removeAlternative: (planId, path, alternativeId) =>
      set((state) => {
        const plan = state.plans.find((p) => p.id === planId);
        if (!plan) return;
        const step = findStep(plan.steps, path);
        if (!step) return;
        step.alternatives = step.alternatives.filter((a) => a.id !== alternativeId);
      }),

    addAttachment: (planId, path, label) =>
      set((state) => {
        const trimmed = label.trim();
        if (!trimmed) return;
        const plan = state.plans.find((p) => p.id === planId);
        if (!plan) return;
        const step = findStep(plan.steps, path);
        if (!step) return;
        step.attachments.push({ id: genId('attachment'), label: trimmed });
      }),

    removeAttachment: (planId, path, attachmentId) =>
      set((state) => {
        const plan = state.plans.find((p) => p.id === planId);
        if (!plan) return;
        const step = findStep(plan.steps, path);
        if (!step) return;
        step.attachments = step.attachments.filter((a) => a.id !== attachmentId);
      }),
  }))
);

export function selectStepAtPath(steps: PlanStep[], path: string[]): PlanStep | undefined {
  return findStep(steps, path);
}

export interface FlatStep {
  path: string[];
  depth: number;
  step: PlanStep;
}

export function flattenSteps(steps: PlanStep[], parentPath: string[] = [], depth = 0): FlatStep[] {
  return steps.flatMap((step) => {
    const path = [...parentPath, step.id];
    return [{ path, depth, step }, ...flattenSteps(step.subSteps, path, depth + 1)];
  });
}

export function computePlanProgress(steps: PlanStep[]): { done: number; total: number; percent: number } {
  const flat = flattenSteps(steps);
  const total = flat.length;
  const done = flat.filter((f) => f.step.done).length;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}
