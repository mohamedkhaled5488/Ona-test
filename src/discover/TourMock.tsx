// Simple brand-style mock screens for the tour: stone card, teal accents,
// plain shapes. No photos, no logos. Purely decorative, so hidden from
// screen readers (the slide's words say it all).
import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Caption } from '../components/Typography';
import { OnaMark } from '../components/OnaMark';
import { feelingZones } from '../data/feelingsWheel';
import { withAlpha } from '../utils/color';
import { colors, fonts, radii, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';
import type { MockKind } from './content';

const Line = ({ w, strong }: { w: number | `${number}%`; strong?: boolean }) => <View style={[styles.line, { width: w }, strong && styles.lineStrong]} />;

function Row({ done, w = '70%' }: { done?: boolean; w?: `${number}%` }) {
  return (
    <View style={styles.row}>
      <View style={[styles.check, done && styles.checkDone]}>{done && <Ionicons name="checkmark" size={10} color={colors.white} />}</View>
      <Line w={w} />
    </View>
  );
}

function Bars({ values, color = colors.teal }: { values: number[]; color?: string }) {
  return (
    <View style={styles.bars}>
      {values.map((v, i) => (
        <View key={i} style={[styles.bar, { height: `${v}%`, backgroundColor: i === values.length - 1 ? color : withAlpha(color, 0.45) }]} />
      ))}
    </View>
  );
}

function Grid({ pattern }: { pattern: string }) {
  // d = done, m = missed (soft), s = slip (soft), - = nothing
  return (
    <View style={styles.grid}>
      {pattern.split('').map((c, i) => (
        <View
          key={i}
          style={[styles.cell, c === 'd' && { backgroundColor: colors.teal }, (c === 'm' || c === 's') && { backgroundColor: '#A39E94' }, c === 'h' && { backgroundColor: withAlpha(colors.teal, 0.45) }]}
        />
      ))}
    </View>
  );
}

function Body({ kind }: { kind: MockKind }) {
  switch (kind) {
    case 'welcome':
    case 'finish':
      return (
        <View style={styles.center}>
          <OnaMark size={56} />
          <View style={styles.dotsRow}>
            {feelingZones.map((z) => (
              <View key={z.id} style={[styles.zoneDot, { backgroundColor: z.accent }]} />
            ))}
          </View>
        </View>
      );
    case 'map':
      return (
        <View style={styles.center}>
          <View style={[styles.node, styles.nodeMain]}>
            <Caption style={styles.nodeText}>Why</Caption>
          </View>
          <View style={styles.mapRow}>
            {['Step', 'Step', 'Backup'].map((l, i) => (
              <View key={i} style={[styles.node, i === 2 && styles.nodeAlt]}>
                <Caption style={styles.nodeTextSoft}>{l}</Caption>
              </View>
            ))}
          </View>
        </View>
      );
    case 'list':
      return (
        <View style={styles.stack}>
          <Line w="45%" strong />
          <Row done />
          <Row done w="55%" />
          <Row w="65%" />
          <Row w="40%" />
        </View>
      );
    case 'task':
      return (
        <View style={styles.stack}>
          <Line w="60%" strong />
          <View style={styles.chipRow}>
            {['Work', 'High', '30 min', '9:00'].map((c) => (
              <View key={c} style={styles.chip}>
                <Caption style={styles.chipText}>{c}</Caption>
              </View>
            ))}
          </View>
          <Row done w="50%" />
          <Row w="60%" />
        </View>
      );
    case 'meals':
      return (
        <View style={styles.stack}>
          {['Breakfast', 'Lunch', 'Dinner'].map((m) => (
            <View key={m} style={styles.mealRow}>
              <Caption style={styles.mealText}>{m}</Caption>
              <Line w="35%" />
            </View>
          ))}
        </View>
      );
    case 'budget':
      return (
        <View style={styles.stack}>
          <Line w="40%" strong />
          <View style={styles.track}>
            <View style={[styles.fill, { width: '62%' }]} />
          </View>
          <Line w="70%" />
          <Line w="55%" />
        </View>
      );
    case 'journal':
      return (
        <View style={styles.stack}>
          <View style={[styles.zoneDot, { backgroundColor: feelingZones[1].accent, alignSelf: 'flex-start' }]} />
          <Line w="85%" />
          <Line w="90%" />
          <Line w="70%" />
          <Line w="80%" />
        </View>
      );
    case 'zones':
      return (
        <View style={styles.chipRowCenter}>
          {feelingZones.map((z) => (
            <View key={z.id} style={[styles.zoneChip, { borderColor: z.accent }]}>
              <View style={[styles.smallDot, { backgroundColor: z.accent }]} />
              <Caption style={styles.chipText}>{z.label}</Caption>
            </View>
          ))}
        </View>
      );
    case 'chart':
      return <Bars values={[35, 55, 45, 70, 60, 80, 75]} />;
    case 'sleep':
      return (
        <View style={styles.center}>
          <Ionicons name="moon-outline" size={40} color={colors.teal} />
          <View style={styles.dotsRow}>
            {[70, 40, 55].map((v, i) => (
              <View key={i} style={styles.slider}>
                <View style={[styles.sliderFill, { width: `${v}%` }]} />
              </View>
            ))}
          </View>
        </View>
      );
    case 'pattern':
      return <Grid pattern="ddmdddhddddmdddddhdddd-------" />;
    case 'milestone':
      return (
        <View style={styles.stack}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: '45%' }]} />
            {[0, 25, 50, 100].map((p) => (
              <View key={p} style={[styles.marker, { left: `${p}%` }, p <= 45 && styles.markerDone]} />
            ))}
          </View>
          <Caption style={styles.mealText}>5 days to 2 weeks</Caption>
        </View>
      );
    case 'quit':
      return (
        <View style={styles.center}>
          <View style={styles.ring}>
            <Caption style={styles.ringText}>12:00</Caption>
          </View>
          <Caption style={styles.mealText}>Ride it out</Caption>
        </View>
      );
    case 'skill':
      return (
        <View style={styles.stack}>
          <Line w="45%" strong />
          <View style={styles.dotsRow}>
            {[1, 2, 3, 4, 5].map((l) => (
              <View key={l} style={[styles.levelDot, l <= 3 && { backgroundColor: colors.teal }]} />
            ))}
          </View>
          <View style={styles.compare}>
            <View style={styles.photo} />
            <Ionicons name="arrow-forward" size={16} color={colors.inkSoft} />
            <View style={[styles.photo, { backgroundColor: withAlpha(colors.teal, 0.25) }]} />
          </View>
        </View>
      );
    case 'book':
      return (
        <View style={styles.stack}>
          <Line w="55%" strong />
          <View style={styles.track}>
            <View style={[styles.fill, { width: '38%' }]} />
          </View>
          <Caption style={styles.mealText}>"A quote you saved"</Caption>
        </View>
      );
    case 'timer':
      return (
        <View style={styles.center}>
          <View style={styles.ring}>
            <Caption style={styles.ringText}>25:00</Caption>
          </View>
        </View>
      );
    case 'recap':
      return (
        <View style={styles.stack}>
          <Line w="35%" strong />
          <Bars values={[30, 50, 40, 65, 55, 70, 85]} />
        </View>
      );
    case 'data':
      return (
        <View style={styles.center}>
          <View style={styles.mapRow}>
            <Ionicons name="phone-portrait-outline" size={36} color={colors.teal} />
            <Ionicons name="sync-outline" size={22} color={colors.inkSoft} />
            <Ionicons name="phone-portrait-outline" size={36} color={withAlpha(colors.teal, 0.5)} />
          </View>
        </View>
      );
  }
}

// `compact`: a short screen (landscape), so the words still fit beside it.
export function TourMock({ kind, accent, compact }: { kind: MockKind; accent?: string; compact?: boolean }) {
  return (
    <View style={[styles.frame, accent ? { borderTopColor: accent } : null, compact && styles.compact]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Body kind={kind} />
    </View>
  );
}

const styles = themedStyles(() => ({
  frame: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    borderTopWidth: 4,
    borderTopColor: colors.teal,
    padding: spacing.lg,
    height: 190,
    justifyContent: 'center',
  },
  compact: { height: 110, paddingVertical: spacing.sm, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  stack: { gap: spacing.sm },
  line: { height: 8, borderRadius: 4, backgroundColor: colors.line },
  lineStrong: { height: 12, backgroundColor: withAlpha(colors.teal, 0.55) },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  check: { width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, borderColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
  checkDone: { backgroundColor: colors.teal },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 110 },
  bar: { flex: 1, borderRadius: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center' },
  cell: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: colors.line },
  dotsRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  zoneDot: { width: 14, height: 14, borderRadius: 7 },
  smallDot: { width: 8, height: 8, borderRadius: 4 },
  node: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.md, borderWidth: 1, borderColor: colors.teal, backgroundColor: withAlpha(colors.teal, 0.08) },
  nodeMain: { backgroundColor: colors.teal },
  nodeAlt: { borderStyle: 'dashed' },
  nodeText: { color: colors.white, fontFamily: fonts.bodyMedium },
  nodeTextSoft: { color: colors.ink },
  mapRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chipRowCenter: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  chip: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radii.full, backgroundColor: withAlpha(colors.teal, 0.12) },
  chipText: { color: colors.ink, fontSize: 12 },
  zoneChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.full, borderWidth: 1.5 },
  mealRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mealText: { color: colors.inkSoft },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.line, justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 5, backgroundColor: colors.teal },
  marker: { position: 'absolute', width: 14, height: 14, marginLeft: -7, borderRadius: 7, borderWidth: 2, borderColor: colors.line, backgroundColor: colors.surface },
  markerDone: { backgroundColor: colors.teal, borderColor: colors.teal },
  ring: { width: 96, height: 96, borderRadius: 48, borderWidth: 6, borderColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
  ringText: { fontFamily: fonts.headingMedium, fontSize: 18, color: colors.ink },
  slider: { width: 60, height: 6, borderRadius: 3, backgroundColor: colors.line },
  sliderFill: { height: 6, borderRadius: 3, backgroundColor: colors.teal },
  levelDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: colors.teal },
  compare: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  photo: { width: 64, height: 48, borderRadius: radii.sm, backgroundColor: colors.line },
}));
