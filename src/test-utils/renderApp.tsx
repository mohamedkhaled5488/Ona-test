// The whole app's navigation in a test: the real RootNavigator (tabs, every
// stack screen, the Back rules), with the app's surroundings, and Android's
// Back key. Unlike renderScreen (one screen, every other route a stub), this
// is how a person moves through Ona: what Recap links open, where Back goes.
//
//   const app = await renderApp();
//   await app.user.press(screen.getByText('Grow'));
//   expect(await app.pressBack()).toBe('handled');
//   expect(app.route()).toEqual({ name: 'Main', tab: 'home' });
import React from 'react';
import { BackHandler, Platform } from 'react-native';
import { act, render, userEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { UiProvider } from '../components/UiProvider';
import { RootNavigator, resetNavigationState } from '../navigation/RootNavigator';
import { setStartScreen } from '../navigation/startScreen';
import { navigationRef } from '../navigation/navigationRef';

const METRICS = { frame: { x: 0, y: 0, width: 400, height: 860 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

// Android's Back key: the app's "hardwareBackPress" listeners, newest first;
// if none uses the press, Android closes the app ("exit").
const listeners: (() => boolean | null | undefined)[] = [];
let installed = false;
function installBackKey() {
  listeners.length = 0;
  if (installed) return;
  installed = true;
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation(((_event: string, fn: () => boolean) => {
    listeners.push(fn);
    return { remove: () => listeners.includes(fn) && listeners.splice(listeners.indexOf(fn), 1) };
  }) as never);
}
// Home with real data starts async work (effects, timers); let it finish
// before the next test renders, or that render is lost in the open act scope.
afterEach(async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  listeners.length = 0;
});

export async function renderApp(options: { start?: 'Main' | 'welcome' } = {}) {
  installBackKey();
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  setStartScreen(options.start ?? 'Main');
  resetNavigationState();
  const user = userEvent.setup();
  const result = await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <UiProvider>
        <RootNavigator />
      </UiProvider>
    </SafeAreaProvider>
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  // Async: going back finishes after the press (the navigator's own work),
  // and a test must wait for it.
  const pressBack = async (): Promise<'handled' | 'exit'> => {
    let out: 'handled' | 'exit' = 'exit';
    await act(async () => {
      for (let i = listeners.length - 1; i >= 0; i--) {
        if (listeners[i]()) {
          out = 'handled';
          return;
        }
      }
    });
    return out;
  };
  // Where the person is: the stack screen, and on Main the tab.
  const route = () => {
    const root = navigationRef.getRootState();
    const top = root?.routes[root.index];
    if (top?.name !== 'Main') return { name: top?.name, depth: root?.routes.length };
    const tabs = top.state as { index: number; routes: { name: string }[] } | undefined;
    return { name: 'Main', tab: tabs ? tabs.routes[tabs.index].name : 'home', depth: root?.routes.length };
  };
  return { ...result, user, pressBack, route };
}
