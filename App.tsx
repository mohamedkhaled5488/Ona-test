import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import {
  useFonts as useSpaceGrotesk,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
} from '@expo-google-fonts/space-grotesk';
import { useFonts as useInter, Inter_400Regular, Inter_500Medium } from '@expo-google-fonts/inter';
import { useFonts as useCaveat, Caveat_500Medium, Caveat_600SemiBold } from '@expo-google-fonts/caveat';
import { useFonts as usePatrickHand, PatrickHand_400Regular } from '@expo-google-fonts/patrick-hand';
// Only for the "Continue with Google" button (Google's branding asks for Roboto Medium).
import { useFonts as useRoboto, Roboto_500Medium } from '@expo-google-fonts/roboto';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AppLockOverlay } from './src/components/LockScreen';
import { PaywallSheet } from './src/components/PaywallSheet';
import { useRelockOnBackground } from './src/hooks/useScreenPrivacy';
import { UiProvider } from './src/components/UiProvider';
import { ConsentNotice } from './src/components/ConsentNotice';
import { initNotifications, installExpoGoPushCrashGuard } from './src/utils/notifications';
import { useAuthStore } from './src/store/useAuthStore';
import { loadSkiaWebIfNeeded } from './src/utils/loadSkiaWeb';
import { useSettingsStore, settingsHydrated } from './src/store/useSettingsStore';
import { startSettingsEffects } from './src/utils/settingsEffects';
import { watchStudyEndReminders } from './src/utils/reminders';
import { startEntitlementSync } from './src/utils/entitlementBootstrap';
import { decideStartScreen, hasRealData, startAppData } from './src/utils/dataSpaceController';
import { setStartScreen } from './src/navigation/startScreen';
import { useDataSpace } from './src/hooks/useDataSpace';
import { DemoFrame } from './src/demo/DemoBanner';
import { useDailyPlanningStore } from './src/store/useDailyPlanningStore';
import { startSync } from './src/sync/syncController';
import { startAccountConsent } from './src/sync/accountConsent';
import { installDevLog } from './src/utils/devLog';
import { colors } from './src/theme';
import { applyTheme, themeVersion } from './src/theme/runtime';

// As early as possible, before anything else has a chance to transitively
// load expo-notifications — see the comment on this function for why.
installExpoGoPushCrashGuard();
installDevLog();
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [spaceGroteskLoaded, spaceGroteskError] = useSpaceGrotesk({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
  });
  const [interLoaded, interError] = useInter({ Inter_400Regular, Inter_500Medium });
  const [caveatLoaded, caveatError] = useCaveat({ Caveat_500Medium, Caveat_600SemiBold });
  const [patrickHandLoaded, patrickHandError] = usePatrickHand({ PatrickHand_400Regular });
  const [robotoLoaded, robotoError] = useRoboto({ Roboto_500Medium });

  // Never hang on the splash screen: if fonts fail, continue with system fonts.
  const fontsLoaded =
    (spaceGroteskLoaded || !!spaceGroteskError) &&
    (interLoaded || !!interError) &&
    (caveatLoaded || !!caveatError) &&
    (patrickHandLoaded || !!patrickHandError) &&
    (robotoLoaded || !!robotoError);

  const authInitializing = useAuthStore((s) => s.initializing);

  React.useEffect(() => {
    void initNotifications();
  }, []);

  // Settings load from the device before anything renders, so the first
  // frame already has the right theme. Their side effects (audio mode, Sleep
  // defaults, week start) start once they're loaded.
  const [settingsReady, setSettingsReady] = useState(false);
  useEffect(() => {
    let stopEffects: (() => void) | undefined;
    const stopStudy = watchStudyEndReminders();
    const stopEntitlement = startEntitlementSync();
    void settingsHydrated().then(() => {
      stopEffects = startSettingsEffects();
      setSettingsReady(true);
    });
    return () => {
      stopEffects?.();
      stopStudy();
      stopEntitlement();
    };
  }, []);

  // Every section's data, loaded from the device before the first frame and
  // saved again whenever it changes.
  const [dataReady, setDataReady] = useState(false);
  useEffect(() => {
    let stop: (() => void) | undefined;
    let alive = true;
    // Loads the user's own data, or Demo mode's if the app was left in it
    // (utils/dataSpaceController.ts). Saving starts there too.
    void settingsHydrated()
      .then(() => startAppData())
      .then(async () => {
        setStartScreen(await decideStartScreen(!!useAuthStore.getState().session));
        if (!alive) return;
        // The account's answer to "store my data in my account" comes first,
        // so a new phone or a reinstall syncs your data back by itself.
        const stopConsent = startAccountConsent();
        const stopSync = startSync();
        // Monthly tasks and series with an end get their next reminders scheduled.
        void useDailyPlanningStore.getState().refreshRollingReminders();
        stop = () => {
          stopConsent();
          stopSync();
        };
        setDataReady(true);
      });
    return () => {
      alive = false;
      stop?.();
    };
  }, []);

  // Settings → Appearance. A change swaps the theme tokens and remounts the
  // tree (navigation state is kept), so every screen picks it up at once.
  useRelockOnBackground();

  const systemScheme = useColorScheme();
  const themeChoice = useSettingsStore((s) => s.theme);
  const accent = useSettingsStore((s) => s.accent);
  const textSize = useSettingsStore((s) => s.textSize);
  // Week start and time format are read by plain date code, so a change
  // remounts too, letting every screen pick it up at once.
  const weekStartsOn = useSettingsStore((s) => s.weekStartsOn);
  const timeFormat = useSettingsStore((s) => s.timeFormat);
  const scheme = themeChoice === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : themeChoice;
  const themeVersionKey = useMemo(() => {
    applyTheme({ scheme, accent, textSize });
    return themeVersion();
  }, [scheme, accent, textSize]);
  // Entering or leaving Demo mode remounts everything too.
  const space = useDataSpace();
  const themeKey = `${themeVersionKey}-${weekStartsOn}-${timeFormat}-${space}`;

  // Skia (used by the Identify the Feeling graph) needs its WASM CanvasKit
  // runtime loaded before any Skia component renders on web — a no-op on
  // native, which links Skia natively (see utils/loadSkiaWeb.ts /
  // .web.ts — the platform-specific file Metro picks keeps canvaskit-wasm,
  // a Node-only package, entirely out of the native bundle). Never block
  // the splash screen forever on this: if it fails to load, continue
  // anyway, since only that one graph depends on it.
  const [skiaReady, setSkiaReady] = useState(false);
  useEffect(() => {
    loadSkiaWebIfNeeded()
      .then(() => setSkiaReady(true))
      .catch(() => setSkiaReady(true));
  }, []);

  const ready = fontsLoaded && !authInitializing && skiaReady && settingsReady && dataReady;

  const onLayoutRootView = useCallback(async () => {
    if (ready) {
      await SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  // Ona works fully without an account. Signing in (for sync) lives in
  // Settings → Account & Subscription.

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
        {/* Outside the remounting part, so a toast or dialog survives a theme
            change or entering/leaving Demo mode. */}
        <UiProvider>
          <View key={themeKey} style={{ flex: 1, backgroundColor: colors.stone }} onLayout={onLayoutRootView}>
            <StatusBar style={scheme === 'dark' || space === 'demo' ? 'light' : 'dark'} />
            <DemoFrame>
              <RootNavigator />
            </DemoFrame>
            <PaywallSheet />
            <ConsentNotice />
            <AppLockOverlay />
          </View>
        </UiProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
