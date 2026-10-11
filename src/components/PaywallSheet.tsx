// The plans sheet, opened only when the user reaches for something paid (or
// asks for it). Always closable, no timers, no scarcity, no guilt — and
// nothing behind it is locked: local data and every section keep working.
import React from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, Caption, ScreenTitle } from './Typography';
import { colors, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';
import { usePaywallStore } from '../store/usePaywallStore';
import { Plans } from '../screens/settings/PlanPage';

export function PaywallSheet() {
  const visible = usePaywallStore((s) => s.visible);
  const close = usePaywallStore((s) => s.close);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => close()}>
      <SafeAreaView style={styles.root}>
        <View style={styles.top}>
          <Pressable onPress={() => close()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={styles.close}>
            <Ionicons name="close" size={26} color={colors.ink} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <ScreenTitle>Sync across your devices</ScreenTitle>
          <Body style={styles.lead}>Keep Ona the same on your phone and any other device, backed up to your account.</Body>
          <Caption style={styles.lead}>Everything else in Ona stays free and works on this phone, with or without a plan.</Caption>
          <Plans onPurchased={() => close()} inSheet />
          <Pressable onPress={() => close()} hitSlop={8} accessibilityRole="button" style={styles.notNow}>
            <Caption>Not now</Caption>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  root: { flex: 1, backgroundColor: colors.stone },
  top: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  close: { padding: spacing.xs },
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  lead: { marginBottom: spacing.xs },
  notNow: { alignSelf: 'center', paddingVertical: spacing.md },
}));
