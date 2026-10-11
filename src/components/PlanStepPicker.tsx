import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SheetModal } from './SheetModal';
import { SectionHeading, Eyebrow, Body } from './Typography';
import { usePlanStore, flattenSteps } from '../store/usePlanStore';
import { colors, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';

// Picks a Plan Builder step to live-link to a Daily Planning task.
export function PlanStepPicker({
  visible,
  onClose,
  onPick,
  title = 'Pull from Plan Builder',
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (planId: string, path: string[]) => void;
  title?: string;
}) {
  const allPlans = usePlanStore((s) => s.plans);
  const plans = allPlans.filter((p) => p.status === 'active');

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <View style={styles.header}>
        <SectionHeading>{title}</SectionHeading>
        <Pressable hitSlop={8} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={22} color={colors.inkSoft} />
        </Pressable>
      </View>
      {plans.length === 0 && <Body style={styles.empty}>No active plans yet.</Body>}
      {plans.map((plan) => {
        const flat = flattenSteps(plan.steps);
        return (
          <View key={plan.id} style={styles.group}>
            <Eyebrow style={{ color: plan.color }}>{plan.title}</Eyebrow>
            {flat.map(({ path, depth, step }) => (
              <Pressable
                key={path.join('/')}
                onPress={() => {
                  onPick(plan.id, path);
                  onClose();
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.row, { marginLeft: depth * spacing.md }, pressed && { opacity: 0.85 }]}
              >
                <Ionicons name={step.done ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={step.done ? colors.teal : colors.inkSoft} />
                <Body style={styles.rowText}>{step.title}</Body>
              </Pressable>
            ))}
          </View>
        );
      })}
    </SheetModal>
  );
}

const styles = themedStyles(() => ({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  empty: { color: colors.inkSoft },
  group: { marginBottom: spacing.sm, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, minHeight: 44 },
  rowText: { flex: 1 },
}));
