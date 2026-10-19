// Integration 1: Plan Builder <-> Daily Planning. A step moved into a day is
// one thing in two places: completing or renaming it in either place shows in
// both, and deleting the step or the whole plan never leaves a broken task
// behind. IDs: docs/test-cases/integration.md
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));

import { resetAll, useClock, restoreClock } from '../../test-utils';
import { usePlanStore, selectStepAtPath } from '../../store/usePlanStore';
import { useDailyPlanningStore, resolveTaskDone, resolveTaskTitle } from '../../store/useDailyPlanningStore';
import { deletePlanKeepingTasks, deleteStepKeepingTasks } from '../planLinks';
import { carryOver } from '../dayView';
import { computePlanProgress } from '../../store/usePlanStore';

const plan = () => usePlanStore.getState();
const day = () => useDailyPlanningStore.getState();
const TODAY = '2026-10-18';

function setup() {
  const planId = plan().createPlan('Run a 10K', 'Feel strong again', '#3D8B7A');
  plan().addStep(planId, [], 'Buy running shoes');
  plan().addStep(planId, [], 'Train three times a week');
  const [shoes, train] = plan().plans[0].steps;
  plan().addStep(planId, [train.id], 'Week 1');
  plan().addStep(planId, [train.id], 'Week 2');
  const week1 = plan().plans[0].steps[1].subSteps[0];
  return { planId, shoes, train, week1 };
}

beforeEach(async () => {
  await resetAll();
  useClock(`${TODAY}T09:00`);
});
afterEach(() => restoreClock());

describe('INT-PLAN: a step moved into a day', () => {
  test('INT-PLAN-001 moving a step makes a linked task showing the step\'s title and the plan\'s motive; moving it again the same day reuses it', () => {
    const { planId, shoes } = setup();
    const id = day().addLinkedTask(TODAY, planId, [shoes.id]);
    const task = day().tasks.find((t) => t.id === id)!;
    expect(resolveTaskTitle(task)).toBe('Buy running shoes');
    expect(task.why).toBe('Feel strong again');
    expect(day().addLinkedTask(TODAY, planId, [shoes.id])).toBe(id);
    expect(day().tasks).toHaveLength(1);
  });

  test('INT-PLAN-002 ticking it in Daily Planning completes the step (and the plan\'s progress); ticking the step completes the task', () => {
    const { planId, shoes } = setup();
    const id = day().addLinkedTask(TODAY, planId, [shoes.id]);
    day().toggleTask(id, TODAY);
    expect(selectStepAtPath(plan().plans[0].steps, [shoes.id])?.done).toBe(true);
    expect(computePlanProgress(plan().plans[0].steps).done).toBeGreaterThan(0);
    plan().toggleStepDone(planId, [shoes.id]);
    expect(resolveTaskDone(day().tasks[0], TODAY)).toBe(false);
  });

  test('INT-PLAN-003 renaming in either place renames both', () => {
    const { planId, shoes } = setup();
    const id = day().addLinkedTask(TODAY, planId, [shoes.id]);
    day().updateTaskTitle(id, 'Buy trail shoes');
    expect(selectStepAtPath(plan().plans[0].steps, [shoes.id])?.title).toBe('Buy trail shoes');
    plan().updateStep(planId, [shoes.id], { title: 'Buy road shoes' });
    expect(resolveTaskTitle(day().tasks[0])).toBe('Buy road shoes');
  });

  test('INT-PLAN-004 a step with sub-steps: completing all sub-steps completes the parent, and its linked task', () => {
    const { planId, train } = setup();
    const id = day().addLinkedTask(TODAY, planId, [train.id]);
    for (const sub of plan().plans[0].steps[1].subSteps) plan().toggleStepDone(planId, [train.id, sub.id]);
    expect(resolveTaskDone(day().tasks.find((t) => t.id === id)!, TODAY)).toBe(true);
  });

  test('INT-PLAN-005 deleting the task in Daily Planning leaves the step in the plan', () => {
    const { planId, shoes } = setup();
    const id = day().addLinkedTask(TODAY, planId, [shoes.id]);
    day().deleteTask(id);
    expect(selectStepAtPath(plan().plans[0].steps, [shoes.id])?.title).toBe('Buy running shoes');
  });

  test('INT-PLAN-006 deleting the step keeps the task in your day as a normal task, with its title and done state', () => {
    const { planId, shoes } = setup();
    const id = day().addLinkedTask(TODAY, planId, [shoes.id]);
    day().toggleTask(id, TODAY);
    deleteStepKeepingTasks(planId, [shoes.id]);
    const task = day().tasks.find((t) => t.id === id)!;
    expect(task.linkedPlan).toBeUndefined();
    expect(resolveTaskTitle(task)).toBe('Buy running shoes');
    expect(resolveTaskDone(task, TODAY)).toBe(true);
    // ...and it can still be ticked off and on.
    day().toggleTask(id, TODAY);
    expect(resolveTaskDone(day().tasks.find((t) => t.id === id)!, TODAY)).toBe(false);
  });

  test('INT-PLAN-007 deleting a parent step also frees tasks linked to its sub-steps; other plans\' tasks are untouched', () => {
    const { planId, train, week1 } = setup();
    const other = plan().createPlan('Read more', '', '#8B72B0');
    plan().addStep(other, [], 'Finish one book');
    const otherStep = plan().plans.find((p) => p.id === other)!.steps[0];
    const sub = day().addLinkedTask(TODAY, planId, [train.id, week1.id]);
    const kept = day().addLinkedTask(TODAY, other, [otherStep.id]);
    deleteStepKeepingTasks(planId, [train.id]);
    expect(day().tasks.find((t) => t.id === sub)!.linkedPlan).toBeUndefined();
    expect(resolveTaskTitle(day().tasks.find((t) => t.id === sub)!)).toBe('Week 1');
    expect(day().tasks.find((t) => t.id === kept)!.linkedPlan?.planId).toBe(other);
  });

  test('INT-PLAN-008 deleting the whole plan keeps all its tasks as normal tasks; Undo brings the plan and the links back', () => {
    const { planId, shoes, train } = setup();
    const a = day().addLinkedTask(TODAY, planId, [shoes.id]);
    const b = day().addLinkedTask('2026-10-17', planId, [train.id]);
    const undo = deletePlanKeepingTasks(planId);
    expect(plan().plans).toHaveLength(0);
    for (const id of [a, b]) {
      const t = day().tasks.find((x) => x.id === id)!;
      expect(t.linkedPlan).toBeUndefined();
      expect(t.title).not.toBe('');
    }
    // An open one from yesterday still shows as "still open", by its own title.
    expect(carryOver(day().tasks, TODAY, (t, d) => resolveTaskDone(t, d)).map(resolveTaskTitle)).toEqual(['Train three times a week']);
    undo();
    expect(plan().plans.map((p) => p.title)).toEqual(['Run a 10K']);
    expect(day().tasks.find((x) => x.id === a)!.linkedPlan?.planId).toBe(planId);
  });

  test('INT-PLAN-009 no task is ever left pointing at a step that doesn\'t exist', () => {
    const { planId, shoes, train, week1 } = setup();
    day().addLinkedTask(TODAY, planId, [shoes.id]);
    day().addLinkedTask(TODAY, planId, [train.id, week1.id]);
    deleteStepKeepingTasks(planId, [shoes.id]);
    deletePlanKeepingTasks(planId);
    const dangling = day().tasks.filter((t) => t.linkedPlan && !selectStepAtPath(plan().plans.find((p) => p.id === t.linkedPlan!.planId)?.steps ?? [], t.linkedPlan.path));
    expect(dangling).toEqual([]);
  });
});

test('INT-PLAN-010 screens delete plans and steps only through the safe versions (never the raw store call)', () => {
  const fs = require('fs') as { readFileSync: (p: string, e: string) => string };
  const path = require('path') as { join: (...p: string[]) => string };
  for (const f of ['src/screens/PlanDetailScreen.tsx', 'src/screens/PlanStepDetailScreen.tsx', 'src/screens/PlanListScreen.tsx']) {
    const src = fs.readFileSync(path.join(process.cwd(), f), 'utf8');
    expect(src).not.toMatch(/\bdeletePlan\(|\bdeleteStep\(/);
  }
});
