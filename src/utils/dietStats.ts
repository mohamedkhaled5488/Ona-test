import type { MealSource, PlannedMeal } from '../types/sections';

export function totalCost(meals: PlannedMeal[]): number {
  return meals.reduce((sum, m) => sum + (m.cost ?? 0), 0);
}

export function costBySource(meals: PlannedMeal[]): Partial<Record<MealSource, number>> {
  const result: Partial<Record<MealSource, number>> = {};
  meals.forEach((m) => {
    if (!m.source) return;
    result[m.source] = (result[m.source] ?? 0) + (m.cost ?? 0);
  });
  return result;
}

export function mostRepeatedMeals(meals: PlannedMeal[], limit = 5): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  meals.forEach((m) => counts.set(m.name, (counts.get(m.name) ?? 0) + 1));
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .filter((entry) => entry.count > 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
