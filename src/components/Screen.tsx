import React from 'react';
import { ScrollView, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { colors, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
  // For screens that restore a list's scroll position after a detail page.
  scrollRef?: React.Ref<ScrollView>;
  onScroll?: (y: number) => void;
}

// Every screen goes through here, so keyboard handling lives in one place.
// KeyboardAwareScrollView (react-native-keyboard-controller) reserves space for
// the keyboard and scrolls whichever <TextInput> is focused to stay above it —
// on iOS and on Android, including edge-to-edge.
export function Screen({ children, scroll = true, style, scrollRef, onScroll }: ScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {scroll ? (
        <KeyboardAwareScrollView
          ref={scrollRef as never}
          style={styles.flex}
          contentContainerStyle={[styles.content, style]}
          bottomOffset={90}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScroll={onScroll ? (e) => onScroll(e.nativeEvent.contentOffset.y) : undefined}
          scrollEventThrottle={onScroll ? 32 : undefined}
        >
          {children}
        </KeyboardAwareScrollView>
      ) : (
        <View style={[styles.content, styles.flex, style]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  safeArea: {
    flex: 1,
    backgroundColor: colors.stone,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl * 2,
  },
}));
