// The slim "Demo mode" bar at the top of every screen while the demo is on.
// It sits above the app (never over it): the screens below get a top safe
// area of 0, so headers don't add the status-bar space twice.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useDataSpace } from '../hooks/useDataSpace';
import { useDemoActions } from './useDemoActions';
import { fonts } from '../theme';
import { DemoTour } from './DemoTour';

// Fixed colors on purpose: the bar must look the same in every theme and be
// clearly different from anything else in the app (and from Expo's dev menu).
const BAR = '#2E2A23';
const TEXT = '#F4EBDD';
const BUTTON = '#E8B23D';

export function DemoBanner() {
  const insets = useSafeAreaInsets();
  const { confirmExit } = useDemoActions();
  return (
    <View style={{ backgroundColor: BAR, paddingTop: insets.top, paddingLeft: insets.left + 12, paddingRight: insets.right + 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 40, gap: 8 }}>
        <Ionicons name="sparkles-outline" size={16} color={BUTTON} accessibilityElementsHidden importantForAccessibility="no" />
        <Text
          style={{ flex: 1, color: TEXT, fontFamily: fonts.bodyMedium, fontSize: 13 }}
          accessibilityRole="header"
          accessibilityLabel="Demo mode. You are looking at sample data. Your own data is untouched."
          numberOfLines={1}
        >
          Demo mode, sample data
        </Text>
        <Pressable
          onPress={confirmExit}
          accessibilityRole="button"
          accessibilityLabel="Exit demo"
          accessibilityHint="Goes back to your own Ona"
          hitSlop={8}
          style={({ pressed }) => ({ backgroundColor: BUTTON, borderRadius: 999, paddingHorizontal: 12, minHeight: 30, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
        >
          <Text style={{ color: BAR, fontFamily: fonts.bodyMedium, fontSize: 13 }}>Exit demo</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Wraps the app: in demo, the bar on top and the app below it with no top
// inset (the bar already covers the status bar area).
export function DemoFrame({ children }: { children: React.ReactNode }) {
  const space = useDataSpace();
  const insets = useSafeAreaInsets();
  if (space !== 'demo') return <>{children}</>;
  return (
    <View style={{ flex: 1 }}>
      <DemoBanner />
      <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0 }}>
        <View style={{ flex: 1 }}>{children}</View>
        <DemoTour />
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}
