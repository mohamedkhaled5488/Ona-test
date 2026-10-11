// Recap's weekly review of Daily Planning: last week's wins, what slipped
// (gently), and one suggestion. Shown once per week until dismissed.
import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/Card';
import { Body, Caption, Eyebrow } from '../../components/Typography';
import { useDailyPlanningStore, resolveTaskDone, resolveTaskTitle } from '../../store/useDailyPlanningStore';
import { useFeelingsStore } from '../../store/useFeelingsStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { weeklyReview } from '../../utils/planningInsights';
import { todayISO } from '../../utils/date';
import { colors, fonts, spacing } from '../../theme';
import { themedStyles } from '../../theme/runtime';

export function WeeklyReviewCard({ onOpenInsights }: { onOpenInsights: () => void }) {
  const tasks = useDailyPlanningStore((s) => s.tasks);
  const tags = useDailyPlanningStore((s) => s.tags);
  const entries = useFeelingsStore((s) => s.entries);
  const weekStartsOn = useSettingsStore((s) => s.weekStartsOn);
  const available = useSettingsStore((s) => s.dailyAvailableMinutes);
  const dismissed = useSettingsStore((s) => s.weeklyReviewDismissed);
  const hidden = useSettingsStore((s) => s.hiddenRecapSections);
  const set = useSettingsStore((s) => s.set);
  const today = todayISO();
  const review = useMemo(
    () => weeklyReview(tasks, tags, today, weekStartsOn, (t, d) => resolveTaskDone(t, d), entries, available, resolveTaskTitle),
    [tasks, tags, today, weekStartsOn, entries, available]
  );
  if (!review || dismissed === review.weekStart || hidden.includes('dailyPlanning')) return null;

  return (
    <Card style={styles.card}>
      <View style={styles.top}>
        <Eyebrow accessibilityRole="header">Your week in planning</Eyebrow>
        <Pressable onPress={() => set('weeklyReviewDismissed', review.weekStart)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss the weekly review">
          <Ionicons name="close" size={18} color={colors.inkSoft} />
        </Pressable>
      </View>
      {review.wins.map((w) => (
        <Body key={w}>{w}</Body>
      ))}
      {review.slipped.map((s) => (
        <Caption key={s} style={styles.muted}>
          {s}
        </Caption>
      ))}
      <Body style={styles.suggestion}>{review.suggestion}</Body>
      <Pressable onPress={onOpenInsights} accessibilityRole="button" style={styles.link}>
        <Caption style={styles.linkText}>See Insights</Caption>
      </Pressable>
    </Card>
  );
}

const styles = themedStyles(() => ({
  card: { gap: spacing.xs, marginBottom: spacing.md },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  muted: { color: colors.inkSoft },
  suggestion: { fontFamily: fonts.bodyMedium, marginTop: spacing.xs },
  link: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' },
  linkText: { color: colors.teal, fontFamily: fonts.bodyMedium },
}));
