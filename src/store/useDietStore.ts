import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { PlannedMeal, FavoriteMeal, GroceryItem, MealSlot, MealSource } from '../types/sections';
import { mockPlannedMeals, mockFavoriteMeals } from '../data/mockData';
import { genId } from '../utils/id';

export interface MealInput {
  name: string;
  cost?: number;
  source?: MealSource;
  notes?: string;
  tags: string[];
}

interface DietState {
  currency: string; // changed inline next to any cost field
  setCurrency: (code: string) => void;
  plannedMeals: PlannedMeal[];
  favorites: FavoriteMeal[];
  groceryItems: GroceryItem[];

  addMeal: (date: string, slot: MealSlot, meal: MealInput) => void;
  updateMeal: (id: string, meal: MealInput) => void;
  deleteMeal: (id: string) => void;
  addFavoriteToDay: (favoriteId: string, date: string, slot: MealSlot) => void;

  saveAsFavorite: (mealId: string) => void;
  deleteFavorite: (id: string) => void;

  generateGroceryList: (weekDates: string[]) => void;
  addGroceryItem: (label: string) => void;
  toggleGroceryItem: (id: string) => void;
  deleteGroceryItem: (id: string) => void;
  clearCheckedGroceryItems: () => void;
}

export const useDietStore = create<DietState>()(
  immer((set) => ({
    currency: 'USD',
    setCurrency: (code) =>
      set((state) => {
        state.currency = code;
      }),
    plannedMeals: mockPlannedMeals,
    favorites: mockFavoriteMeals,
    groceryItems: [],

    addMeal: (date, slot, meal) =>
      set((state) => {
        if (!meal.name.trim()) return;
        state.plannedMeals.push({ id: genId('meal'), date, slot, ...meal, name: meal.name.trim() });
      }),

    updateMeal: (id, meal) =>
      set((state) => {
        const existing = state.plannedMeals.find((m) => m.id === id);
        if (!existing || !meal.name.trim()) return;
        Object.assign(existing, meal, { name: meal.name.trim() });
      }),

    deleteMeal: (id) =>
      set((state) => {
        state.plannedMeals = state.plannedMeals.filter((m) => m.id !== id);
      }),

    addFavoriteToDay: (favoriteId, date, slot) =>
      set((state) => {
        const favorite = state.favorites.find((f) => f.id === favoriteId);
        if (!favorite) return;
        state.plannedMeals.push({
          id: genId('meal'),
          date,
          slot,
          name: favorite.name,
          cost: favorite.cost,
          source: favorite.source,
          notes: favorite.notes,
          tags: favorite.tags,
        });
      }),

    saveAsFavorite: (mealId) =>
      set((state) => {
        const meal = state.plannedMeals.find((m) => m.id === mealId);
        if (!meal) return;
        const already = state.favorites.some((f) => f.name.toLowerCase() === meal.name.toLowerCase());
        if (already) return;
        state.favorites.push({
          id: genId('favorite'),
          name: meal.name,
          cost: meal.cost,
          source: meal.source,
          notes: meal.notes,
          tags: meal.tags,
        });
      }),

    deleteFavorite: (id) =>
      set((state) => {
        state.favorites = state.favorites.filter((f) => f.id !== id);
      }),

    // Adds a grocery item per home-cooked/grocery meal in the given week that
    // isn't already on the list — restaurant/delivery meals need no shopping.
    // Existing items (including checked ones) are left alone so re-generating
    // doesn't wipe out a list someone's partway through using.
    generateGroceryList: (weekDates) =>
      set((state) => {
        const mealsNeedingGroceries = state.plannedMeals.filter(
          (m) => weekDates.includes(m.date) && (m.source === 'home-cooked' || m.source === 'grocery' || !m.source)
        );
        const existingLabels = new Set(state.groceryItems.map((i) => i.label.toLowerCase()));
        mealsNeedingGroceries.forEach((meal) => {
          if (!existingLabels.has(meal.name.toLowerCase())) {
            existingLabels.add(meal.name.toLowerCase());
            state.groceryItems.push({ id: genId('grocery'), label: meal.name, checked: false });
          }
        });
      }),

    addGroceryItem: (label) =>
      set((state) => {
        const trimmed = label.trim();
        if (!trimmed) return;
        state.groceryItems.push({ id: genId('grocery'), label: trimmed, checked: false });
      }),

    toggleGroceryItem: (id) =>
      set((state) => {
        const item = state.groceryItems.find((i) => i.id === id);
        if (item) item.checked = !item.checked;
      }),

    deleteGroceryItem: (id) =>
      set((state) => {
        state.groceryItems = state.groceryItems.filter((i) => i.id !== id);
      }),

    clearCheckedGroceryItems: () =>
      set((state) => {
        state.groceryItems = state.groceryItems.filter((i) => !i.checked);
      }),
  }))
);
