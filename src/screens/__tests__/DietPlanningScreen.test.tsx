// Diet Planning, as a person uses it: plan a meal with a cost, edit it,
// delete it with a confirmation, the week and summary totals, the grocery list,
// numbers typed with a decimal comma, Arabic names, screen-reader labels, and
// that it survives a relaunch. IDs: docs/test-cases/diet.md
jest.mock('../../utils/notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []) }));

import { screen } from '@testing-library/react-native';
import { resetAll, useClock, restoreClock } from '../../test-utils';
import { renderScreen } from '../../test-utils/render';
import { DietPlanningScreen } from '../DietPlanningScreen';
import { useDietStore } from '../../store/useDietStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { startAppData, __flushForTests } from '../../utils/dataSpaceController';
import { hydrateLocalData } from '../../utils/localPersistence';
import { totalCost } from '../../utils/dietStats';

// Whole screens render slowly on a busy machine (e.g. with Docker running).
jest.setTimeout(20_000);

beforeEach(async () => {
  await resetAll();
  useDietStore.setState({ currency: 'USD' });
  useClock('2026-10-18T12:00');
});
afterEach(() => restoreClock());

type User = Awaited<ReturnType<typeof renderScreen>>['user'];
async function addMeal(user: User, slot: 'breakfast' | 'lunch' | 'dinner' | 'snack', name: string, cost?: string) {
  await user.press(screen.getByText(` Add ${slot}`));
  await user.type(screen.getByPlaceholderText('e.g. Grilled chicken salad'), name);
  if (cost !== undefined) await user.type(screen.getByPlaceholderText('0.00'), cost);
  await user.press(screen.getByRole('button', { name: 'Save' }));
}

describe('DIET-C: Diet Planning screen', () => {
  test('DIET-C-001 an empty day offers every meal slot and says what the section is for', async () => {
    await renderScreen('dietPlanning', DietPlanningScreen);
    expect(screen.getByText('A planning and cost tool — not a nutrition tracker')).toBeTruthy();
    for (const s of ['breakfast', 'lunch', 'dinner', 'snack']) expect(screen.getByText(` Add ${s}`)).toBeTruthy();
  });

  test('DIET-C-002 plan a meal with a cost; it shows on the day with the cost', async () => {
    const { user } = await renderScreen('dietPlanning', DietPlanningScreen);
    await addMeal(user, 'lunch', 'Lentil soup', '4.5');
    expect(screen.getByText('Lentil soup')).toBeTruthy();
    expect(screen.getByText('$4.50')).toBeTruthy();
    expect(useDietStore.getState().plannedMeals[0]).toMatchObject({ date: '2026-10-18', slot: 'lunch', name: 'Lentil soup', cost: 4.5 });
  });

  test('DIET-C-003 a decimal comma cost is kept: "12,50" is 12.50, not lost', async () => {
    const { user } = await renderScreen('dietPlanning', DietPlanningScreen);
    await addMeal(user, 'dinner', 'Koshari', '12,50');
    expect(useDietStore.getState().plannedMeals[0].cost).toBe(12.5);
  });

  test('DIET-C-004 a cost that isn\'t a number is left empty, never saved as NaN', async () => {
    const { user } = await renderScreen('dietPlanning', DietPlanningScreen);
    await addMeal(user, 'snack', 'Fruit', 'cheap');
    const meal = useDietStore.getState().plannedMeals[0];
    expect(meal.name).toBe('Fruit');
    expect(meal.cost).toBeUndefined();
  });

  test('DIET-C-005 an Arabic dish name and Arabic-Indic digits', async () => {
    const { user } = await renderScreen('dietPlanning', DietPlanningScreen);
    await addMeal(user, 'breakfast', 'فول مدمس', '٢٥');
    expect(screen.getByText('فول مدمس')).toBeTruthy();
    expect(useDietStore.getState().plannedMeals[0].cost).toBe(25);
  });

  test('DIET-C-006 edit a meal, then delete it after confirming', async () => {
    useDietStore.getState().addMeal('2026-10-18', 'lunch', { name: 'Pasta', cost: 6, tags: [] });
    const { user } = await renderScreen('dietPlanning', DietPlanningScreen);
    await user.press(screen.getByText('Pasta'));
    expect(screen.getByText('Edit meal')).toBeTruthy();
    await user.clear(screen.getByPlaceholderText('e.g. Grilled chicken salad'));
    await user.type(screen.getByPlaceholderText('e.g. Grilled chicken salad'), 'Pasta al forno');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Pasta al forno')).toBeTruthy();
    await user.press(screen.getByText('Pasta al forno'));
    await user.press(screen.getByRole('button', { name: 'Delete' }));
    const confirm = screen.getAllByRole('button', { name: 'Delete' }); // the dialog opens over the form
    await user.press(confirm[confirm.length - 1]);
    expect(useDietStore.getState().plannedMeals).toEqual([]);
  });

  test('DIET-C-007 the summary total is the sum of the meals planned that week', async () => {
    useSettingsStore.getState().set('weekStartsOn', 1); // Mon 12 – Sun 18 October
    useDietStore.getState().addMeal('2026-10-18', 'lunch', { name: 'A', cost: 4.5, tags: [] });
    useDietStore.getState().addMeal('2026-10-17', 'dinner', { name: 'B', cost: 10, tags: [] });
    useDietStore.getState().addMeal('2026-10-16', 'snack', { name: 'C', tags: [] }); // no cost
    const { user } = await renderScreen('dietPlanning', DietPlanningScreen);
    await user.press(screen.getByText('Summary'));
    expect(screen.getByText('$14.50')).toBeTruthy();
    expect(totalCost(useDietStore.getState().plannedMeals)).toBe(14.5);
  });

  test('DIET-C-008 grocery list: add, tick off and remove items, with labelled controls', async () => {
    const { user } = await renderScreen('dietPlanning', DietPlanningScreen);
    await user.press(screen.getByText('Grocery'));
    expect(screen.getByText('No grocery items yet.')).toBeTruthy();
    await user.type(screen.getByPlaceholderText('Add an item...'), 'Tomatoes');
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await user.press(screen.getByRole('checkbox', { name: 'Tomatoes' }));
    expect(useDietStore.getState().groceryItems[0].checked).toBe(true);
    await user.press(screen.getByRole('button', { name: 'Remove Tomatoes' }));
    await user.press(screen.getByRole('button', { name: 'Delete' }));
    expect(useDietStore.getState().groceryItems).toEqual([]);
  });

  test('DIET-C-009 a blank grocery item is not added', async () => {
    const { user } = await renderScreen('dietPlanning', DietPlanningScreen);
    await user.press(screen.getByText('Grocery'));
    await user.type(screen.getByPlaceholderText('Add an item...'), '   ');
    await user.press(screen.getByRole('button', { name: 'Add' }));
    expect(useDietStore.getState().groceryItems).toEqual([]);
  });

  test('DIET-C-010 meals and the grocery list survive closing and reopening the app', async () => {
    await startAppData(undefined, false);
    useDietStore.getState().addMeal('2026-10-18', 'dinner', { name: 'Molokhia', cost: 7, tags: ['home'] });
    useDietStore.getState().addGroceryItem('Rice');
    await __flushForTests();
    useDietStore.setState({ plannedMeals: [], groceryItems: [] });
    await hydrateLocalData(undefined, false);
    expect(useDietStore.getState().plannedMeals[0]).toMatchObject({ name: 'Molokhia', cost: 7, tags: ['home'] });
    expect(useDietStore.getState().groceryItems.map((g) => g.label)).toEqual(['Rice']);
  });
});
