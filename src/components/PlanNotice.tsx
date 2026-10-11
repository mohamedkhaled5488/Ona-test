// The only trial/plan notices Ona shows: three days before a trial ends, on
// its last day, and once after it (or a subscription) has ended. Each shows
// once and closes for good.
import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Body, Caption } from './Typography';
import { colors, radii, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';
import { useEntitlement } from '../hooks/useEntitlement';
import { useAccountStore } from '../store/useAccountStore';
import { usePaywallStore } from '../store/usePaywallStore';
import { dueNotice } from '../billing/paywall';

export function PlanNotice() {
  const entitlement = useEntitlement();
  const dismissed = useAccountStore((s) => s.dismissedNotices);
  const dismiss = useAccountStore((s) => s.dismissNotice);
  const openPaywall = usePaywallStore((s) => s.open);
  const notice = dueNotice(entitlement, dismissed);
  if (!notice) return null;
  return (
    <View style={styles.card} accessibilityRole="summary">
      <View style={styles.text}>
        <Body>{notice.title}</Body>
        <Caption>{notice.body}</Caption>
        <Pressable onPress={() => openPaywall('userOpened')} hitSlop={8} accessibilityRole="button">
          <Caption style={styles.link}>See plans</Caption>
        </Pressable>
      </View>
      <Pressable onPress={() => dismiss(notice.key)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss">
        <Ionicons name="close" size={18} color={colors.inkSoft} />
      </Pressable>
    </View>
  );
}

const styles = themedStyles(() => ({
  card: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
  },
  text: { flex: 1, gap: 4 },
  link: { color: colors.teal, marginTop: 2 },
}));
