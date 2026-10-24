// How a Plus feature looks on Free: what it is (title and one line) and a
// way to see the plans. Never a blurred copy of the person's data, never a
// countdown, and nothing they made is hidden behind it.
import React from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Card } from './Card';
import { Body, Caption } from './Typography';
import { useUi } from './UiProvider';
import { usePaywallStore } from '../store/usePaywallStore';
import { usePlus, canCreate, canPlanMealOn, usedNow, type CountCap } from '../plans/access';
import { CAP_LABELS, ESSENTIALS_NAME, FREE_CAPS, PLUS_FEATURES, PLUS_NAME, type PlusFeatureId } from '../config/plans';
import { colors, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';

export function PlusLockCard({ feature }: { feature: PlusFeatureId }) {
  const open = usePaywallStore((s) => s.open);
  const f = PLUS_FEATURES[feature];
  return (
    <Card style={styles.card} testID={`plus-lock-${feature}`}>
      <View style={styles.row}>
        <Ionicons name="sparkles-outline" size={16} color={colors.inkSoft} />
        <Body style={styles.title}>{f.title}</Body>
        <Caption style={styles.badge}>{PLUS_NAME}</Caption>
      </View>
      <Caption style={styles.line}>{f.line}</Caption>
      <Pressable onPress={() => open('userOpened')} accessibilityRole="button" hitSlop={8}>
        <Caption style={styles.link}>See {PLUS_NAME}</Caption>
      </Pressable>
    </Card>
  );
}

// Shows `children` with Plus (or in the trial, or the demo); otherwise the
// lock card in their place.
export function PlusGate({ feature, children }: { feature: PlusFeatureId; children: React.ReactNode }) {
  return usePlus() ? <>{children}</> : <PlusLockCard feature={feature} />;
}

export const capMessage = (cap: CountCap) => {
  const label = CAP_LABELS[cap].toLowerCase();
  return {
    title: `${ESSENTIALS_NAME} includes ${FREE_CAPS[cap]} ${label}`,
    message: `You have ${usedNow(cap)}. Everything you have stays and keeps working. To add another, archive one to make room, or see ${PLUS_NAME} for no limit.`,
  };
};

// Before creating something with a cap: go ahead, or explain once, calmly.
export function useCapGuard() {
  const plus = usePlus();
  const { showDialog } = useUi();
  const open = usePaywallStore((s) => s.open);
  return (cap: CountCap, onAllowed: () => void) => {
    if (canCreate(cap, plus)) return onAllowed();
    const { title, message } = capMessage(cap);
    showDialog({
      title,
      message,
      actions: [
        { label: 'Not now', style: 'cancel' },
        { label: `See ${PLUS_NAME}`, style: 'default', onPress: () => void open('userOpened') },
      ],
    });
  };
}

// For a control (a chip, a toggle) that is Plus: say what it is, calmly.
export function useExplainPlus() {
  const { showDialog } = useUi();
  const open = usePaywallStore((s) => s.open);
  return (feature: PlusFeatureId) => {
    const f = PLUS_FEATURES[feature];
    showDialog({
      title: f.title,
      message: f.line,
      actions: [
        { label: 'Not now', style: 'cancel' },
        { label: `See ${PLUS_NAME}`, style: 'default', onPress: () => void open('userOpened') },
      ],
    });
  };
}

// For an action that is Plus (a PDF export): run it, or say what it is.
export function usePlusAction() {
  const plus = usePlus();
  const explain = useExplainPlus();
  return (feature: PlusFeatureId, action: () => void | Promise<void>) => () => {
    if (plus) return void action();
    explain(feature);
  };
}

// Diet on Free: meals can be planned up to the end of next week. Past and
// current weeks stay fully editable; this only stops planning further ahead.
export function useMealDateGuard() {
  const plus = usePlus();
  const { showDialog } = useUi();
  const open = usePaywallStore((s) => s.open);
  return (date: string, onAllowed: () => void) => {
    if (canPlanMealOn(date, plus)) return onAllowed();
    showDialog({
      title: `${ESSENTIALS_NAME} plans up to next week`,
      message: `You can plan meals up to the end of next week, and every past week stays as it is. To plan further ahead, see ${PLUS_NAME}.`,
      actions: [
        { label: 'Not now', style: 'cancel' },
        { label: `See ${PLUS_NAME}`, style: 'default', onPress: () => void open('userOpened') },
      ],
    });
  };
}

const styles = themedStyles(() => ({
  card: { marginBottom: spacing.md, gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  title: { flex: 1 },
  badge: { color: colors.inkSoft },
  line: { color: colors.inkSoft },
  link: { color: colors.teal, marginTop: spacing.xs },
}));
