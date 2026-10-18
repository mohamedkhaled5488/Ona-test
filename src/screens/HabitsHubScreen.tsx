import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenTitle, Caption, Body } from '../components/Typography';
import { colors, radii, spacing, fonts } from '../theme';
import { HabitBuilderScreen } from './HabitBuilderScreen';
import { QuitHabitScreen } from './QuitHabitScreen';
import type { RootStackParamList } from '../navigation/types';
import { themedStyles } from '../theme/runtime';

type Props = NativeStackScreenProps<RootStackParamList, 'habitsHub'>;

type Mode = 'build' | 'quit';

// "Habits" — one Grow-folder card covering both Habit Builder and Quit a
// Habit, switched between with a segmented control rather than being two
// separate top-level sections. Both screens are otherwise unchanged; neither
// reads `navigation` internally, so they're embedded here with a synthetic
// route carrying whatever params this hub itself received.
export function HabitsHubScreen({ route }: Props) {
  const [mode, setMode] = useState<Mode>(route.params?.initialMode ?? 'build');

  // The title and the Build/Quit switch go inside the chosen screen, so the
  // page has one scrolling area (not one scroll view inside another).
  const header = (
    <>
      <ScreenTitle>Habits</ScreenTitle>
      <Caption style={styles.subtitle}>Build a new habit, or work on quitting one.</Caption>

      <View style={styles.segmented}>
        {(['build', 'quit'] as Mode[]).map((m) => (
          <Pressable key={m} onPress={() => setMode(m)} style={[styles.segment, mode === m && styles.segmentActive]}>
            <Body style={[styles.segmentText, mode === m && styles.segmentTextActive]}>
              {m === 'build' ? 'Build' : 'Quit'}
            </Body>
          </Pressable>
        ))}
      </View>
    </>
  );

  return mode === 'build' ? (
    <HabitBuilderScreen navigation={undefined as any} route={{ key: 'habitBuilder-in-hub', name: 'habitBuilder', params: undefined }} header={header} />
  ) : (
    <QuitHabitScreen navigation={undefined as any} route={{ key: 'quitHabit-in-hub', name: 'quitHabit', params: undefined }} header={header} />
  );
}

const styles = themedStyles(() => ({
  subtitle: {
    marginTop: 2,
    marginBottom: spacing.lg,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 2,
    marginBottom: spacing.lg,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: colors.teal,
  },
  segmentText: {
    fontFamily: fonts.bodyMedium,
  },
  segmentTextActive: {
    color: colors.white,
  },
}));
