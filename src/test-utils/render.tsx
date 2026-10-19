// Rendering a real screen in a test, wrapped the way the app wraps it: safe
// areas, the app's dialogs and toasts, and a navigator. Every other route is a
// stub that just says its name and params, so "it opened X" can be asserted.
//
//   const r = await renderScreen('budget', BudgetScreen);
//   await r.user.press(screen.getByText('Create budget'));
//   expect(await screen.findByText('Opened: taskEditor')).toBeTruthy();
import React from 'react';
import { Text } from 'react-native';
import { render, userEvent } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { UiProvider } from '../components/UiProvider';
import type { RootStackParamList } from '../navigation/types';

const ROUTES: (keyof RootStackParamList)[] = [
  'Main', 'welcome', 'planBuilder', 'dailyPlanning', 'taskEditor', 'planningInsights', 'journaling', 'catchAThought', 'studySession',
  'dietPlanning', 'songwriting', 'mindGames', 'moodCheck', 'sleep', 'book', 'skills', 'habitBuilder', 'budget', 'quitHabit', 'habitsHub',
  'discover', 'discoverTour', 'journalWrite', 'planDetail', 'planStepDetail', 'settings', 'signIn',
];

const Stack = createNativeStackNavigator();

function Stub({ route }: { route: { name: string; params?: unknown } }) {
  return <Text>{`Opened: ${route.name}${route.params ? ` ${JSON.stringify(route.params)}` : ''}`}</Text>;
}

const METRICS = { frame: { x: 0, y: 0, width: 400, height: 860 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

export async function renderScreen(name: keyof RootStackParamList, Screen: React.ComponentType<any>, params?: object) {
  const user = userEvent.setup();
  const result = await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <UiProvider>
        <NavigationContainer>
          <Stack.Navigator initialRouteName={name} screenOptions={{ animation: 'none' }}>
            {ROUTES.map((r) => (
              <Stack.Screen key={r} name={r} component={r === name ? Screen : (Stub as never)} initialParams={r === name ? params : undefined} />
            ))}
          </Stack.Navigator>
        </NavigationContainer>
      </UiProvider>
    </SafeAreaProvider>
  );
  return { ...result, user };
}

// A component (not a whole screen) with the same surroundings.
export async function renderWithApp(ui: React.ReactElement) {
  const user = userEvent.setup();
  const result = await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <UiProvider>
        <NavigationContainer>{ui}</NavigationContainer>
      </UiProvider>
    </SafeAreaProvider>
  );
  return { ...result, user };
}
