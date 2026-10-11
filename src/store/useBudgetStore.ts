import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Budget, BudgetEntry, BudgetMode, BudgetRecurrence } from '../types/sections';
import { genId } from '../utils/id';
import { todayISO, addDaysISO } from '../utils/date';

export interface BudgetInput {
  name: string;
  mode: BudgetMode;
  targetAmount: number;
  currency: string;
  deadline?: string;
  recurrence: BudgetRecurrence;
}

export interface BudgetEntryInput {
  amount: number;
  date?: string;
  categoryId?: string;
  note?: string;
  photoUri?: string;
}

interface BudgetsState {
  budgets: Budget[];
  entries: BudgetEntry[];

  addBudget: (input: BudgetInput) => string;
  deleteBudget: (id: string) => void;

  addCategory: (budgetId: string, label: string) => void;
  deleteCategory: (budgetId: string, categoryId: string) => void;

  addEntry: (budgetId: string, input: BudgetEntryInput) => string;
  deleteEntry: (id: string) => void;
}

export const useBudgetStore = create<BudgetsState>()(
  immer((set) => ({
    budgets: [],
    entries: [],

    addBudget: (input) => {
      const id = genId('budget');
      set((state) => {
        state.budgets.unshift({
          id,
          name: input.name.trim() || 'Untitled budget',
          mode: input.mode,
          targetAmount: Math.max(0, input.targetAmount),
          currency: input.currency,
          deadline: input.deadline,
          recurrence: input.recurrence,
          categories: [],
          createdAt: todayISO(),
        });
      });
      return id;
    },

    deleteBudget: (id) =>
      set((state) => {
        state.budgets = state.budgets.filter((b) => b.id !== id);
        state.entries = state.entries.filter((e) => e.budgetId !== id);
      }),

    addCategory: (budgetId, label) =>
      set((state) => {
        const trimmed = label.trim();
        if (!trimmed) return;
        const budget = state.budgets.find((b) => b.id === budgetId);
        if (budget) budget.categories.push({ id: genId('cat'), label: trimmed });
      }),

    deleteCategory: (budgetId, categoryId) =>
      set((state) => {
        const budget = state.budgets.find((b) => b.id === budgetId);
        if (budget) budget.categories = budget.categories.filter((c) => c.id !== categoryId);
        state.entries.forEach((e) => {
          if (e.budgetId === budgetId && e.categoryId === categoryId) e.categoryId = undefined;
        });
      }),

    addEntry: (budgetId, input) => {
      const id = genId('bentry');
      set((state) => {
        state.entries.unshift({
          id,
          budgetId,
          amount: Math.max(0, input.amount),
          date: input.date ?? todayISO(),
          categoryId: input.categoryId,
          note: input.note?.trim() || undefined,
          photoUri: input.photoUri,
          createdAt: new Date().toISOString(),
        });
      });
      return id;
    },

    deleteEntry: (id) =>
      set((state) => {
        state.entries = state.entries.filter((e) => e.id !== id);
      }),
  }))
);

// --- Pure helpers ---

// For a recurring budget, only entries within the current period count
// toward progress; for a one-off budget, every entry counts.
export function currentPeriodStart(budget: Budget, today: string): string | undefined {
  if (budget.recurrence === 'monthly') return `${today.slice(0, 7)}-01`;
  if (budget.recurrence === 'weekly') {
    const day = new Date(`${today}T00:00:00`).getDay();
    return addDaysISO(today, -day);
  }
  return undefined;
}

export function entriesForBudget(entries: BudgetEntry[], budgetId: string, periodStart?: string): BudgetEntry[] {
  return entries.filter((e) => e.budgetId === budgetId && (!periodStart || e.date >= periodStart));
}

export function totalForBudget(budget: Budget, entries: BudgetEntry[], today: string): number {
  const periodStart = currentPeriodStart(budget, today);
  return entriesForBudget(entries, budget.id, periodStart).reduce((sum, e) => sum + e.amount, 0);
}

export function progressPercent(budget: Budget, total: number): number {
  if (budget.targetAmount <= 0) return 0;
  return Math.min(100, (total / budget.targetAmount) * 100);
}

// Only meaningful for 'limit' mode — a gentle notice, never an alarm.
// `warnAtPercent` comes from Settings → Sections → Budget ("Warn me at").
export function limitWarningLevel(budget: Budget, total: number, warnAtPercent = 80): 'none' | 'approaching' | 'over' {
  if (budget.mode !== 'limit' || budget.targetAmount <= 0) return 'none';
  if (total > budget.targetAmount) return 'over';
  if (warnAtPercent < 100 && total >= budget.targetAmount * (warnAtPercent / 100)) return 'approaching';
  return 'none';
}

export interface CategoryBreakdown {
  categoryId: string;
  label: string;
  amount: number;
}

export function categoryBreakdown(budget: Budget, entries: BudgetEntry[], today: string): CategoryBreakdown[] {
  const periodStart = currentPeriodStart(budget, today);
  const relevant = entriesForBudget(entries, budget.id, periodStart);
  return budget.categories
    .map((c) => ({
      categoryId: c.id,
      label: c.label,
      amount: relevant.filter((e) => e.categoryId === c.id).reduce((sum, e) => sum + e.amount, 0),
    }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}
