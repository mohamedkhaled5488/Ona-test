import React, { useMemo, useRef, useState } from 'react';
import { Image, PanResponder, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../components/Card';
import { ScreenTitle, SectionHeading, Body, Caption } from '../components/Typography';
import { DashboardSectionLabel } from '../components/AnalysisParts';
import { colors, fonts, radii, spacing } from '../theme';
import { withAlpha } from '../utils/color';
import { formatDisplayDate } from '../utils/date';
import { useSkillsStore } from '../store/useSkillsStore';
import { buildJourney, type JourneyEvent, type JourneyEventKind } from '../utils/skillProgress';
import { themedStyles } from '../theme/runtime';

const KIND_META: Record<JourneyEventKind, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  start: { label: 'Start', icon: 'flag-outline' },
  milestone: { label: 'Milestones', icon: 'trophy-outline' },
  level: { label: 'Level changes', icon: 'trending-up-outline' },
  breakthrough: { label: 'Breakthroughs', icon: 'sparkles-outline' },
  plateau: { label: 'Steady stretches', icon: 'remove-outline' },
  feedback: { label: 'Feedback', icon: 'chatbubble-ellipses-outline' },
  resource: { label: 'Resources', icon: 'book-outline' },
  photo: { label: 'Photos', icon: 'image-outline' },
  next: { label: 'Next', icon: 'ellipse-outline' },
};
const FILTERABLE: JourneyEventKind[] = ['milestone', 'level', 'breakthrough', 'plateau', 'feedback', 'resource', 'photo'];

// A photo whose file is gone (deleted from the phone, or not restored) shows
// a quiet placeholder instead of an empty box.
function Photo({ uri, style }: { uri: string; style: any }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <View style={[style, styles.missing]} accessibilityLabel="Photo not available">
        <Ionicons name="image-outline" size={20} color={colors.inkSoft} />
        <Caption style={styles.muted}>Photo not available</Caption>
      </View>
    );
  }
  return <Image source={{ uri }} style={style} resizeMode="cover" onError={() => setFailed(true)} />;
}

interface Frame {
  id: string;
  date: string;
  uri: string;
  label: string;
}

// A plain draggable slider (no extra dependency): drag or tap anywhere on the
// track to move through the photo frames.
function Scrubber({ count, index, onChange, color }: { count: number; index: number; onChange: (i: number) => void; color: string }) {
  const width = useRef(1);
  const pick = (x: number) => onChange(Math.max(0, Math.min(count - 1, Math.round((x / width.current) * (count - 1)))));
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => pick(e.nativeEvent.locationX),
        onPanResponderMove: (e) => pick(e.nativeEvent.locationX),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [count]
  );
  const pct = count > 1 ? (index / (count - 1)) * 100 : 0;
  return (
    <View
      style={styles.scrubber}
      onLayout={(e) => (width.current = Math.max(1, e.nativeEvent.layout.width))}
      accessibilityRole="adjustable"
      accessibilityLabel="Move through progress photos"
      accessibilityValue={{ min: 1, max: count, now: index + 1, text: `Photo ${index + 1} of ${count}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onChange(Math.max(0, Math.min(count - 1, index + (e.nativeEvent.actionName === 'increment' ? 1 : -1))))}
      {...responder.panHandlers}
    >
      <View style={styles.scrubberTrack} pointerEvents="none" />
      <View style={[styles.scrubberFill, { width: `${pct}%`, backgroundColor: color }]} pointerEvents="none" />
      <View style={[styles.scrubberThumb, { left: `${pct}%`, borderColor: color }]} pointerEvents="none" />
    </View>
  );
}

function FramePicker({ frames, selected, onSelect, color }: { frames: Frame[]; selected: string; onSelect: (id: string) => void; color: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.frameRow}>
      {frames.map((f) => (
        <Pressable key={f.id} onPress={() => onSelect(f.id)} accessibilityRole="button" accessibilityState={{ selected: selected === f.id }} accessibilityLabel={`Photo from ${formatDisplayDate(f.date)}`}>
          <Image source={{ uri: f.uri }} style={[styles.frameThumb, selected === f.id && { borderColor: color, borderWidth: 3 }]} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

// The learning story, oldest first: start, milestones, level changes,
// breakthroughs, steady stretches, feedback, finished resources and photos,
// ending with the next milestone as a faded "not yet" node.
export function SkillJourneyStage({
  skillId,
  onBack,
  onOpenSession,
  onOpenMilestone,
}: {
  skillId: string;
  onBack: () => void;
  onOpenSession: (sessionId: string) => void;
  onOpenMilestone: (milestoneId: string) => void;
}) {
  const skills = useSkillsStore((s) => s.skills);
  const sessions = useSkillsStore((s) => s.sessions);
  const [hidden, setHidden] = useState<Set<JourneyEventKind>>(new Set());
  const [thenId, setThenId] = useState<string | null>(null);
  const [nowId, setNowId] = useState<string | null>(null);
  const [scrub, setScrub] = useState(0);

  const skill = skills.find((s) => s.id === skillId);
  if (!skill) {
    return (
      <>
        <Pressable onPress={onBack} style={styles.backLink} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
          <Caption> Back</Caption>
        </Pressable>
        <Body>This skill isn't in your list anymore.</Body>
      </>
    );
  }

  const color = skill.color;
  const events = buildJourney(skill, sessions);
  const present = FILTERABLE.filter((k) => events.some((e) => e.kind === k));
  const visible = events.filter((e) => !hidden.has(e.kind));
  const toggle = (k: JourneyEventKind) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  // Every photo along the way — session photos and milestone proof photos.
  const frames: Frame[] = [
    ...sessions.filter((s) => s.skillId === skillId && s.photoUri).map((s) => ({ id: `s-${s.id}`, date: s.date, uri: s.photoUri!, label: 'Session' })),
    ...skill.milestones.filter((m) => m.proofPhotoUri && m.achievedAt).map((m) => ({ id: `m-${m.id}`, date: m.achievedAt!, uri: m.proofPhotoUri!, label: m.text })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const pickedThen = frames.find((f) => f.id === thenId) ?? frames[0];
  const pickedNow = frames.find((f) => f.id === nowId) ?? frames[frames.length - 1];
  // "Then" is always the earlier of the two, whichever order they were picked in.
  const [thenFrame, nowFrame] = pickedThen && pickedNow && pickedNow.date < pickedThen.date ? [pickedNow, pickedThen] : [pickedThen, pickedNow];
  const scrubFrame = frames[Math.min(scrub, frames.length - 1)];

  const open = (e: JourneyEvent) => {
    if (e.sessionId) onOpenSession(e.sessionId);
    else if (e.milestoneId && e.kind === 'milestone') onOpenMilestone(e.milestoneId);
  };

  return (
    <>
      <Pressable onPress={onBack} style={styles.backLink} accessibilityRole="button" accessibilityLabel={`Back to ${skill.name}`}>
        <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
        <Caption> {skill.name}</Caption>
      </Pressable>
      <ScreenTitle>Journey</ScreenTitle>
      <Caption style={styles.subtitle}>The whole path so far — tap a moment to open it.</Caption>

      {present.length > 0 && (
        <View style={styles.chipRow}>
          {present.map((k) => (
            <Pressable key={k} onPress={() => toggle(k)} accessibilityRole="checkbox" accessibilityState={{ checked: !hidden.has(k) }} accessibilityLabel={`Show ${KIND_META[k].label}`} style={[styles.chip, !hidden.has(k) && { backgroundColor: withAlpha(color, 0.2), borderColor: color }]}>
              <Ionicons name={KIND_META[k].icon} size={12} color={hidden.has(k) ? colors.inkSoft : color} />
              <Caption style={hidden.has(k) ? styles.muted : undefined}> {KIND_META[k].label}</Caption>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.timeline}>
        {visible.map((e, i) => {
          const isNext = e.kind === 'next';
          const isPlateau = e.kind === 'plateau';
          const tappable = !!e.sessionId || (e.kind === 'milestone' && !!e.milestoneId);
          return (
            <View key={e.id} style={styles.eventRow}>
              <View style={styles.rail}>
                <View style={[styles.railLine, i === 0 && styles.railLineFirst, i === visible.length - 1 && styles.railLineLast]} />
                <View style={[styles.node, { borderColor: isNext ? colors.line : color }, !isNext && e.kind !== 'plateau' && { backgroundColor: color }]}>
                  <Ionicons name={KIND_META[e.kind].icon} size={11} color={isNext ? colors.inkSoft : e.kind === 'plateau' ? color : colors.white} />
                </View>
              </View>
              <Pressable disabled={!tappable} onPress={() => open(e)} style={styles.flex}>
                <Card style={[styles.eventCard, isNext && styles.nextCard, isPlateau && { backgroundColor: withAlpha(color, 0.1) }]}>
                  <Caption style={styles.muted}>
                    {isNext ? 'Not yet' : e.endDate ? `${formatDisplayDate(e.date)} – ${formatDisplayDate(e.endDate)}` : formatDisplayDate(e.date)}
                  </Caption>
                  <Body style={isNext ? styles.muted : styles.eventTitle}>{e.title}</Body>
                  {e.detail && <Caption numberOfLines={3} style={styles.muted}>{e.detail}</Caption>}
                  {!!e.photoUri && <Photo uri={e.photoUri} style={styles.eventPhoto} />}
                </Card>
              </Pressable>
            </View>
          );
        })}
      </View>

      {frames.length >= 2 && (
        <>
          <DashboardSectionLabel>Then vs. now</DashboardSectionLabel>
          <Card style={styles.compareCard}>
            <View style={styles.compareRow}>
              {[thenFrame, nowFrame].map((f, i) => (
                <View key={i} style={styles.compareCol}>
                  <Caption style={{ color }}>{i === 0 ? 'Then' : 'Now'} — {formatDisplayDate(f.date)}</Caption>
                  <Photo key={f.id} uri={f.uri} style={styles.comparePhoto} />
                </View>
              ))}
            </View>
            <Caption style={styles.muted}>Then:</Caption>
            <FramePicker frames={frames} selected={thenFrame.id} onSelect={setThenId} color={color} />
            <Caption style={styles.muted}>Now:</Caption>
            <FramePicker frames={frames} selected={nowFrame.id} onSelect={setNowId} color={color} />
            {(thenId || nowId) && (
              <Pressable
                onPress={() => {
                  setThenId(null);
                  setNowId(null);
                }}
              >
                <Caption style={[styles.link, { color }]}>Back to first vs. latest</Caption>
              </Pressable>
            )}
          </Card>

          <DashboardSectionLabel>Progress over time</DashboardSectionLabel>
          <Card style={styles.compareCard}>
            <SectionHeading>{formatDisplayDate(scrubFrame.date)}</SectionHeading>
            <Photo key={scrubFrame.id} uri={scrubFrame.uri} style={styles.scrubPhoto} />
            <Scrubber count={frames.length} index={Math.min(scrub, frames.length - 1)} onChange={setScrub} color={color} />
            <Caption style={styles.muted}>
              Photo {Math.min(scrub, frames.length - 1) + 1} of {frames.length} · drag to move through time
            </Caption>
          </Card>
        </>
      )}
      {frames.length === 1 && (
        <Caption style={[styles.muted, styles.onePhoto]}>
          One progress photo so far. Add another in a later session to compare then and now.
        </Caption>
      )}
      <View style={styles.bottomSpace} />
    </>
  );
}

const styles = themedStyles(() => ({
  backLink: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  subtitle: { marginTop: 2, marginBottom: spacing.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  chip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: spacing.sm, borderRadius: radii.full, borderWidth: 1, borderColor: colors.line },
  muted: { color: colors.inkSoft },
  timeline: { marginBottom: spacing.md },
  eventRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'stretch' },
  rail: { width: 24, alignItems: 'center' },
  railLine: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.line },
  railLineFirst: { top: 18 },
  railLineLast: { bottom: '50%' },
  node: { marginTop: 14, width: 22, height: 22, borderRadius: radii.full, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.stone },
  flex: { flex: 1 },
  eventCard: { gap: 2, marginBottom: spacing.sm },
  nextCard: { opacity: 0.6, borderStyle: 'dashed', borderWidth: 1, borderColor: colors.line },
  eventTitle: { fontFamily: fonts.bodyMedium },
  eventPhoto: { width: '100%', height: 140, borderRadius: radii.md, marginTop: spacing.xs },
  compareCard: { gap: spacing.sm },
  compareRow: { flexDirection: 'row', gap: spacing.sm },
  compareCol: { flex: 1, gap: 4 },
  missing: { alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: colors.stone },
  onePhoto: { marginTop: spacing.md },
  comparePhoto: { width: '100%', height: 140, borderRadius: radii.md, backgroundColor: colors.stone },
  frameRow: { gap: spacing.xs },
  frameThumb: { width: 56, height: 56, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.line },
  link: { textDecorationLine: 'underline' },
  scrubPhoto: { width: '100%', height: 220, borderRadius: radii.md, backgroundColor: colors.stone },
  scrubber: { height: 32, justifyContent: 'center' },
  scrubberTrack: { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: radii.full, backgroundColor: colors.line },
  scrubberFill: { position: 'absolute', left: 0, height: 4, borderRadius: radii.full },
  scrubberThumb: { position: 'absolute', width: 20, height: 20, marginLeft: -10, borderRadius: radii.full, borderWidth: 3, backgroundColor: colors.surface },
  bottomSpace: { height: spacing.xl },
}));
