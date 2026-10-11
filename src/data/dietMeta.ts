import type { MealSlot, MealSource } from '../types/sections';

export const mealSlots: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export const mealSlotLabels: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

export const mealSourceLabels: Record<MealSource, string> = {
  'home-cooked': 'Home-cooked',
  restaurant: 'Restaurant',
  delivery: 'Delivery',
  grocery: 'Grocery',
};

export const mealSourceIcons: Record<MealSource, string> = {
  'home-cooked': 'home-outline',
  restaurant: 'restaurant-outline',
  delivery: 'bicycle-outline',
  grocery: 'basket-outline',
};

export const mealSourceOrder: MealSource[] = ['home-cooked', 'restaurant', 'delivery', 'grocery'];
