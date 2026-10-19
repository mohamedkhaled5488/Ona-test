// Budget, as a person uses it: create, log, see totals, delete with a
// confirmation; empty state; numbers typed the way people really type them
// (a decimal comma, Arabic-Indic digits); long and RTL text; the default
// currency; and that it all survives a relaunch. IDs: docs/test-cases/budget.md
jest.mock('../../utils/notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []) }));

import { screen } from '@testing-library/react-native';
import { resetAll, useClock, restoreClock } from '../../test-utils';
import { renderScreen } from '../../test-utils/render';
import { BudgetScreen } from '../BudgetScreen';
import { useBudgetStore } from '../../store/useBudgetStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { startAppData, __flushForTests } from '../../utils/dataSpaceController';
import { hydrateLocalData } from '../../utils/localPersistence';

// Whole screens render slowly on a busy machine (e.g. with Docker running).
jest.setTimeout(20_000);

beforeEach(async () => {
  await resetAll();
  useClock('2026-10-18T12:00');
});
afterEach(() => restoreClock());

async function createBudget(user: Awaited<ReturnType<typeof renderScreen>>['user'], name: string, amount: string) {
  await user.press(screen.getByRole('button', { name: 'New budget' }));
  await user.type(screen.getByPlaceholderText('e.g. Japan trip, Groceries'), name);
  await user.type(screen.getByPlaceholderText('0.00'), amount);
  await user.press(screen.getByRole('button', { name: 'Create budget' }));
}

describe('BUD-C: Budget screen', () => {
  test('BUD-C-001 empty state: a calm line, "See how this works", and New budget', async () => {
    await renderScreen('budget', BudgetScreen);
    expect(screen.getByText('Nothing yet — create your first budget below.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /See how this works/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New budget' })).toBeTruthy();
  });

  test('BUD-C-002 create a limit, log an expense, see spent and remaining', async () => {
    const { user } = await renderScreen('budget', BudgetScreen);
    await createBudget(user, 'Groceries', '200');
    expect(await screen.findByText('Groceries')).toBeTruthy(); // opens the new budget
    await user.press(screen.getByRole('button', { name: 'Log an expense' }));
    await user.type(screen.getByPlaceholderText('0.00 USD'), '45.5');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Spent $45.50 of $200.00')).toBeTruthy();
    expect(screen.getByText('$154.50 remaining')).toBeTruthy();
    expect(useBudgetStore.getState().entries).toHaveLength(1);
  });

  test('BUD-C-003 Create stays off until there is a name and an amount above zero', async () => {
    const { user } = await renderScreen('budget', BudgetScreen);
    await user.press(screen.getByRole('button', { name: 'New budget' }));
    const create = () => screen.getByRole('button', { name: 'Create budget' });
    expect(create()).toBeDisabled();
    await user.type(screen.getByPlaceholderText('e.g. Japan trip, Groceries'), '   ');
    await user.type(screen.getByPlaceholderText('0.00'), '50');
    expect(create()).toBeDisabled(); // a blank name
    await user.type(screen.getByPlaceholderText('e.g. Japan trip, Groceries'), 'Trip');
    expect(create()).toBeEnabled();
    await user.clear(screen.getByPlaceholderText('0.00'));
    await user.type(screen.getByPlaceholderText('0.00'), '-5');
    expect(create()).toBeDisabled(); // negative
  });

  test('BUD-C-004 a decimal comma works: "12,50" is 12.50', async () => {
    const { user } = await renderScreen('budget', BudgetScreen);
    await createBudget(user, 'Café', '12,50');
    expect(useBudgetStore.getState().budgets[0]?.targetAmount).toBe(12.5);
  });

  test('BUD-C-005 Arabic-Indic digits and the Arabic decimal mark work: "١٢٠٫٥" is 120.5', async () => {
    const { user } = await renderScreen('budget', BudgetScreen);
    await createBudget(user, 'مصاريف البيت', '١٢٠٫٥');
    expect(useBudgetStore.getState().budgets[0]).toMatchObject({ name: 'مصاريف البيت', targetAmount: 120.5 });
    expect(await screen.findByText('مصاريف البيت')).toBeTruthy();
  });

  test('BUD-C-006 closing the form and opening it again still starts in your default currency', async () => {
    useSettingsStore.getState().set('budgetCurrency', 'EGP');
    const { user } = await renderScreen('budget', BudgetScreen);
    await user.press(screen.getByRole('button', { name: 'New budget' }));
    expect(screen.getByText('EGP')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Close' })); // closed without saving
    await createBudget(user, 'Second', '100');
    expect(useBudgetStore.getState().budgets.map((b) => b.currency)).toEqual(['EGP']);
  });

  test('BUD-C-007 delete asks first; cancelling keeps it, confirming removes it and its entries', async () => {
    const id = useBudgetStore.getState().addBudget({ name: 'Trip', mode: 'limit', targetAmount: 500, currency: 'USD', recurrence: 'none' });
    useBudgetStore.getState().addEntry(id, { amount: 20 });
    const { user } = await renderScreen('budget', BudgetScreen, { openBudgetId: id });
    await user.press(screen.getByRole('button', { name: 'Delete budget' }));
    expect(screen.getByText(/Delete "Trip" and everything logged in it\?/)).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(useBudgetStore.getState().budgets).toHaveLength(1);
    await user.press(screen.getByRole('button', { name: 'Delete budget' }));
    await user.press(screen.getByRole('button', { name: 'Delete' }));
    expect(useBudgetStore.getState().budgets).toHaveLength(0);
    expect(useBudgetStore.getState().entries).toHaveLength(0);
    expect(await screen.findByText('Nothing yet — create your first budget below.')).toBeTruthy();
  });

  test('BUD-C-008 going over a limit is a gentle note, never blame', async () => {
    const id = useBudgetStore.getState().addBudget({ name: 'Eating out', mode: 'limit', targetAmount: 100, currency: 'USD', recurrence: 'none' });
    useBudgetStore.getState().addEntry(id, { amount: 130 });
    await renderScreen('budget', BudgetScreen, { openBudgetId: id });
    expect(screen.getByText('A gentle heads-up')).toBeTruthy();
    expect(screen.getByText(/No judgment/)).toBeTruthy();
    expect(screen.getByText('$30.00 over')).toBeTruthy();
  });

  test('BUD-C-009 a very long name and emoji fit without breaking the list', async () => {
    const long = '✈️ ' + 'Summer trip to see the family '.repeat(8);
    useBudgetStore.getState().addBudget({ name: long, mode: 'goal', targetAmount: 1000, currency: 'USD', recurrence: 'none' });
    await renderScreen('budget', BudgetScreen);
    expect(screen.getByText(long)).toBeTruthy();
    expect(screen.getByText('Savings goal')).toBeTruthy();
  });

  test('BUD-C-010 budgets and entries survive closing and reopening the app', async () => {
    await startAppData(undefined, false);
    const id = useBudgetStore.getState().addBudget({ name: 'Rent', mode: 'limit', targetAmount: 900, currency: 'USD', recurrence: 'monthly' });
    useBudgetStore.getState().addEntry(id, { amount: 900, note: 'October' });
    await __flushForTests();
    useBudgetStore.setState({ budgets: [], entries: [] }); // the app closes; memory is gone
    await hydrateLocalData(undefined, false);
    expect(useBudgetStore.getState().budgets.map((b) => b.name)).toEqual(['Rent']);
    expect(useBudgetStore.getState().entries[0]).toMatchObject({ amount: 900, note: 'October' });
  });

  test('BUD-C-011 works with the largest text and the dark theme', async () => {
    useSettingsStore.getState().set('textSize', 'largest');
    useSettingsStore.getState().set('theme', 'dark');
    const { user } = await renderScreen('budget', BudgetScreen);
    await createBudget(user, 'Books', '30');
    expect(await screen.findByText('Books')).toBeTruthy();
    expect(screen.getByText('Spent $0.00 of $30.00')).toBeTruthy();
  });
});
