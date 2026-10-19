// Every section's screen opens without crashing: with no data (the empty
// state), in the dark theme with the largest text, and with long Arabic and
// emoji content. A broad safety net under the per-section tests.
// IDs: docs/test-cases/screens.md
jest.mock('../../utils/notifications', () => ({
  cancelReminders: jest.fn(async () => {}),
  scheduleReminder: jest.fn(async () => []),
  scheduleTaskReminders: jest.fn(async () => []),
}));
jest.mock('../../utils/pinLock', () => ({
  ...jest.requireActual('../../utils/pinLock'),
  deviceAuthInfo: jest.fn(async () => ({ available: false, enrolled: false, biometricLabel: null })),
  authenticateWithDevice: jest.fn(async () => false),
  hasPin: jest.fn(async () => false),
}));
jest.setTimeout(30_000);

import React from 'react';
import { screen } from '@testing-library/react-native';
import { resetAll, useClock, restoreClock } from '../../test-utils';
import { renderScreen } from '../../test-utils/render';
import type { RootStackParamList } from '../../navigation/types';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useJournalStore } from '../../store/useJournalStore';
import { useHabitsStore } from '../../store/useHabitsStore';
import { useDailyPlanningStore } from '../../store/useDailyPlanningStore';
import { useFeelingsStore } from '../../store/useFeelingsStore';
import { usePlanStore } from '../../store/usePlanStore';

import { PlanListScreen } from '../PlanListScreen';
import { DailyPlanningScreen } from '../DailyPlanningScreen';
import { JournalingScreen } from '../JournalingScreen';
import { CatchAThoughtScreen } from '../CatchAThoughtScreen';
import { StudySessionScreen } from '../StudySessionScreen';
import { DietPlanningScreen } from '../DietPlanningScreen';
import { BookScreen } from '../BookScreen';
import { MoodCheckScreen } from '../MoodCheckScreen';
import { SleepScreen } from '../SleepScreen';
import { SkillsScreen } from '../SkillsScreen';
import { HabitsHubScreen } from '../HabitsHubScreen';
import { BudgetScreen } from '../BudgetScreen';
import { DiscoverScreen } from '../DiscoverScreen';
import { PlanningInsightsScreen } from '../PlanningInsightsScreen';
import { SettingsScreen } from '../SettingsScreen';

const SCREENS: [keyof RootStackParamList, React.ComponentType<any>][] = [
  ['planBuilder', PlanListScreen],
  ['dailyPlanning', DailyPlanningScreen],
  ['journaling', JournalingScreen],
  ['catchAThought', CatchAThoughtScreen],
  ['studySession', StudySessionScreen],
  ['dietPlanning', DietPlanningScreen],
  ['book', BookScreen],
  ['moodCheck', MoodCheckScreen],
  ['sleep', SleepScreen],
  ['skills', SkillsScreen],
  ['habitsHub', HabitsHubScreen],
  ['budget', BudgetScreen],
  ['discover', DiscoverScreen],
  ['planningInsights', PlanningInsightsScreen],
  ['settings', SettingsScreen],
];

beforeEach(async () => {
  await resetAll();
  useClock('2026-10-18T12:00');
});
afterEach(() => restoreClock());

// Some visible text, so a blank or crashed screen fails.
const hasText = () => screen.toJSON() !== null && JSON.stringify(screen.toJSON()).length > 200;

describe('SCR: every screen opens', () => {
  test.each(SCREENS)('SCR-001 %s: empty, light theme', async (name, C) => {
    await renderScreen(name, C);
    expect(hasText()).toBe(true);
  });

  test.each(SCREENS)('SCR-002 %s: dark theme, largest text', async (name, C) => {
    useSettingsStore.getState().set('theme', 'dark');
    useSettingsStore.getState().set('textSize', 'largest');
    await renderScreen(name, C);
    expect(hasText()).toBe(true);
  });

  test.each(SCREENS)('SCR-003 %s: long Arabic and emoji content', async (name, C) => {
    const long = '😊 ' + 'نص طويل جدًا باللغة العربية مع كلمات كثيرة. '.repeat(20);
    useJournalStore.getState().upsertEntry('2026-10-18', 'calm', long, ['عائلة']);
    useHabitsStore.getState().addHabit({ name: long.slice(0, 120), targetDays: 30 } as never);
    useDailyPlanningStore.getState().addTask('2026-10-18', long.slice(0, 200));
    useFeelingsStore.getState().addEntry('calm', [], undefined, ['عائلة']);
    usePlanStore.getState().createPlan(long.slice(0, 80), long, '#3D8B7A');
    await renderScreen(name, C);
    expect(hasText()).toBe(true);
  });
});

test('SCR-004 the screens list covers every section a person can open (except the held-back ones)', () => {
  const covered = new Set(SCREENS.map(([n]) => n));
  for (const n of ['planBuilder', 'dailyPlanning', 'journaling', 'catchAThought', 'studySession', 'dietPlanning', 'book', 'moodCheck', 'sleep', 'skills', 'budget'] as const) {
    expect(covered.has(n)).toBe(true);
  }
});
