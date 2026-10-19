// Deleting a plan or a step without leaving broken tasks behind.
//
// A step moved into Daily Planning becomes a linked task whose title and done
// state live on the step. If the step (or its whole plan) is deleted, those
// tasks would point at nothing: titled "Plan step" and impossible to tick off.
// So before deleting, every task linked to what's going away is turned into a
// normal task that keeps the step's last title and done state. The returned
// function undoes both (for the "Undo" in the toast).
import { usePlanStore, selectStepAtPath } from '../store/usePlanStore';
import { useDailyPlanningStore } from '../store/useDailyPlanningStore';
import type { DailyTask, Plan } from '../types/sections';

const startsWith = (path: string[], prefix: string[]) => prefix.every((id, i) => path[i] === id);

function detach(planId: string, prefix: string[]): void {
  const plan = usePlanStore.getState().plans.find((p) => p.id === planId);
  useDailyPlanningStore.setState((state) => ({
    tasks: state.tasks.map((t) => {
      if (!t.linkedPlan || t.linkedPlan.planId !== planId || !startsWith(t.linkedPlan.path, prefix)) return t;
      const step = plan ? selectStepAtPath(plan.steps, t.linkedPlan.path) : undefined;
      const { linkedPlan: _gone, ...rest } = t;
      return { ...rest, title: step?.title || 'Plan step', done: !!step?.done } as DailyTask;
    }),
  }));
}

function snapshot(): () => void {
  const plans: Plan[] = usePlanStore.getState().plans;
  const tasks: DailyTask[] = useDailyPlanningStore.getState().tasks;
  return () => {
    usePlanStore.setState({ plans });
    useDailyPlanningStore.setState({ tasks });
  };
}

export function deletePlanKeepingTasks(planId: string): () => void {
  const undo = snapshot();
  detach(planId, []);
  usePlanStore.getState().deletePlan(planId);
  return undo;
}

export function deleteStepKeepingTasks(planId: string, path: string[]): () => void {
  const undo = snapshot();
  detach(planId, path);
  usePlanStore.getState().deleteStep(planId, path);
  return undo;
}
