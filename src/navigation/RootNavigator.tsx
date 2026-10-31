import React, { useEffect, useRef } from 'react';
import { BackHandler, Pressable } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme, type NavigationState } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../theme';
import type { RootStackParamList, MainTabParamList } from './types';
import { RecapScreen } from '../screens/RecapScreen';
import { PlanFolderScreen, ReflectFolderScreen, GrowFolderScreen, LearnFolderScreen } from '../screens/FolderTabScreens';
import { PlanListScreen } from '../screens/PlanListScreen';
import { PlanDetailScreen } from '../screens/PlanDetailScreen';
import { PlanStepDetailScreen } from '../screens/PlanStepDetailScreen';
import { DailyPlanningScreen } from '../screens/DailyPlanningScreen';
import { TaskEditorScreen } from '../screens/TaskEditorScreen';
import { PlanningInsightsScreen } from '../screens/PlanningInsightsScreen';
import { JournalingScreen } from '../screens/JournalingScreen';
import { JournalWriteScreen } from '../screens/JournalWriteScreen';
import { CatchAThoughtScreen } from '../screens/CatchAThoughtScreen';
import { StudySessionScreen } from '../screens/StudySessionScreen';
import { DietPlanningScreen } from '../screens/DietPlanningScreen';
import { SongwritingScreen } from '../screens/SongwritingScreen';
import { BookScreen } from '../screens/BookScreen';
import { MindGamesScreen } from '../screens/MindGamesScreen';
import { MoodCheckScreen } from '../screens/MoodCheckScreen';
import { SleepScreen } from '../screens/SleepScreen';
import { SkillsScreen } from '../screens/SkillsScreen';
import { HabitBuilderScreen } from '../screens/HabitBuilderScreen';
import { BudgetScreen } from '../screens/BudgetScreen';
import { QuitHabitScreen } from '../screens/QuitHabitScreen';
import { HabitsHubScreen } from '../screens/HabitsHubScreen';
import { sectionsMeta } from '../data/sectionsMeta';
import { SettingsScreen } from '../screens/SettingsScreen';
import { AuthScreen } from '../screens/AuthScreen';
import { SETTINGS_SECTIONS, type SettingsSectionId } from '../screens/settings/pages';
import { currentScheme } from '../theme/runtime';
import { sensitiveScreen } from '../hooks/useScreenPrivacy';
import { WelcomeScreen } from '../screens/WelcomeScreen';
import { getStartScreen } from './startScreen';
import { navigationRef } from './navigationRef';
import { DiscoverScreen } from '../screens/DiscoverScreen';
import { DiscoverTourScreen } from '../screens/DiscoverTourScreen';
import { openSection } from './navigationRef';
import { useUi } from '../components/UiProvider';

const Stack = createNativeStackNavigator<RootStackParamList>();
const LockedJournalWrite = sensitiveScreen(JournalWriteScreen, 'journalWrite', true);
const Tab = createBottomTabNavigator<MainTabParamList>();

// Built per render, from the current theme tokens (Settings → Appearance).
function navTheme() {
  const base = currentScheme() === 'light' ? DefaultTheme : DarkTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      background: colors.stone,
      card: colors.stone,
      text: colors.ink,
      border: colors.line,
      primary: colors.teal,
    },
  };
}

// The small "Section settings" shortcut in a section's header. It opens that
// section's page in Settings — the same page, not a copy.
function SectionSettingsButton({ section, onPress }: { section: SettingsSectionId; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel="Section settings" testID={`section-settings-${section}`}>
      <Ionicons name="settings-outline" size={20} color={colors.inkSoft} />
    </Pressable>
  );
}

const hasSectionSettings = (id: string): id is SettingsSectionId => (SETTINGS_SECTIONS as string[]).includes(id);

const screenComponents = {
  planBuilder: PlanListScreen,
  dailyPlanning: DailyPlanningScreen,
  // Sensitive sections: screenshots can be blocked (Settings → Privacy), and
  // Journaling can sit behind its PIN lock.
  journaling: sensitiveScreen(JournalingScreen, 'journaling', true),
  catchAThought: CatchAThoughtScreen,
  studySession: StudySessionScreen,
  dietPlanning: DietPlanningScreen,
  songwriting: SongwritingScreen,
  book: BookScreen,
  mindGames: MindGamesScreen,
  moodCheck: sensitiveScreen(MoodCheckScreen, 'moodCheck'),
  sleep: SleepScreen,
  skills: SkillsScreen,
  habitBuilder: HabitBuilderScreen,
  budget: BudgetScreen,
  quitHabit: sensitiveScreen(QuitHabitScreen, 'quitHabit'),
} as const;

// Recap owns its own stack registration ('Main' below), so it's the one
// sectionsMeta entry excluded from this auto-registered list.
const stackSections = sectionsMeta.filter((s) => s.id !== 'recap');

const tabIcons: Record<keyof MainTabParamList, keyof typeof Ionicons.glyphMap> = {
  home: 'grid-outline',
  planFolder: 'compass-outline',
  reflectFolder: 'book-outline',
  growFolder: 'trending-up-outline',
  learnFolder: 'library-outline',
};

const tabLabels: Record<keyof MainTabParamList, string> = {
  home: 'Home',
  planFolder: 'Plan',
  reflectFolder: 'Reflect',
  growFolder: 'Grow',
  learnFolder: 'Learn',
};

// The 5-item bottom bar — Home (Recap) + the 4 folders. See the Ona
// navigation restructure doc.
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.teal,
        tabBarInactiveTintColor: colors.inkSoft,
        tabBarStyle: { backgroundColor: colors.stone, borderTopColor: colors.line },
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 11 },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={tabIcons[route.name as keyof MainTabParamList]} size={size} color={color} />
        ),
        tabBarLabel: tabLabels[route.name as keyof MainTabParamList],
        tabBarButtonTestID: `tab-${route.name}`, // for E2E flows (a tab and a Recap tile can share a name)
      })}
    >
      <Tab.Screen name="home" component={RecapScreen as any} />
      <Tab.Screen name="planFolder" component={PlanFolderScreen as any} />
      <Tab.Screen name="reflectFolder" component={ReflectFolderScreen as any} />
      <Tab.Screen name="growFolder" component={GrowFolderScreen as any} />
      <Tab.Screen name="learnFolder" component={LearnFolderScreen as any} />
    </Tab.Navigator>
  );
}

// Kept across a theme change, which remounts the whole tree, so the user
// stays exactly where they were (in Settings → Appearance).
let savedState: NavigationState | undefined;

// Entering or leaving Demo mode starts again from Home (the other space's
// screens may point at things that don't exist here).
export function resetNavigationState(): void {
  savedState = undefined;
}

// The last word on Android's Back key (docs/navigation.md): registered before
// the navigator and every screen, so it's asked only when none of them used
// the press (Back is called newest first). By then the person is on Home
// (another tab's root already went to Home, the navigator's first-tab rule) or
// on the first-run screen: the first press says how to close Ona, a second
// within 2 seconds closes it.
export const EXIT_HINT = 'Press Back again to close Ona';
const EXIT_WINDOW_MS = 2000;
function useExitOnSecondBack() {
  const { showToast } = useUi();
  const toast = useRef(showToast);
  toast.current = showToast;
  const sub = useRef<{ remove: () => void } | null>(null);
  if (!sub.current) {
    let last = 0;
    sub.current = BackHandler.addEventListener('hardwareBackPress', () => {
      const now = Date.now();
      if (now - last < EXIT_WINDOW_MS) return false; // let Android close the app
      last = now;
      toast.current({ message: EXIT_HINT });
      return true;
    });
  }
  useEffect(
    () => () => {
      sub.current?.remove();
      sub.current = null;
    },
    []
  );
}

export function RootNavigator() {
  useExitOnSecondBack();
  const start = getStartScreen();
  return (
    <NavigationContainer ref={navigationRef} theme={navTheme()} initialState={savedState} onStateChange={(state) => (savedState = state)}>
      <Stack.Navigator
        initialRouteName={start.name}
        screenOptions={{
          headerStyle: { backgroundColor: colors.stone },
          headerShadowVisible: false,
          headerTintColor: colors.ink,
          headerTitleStyle: { fontFamily: fonts.headingMedium },
          headerBackTitle: '',
        }}
      >
        <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
        <Stack.Screen name="welcome" component={WelcomeScreen} options={{ headerShown: false }} initialParams={{ hasData: start.hasData }} />
        {stackSections.map((section) => {
          const SectionScreen = screenComponents[section.id as keyof typeof screenComponents];
          if (!SectionScreen) return null;
          return (
            <Stack.Screen
              key={section.id}
              name={section.id as any}
              component={SectionScreen as React.ComponentType<any>}
              options={({ navigation }) => ({
                title: section.title,
                headerRight: hasSectionSettings(section.id)
                  ? () => (
                      <SectionSettingsButton
                        section={section.id as SettingsSectionId}
                        onPress={() => openSection('settings', { page: 'section', section: section.id })}
                      />
                    )
                  : undefined,
              })}
            />
          );
        })}
        <Stack.Screen name="habitsHub" component={HabitsHubScreen} options={{ title: 'Habits' }} />
        <Stack.Screen name="discover" component={DiscoverScreen} options={{ title: 'Discover' }} />
        <Stack.Screen name="discoverTour" component={DiscoverTourScreen} options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="journalWrite" component={LockedJournalWrite} options={{ headerShown: false }} />
        <Stack.Screen name="planDetail" component={PlanDetailScreen} options={{ title: 'Plan' }} />
        <Stack.Screen name="planningInsights" component={PlanningInsightsScreen} options={{ title: 'Insights' }} />
        <Stack.Screen name="taskEditor" component={TaskEditorScreen} options={({ route }) => ({ title: route.params.taskId ? 'Task' : 'New task' })} />
        <Stack.Screen name="settings" component={SettingsScreen} options={{ title: 'Settings' }} />
        <Stack.Screen name="signIn" component={AuthScreen as React.ComponentType<any>} options={{ title: 'Account' }} />
        <Stack.Screen
          name="planStepDetail"
          component={PlanStepDetailScreen}
          options={{ title: 'Step' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
