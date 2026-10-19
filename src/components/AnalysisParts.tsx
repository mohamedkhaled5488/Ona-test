import React from 'react';
import { View } from 'react-native';
import { Card } from './Card';
import { ScreenTitle, Eyebrow, Caption } from './Typography';
import { colors, fonts, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';

// Shared building blocks for the per-habit Analysis dashboards, so the Build
// and Quit dashboards follow one skeleton (stats, summary, chart, insights,
// log) and read like the Identify the Feeling Analysis page.

export interface Stat {
  value: string;
  label: string;
}

// The glance-first row: a few big numbers, two per row on a phone.
export function StatRow({ stats, accent }: { stats: Stat[]; accent: string }) {
  return (
    <View style={styles.statGrid}>
      {stats.map((s) => (
        <Card key={s.label} style={styles.statCard}>
          <ScreenTitle style={[styles.statValue, { color: accent }]}>{s.value}</ScreenTitle>
          <Caption style={styles.statLabel}>{s.label}</Caption>
        </Card>
      ))}
    </View>
  );
}

// A bold insight card — same visual weight as Feelings Analysis's "Biggest
// impact" cards. The headline can be confident, but its wording stays
// correlational; `evidence` carries the concrete counts behind it.
export function InsightCard({
  kind,
  headline,
  evidence,
  accent,
  prominent = false,
}: {
  kind: string;
  headline: string;
  evidence?: string;
  accent: string;
  prominent?: boolean;
}) {
  return (
    <Card style={[styles.insightCard, { borderLeftColor: accent }, prominent && styles.insightCardProminent]}>
      <Eyebrow style={{ color: accent }}>{kind}</Eyebrow>
      <ScreenTitle style={prominent ? styles.insightHeadlineProminent : styles.insightHeadline}>{headline}</ScreenTitle>
      {evidence && <Caption style={styles.insightEvidence}>{evidence}</Caption>}
    </Card>
  );
}

export function DashboardSectionLabel({ children }: { children: string }) {
  return <Eyebrow style={styles.sectionLabel}>{children}</Eyebrow>;
}

const styles = themedStyles(() => ({
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  // The number and its label sit in the middle of the tile.
  statCard: {
    flexBasis: '47%',
    flexGrow: 1,
    gap: 2,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontFamily: fonts.headingSemiBold,
    fontSize: 30,
    textAlign: 'center',
  },
  statLabel: {
    color: colors.inkSoft,
    textAlign: 'center',
  },
  insightCard: {
    borderLeftWidth: 4,
    gap: spacing.xs,
    marginBottom: spacing.sm,
    paddingVertical: spacing.md,
  },
  insightCardProminent: {
    paddingVertical: spacing.lg,
  },
  insightHeadline: {
    fontSize: 17,
  },
  insightHeadlineProminent: {
    fontSize: 21,
  },
  insightEvidence: {
    color: colors.inkSoft,
  },
  sectionLabel: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
}));
