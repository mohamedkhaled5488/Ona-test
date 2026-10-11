// A row with quick actions behind it: swipe right for the main action (done),
// swipe left for the rest. The actions are buttons, not "swipe all the way to
// trigger", so nothing happens by accident; every one of them is also on the
// row itself or the task page for people who don't swipe.
import React, { useRef } from 'react';
import { Pressable, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Ionicons } from '@expo/vector-icons';
import { Caption } from './Typography';
import { colors, fonts, radii, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';

export interface SwipeAction {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
}

function Actions({ actions, close, side }: { actions: SwipeAction[]; close: () => void; side: 'left' | 'right' }) {
  return (
    // Hidden from screen readers: the same actions are offered on the task's
    // checkbox (accessibilityActions), so they aren't read out for every row.
    <View style={[styles.actions, side === 'left' ? styles.left : styles.right]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {actions.map((a) => (
        <Pressable
          key={a.key}
          onPress={() => {
            close();
            a.onPress();
          }}
          accessibilityRole="button"
          accessibilityLabel={a.label}
          style={[styles.action, { backgroundColor: a.color }]}
        >
          <Ionicons name={a.icon} size={20} color={colors.white} />
          <Caption style={styles.label} numberOfLines={1}>
            {a.label}
          </Caption>
        </Pressable>
      ))}
    </View>
  );
}

export function SwipeRow({ left = [], right = [], children, enabled = true }: { left?: SwipeAction[]; right?: SwipeAction[]; children: React.ReactNode; enabled?: boolean }) {
  const ref = useRef<SwipeableMethods>(null);
  const close = () => ref.current?.close();
  return (
    <ReanimatedSwipeable
      ref={ref}
      enabled={enabled}
      friction={1.6}
      leftThreshold={48}
      rightThreshold={48}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={left.length ? () => <Actions actions={left} close={close} side="left" /> : undefined}
      renderRightActions={right.length ? () => <Actions actions={right} close={close} side="right" /> : undefined}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

const styles = themedStyles(() => ({
  actions: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.xs, paddingVertical: 2 },
  left: { paddingRight: spacing.sm },
  right: { paddingLeft: spacing.sm },
  action: { width: 76, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 4 },
  label: { color: colors.white, fontFamily: fonts.bodyMedium, fontSize: 12 },
}));
