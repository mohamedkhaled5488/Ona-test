import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, PanResponder, Pressable, View } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TextInput } from '../components/TextInput';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { SheetModal } from '../components/SheetModal';
import { BreathingExercise } from '../components/BreathingExercise';
import { FeelingPicker, isPersonalFeeling, type FeelingPickerStep, type PickedFeeling } from '../components/FeelingPicker';
import { MonthCalendar } from '../components/MonthCalendar';
import type { PositionedPoint } from '../components/FeelingsGraph';

// Lazy: @shopify/react-native-skia's web backend initializes itself the
// moment its module first evaluates, which on web has to happen strictly
// after App.tsx's LoadSkiaWeb() call resolves. A static top-level import
// here would pull Skia into the bundle's eager module-init order (before
// that has a chance to run) regardless of when FeelingsGraph itself first
// renders — React.lazy defers evaluating the module at all until first
// render, which is what actually fixes it. No effect on native, where Skia
// links natively and has no such ordering constraint.
const FeelingsGraph = React.lazy(() => import('../components/FeelingsGraph').then((m) => ({ default: m.FeelingsGraph })));
import { ScreenTitle, SectionHeading, Eyebrow, Body, Caption } from '../components/Typography';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, spacing, radii, fonts } from '../theme';
import { withAlpha } from '../utils/color';
import { useBackHandler } from '../hooks/useBackHandler';
import { useFeelingSourceLookup } from '../hooks/useFeelingSourceLookup';
import { describeFeelingSource } from '../utils/feelingSource';
import { useFeelingsStore, sortGuidanceByVotes, getGuidanceVote } from '../store/useFeelingsStore';
import {
  feelings,
  zoneMeta,
  feelingZones,
  feelingsInZone,
  siblingFeelings,
  suggestionsByZone,
  highArousalFeelingIds,
  reasonTagOptions,
} from '../data/feelingsWheel';
import {
  checkInStreak,
  hasSustainedSafeguardPattern,
  topRepeatedFeelings,
  zoneCounts,
  mostCommonZone,
  longestZoneStreak,
  compareZonePeriods,
  dailyTrendPoints,
  monthlyTrendPointsInRange,
  rollingAverageTrend,
  datesInRange,
  daysBetweenISO,
  patternsNaturalRange,
  domainIndexForDate,
  domainSlotCount,
  reasonBreakdownByFeeling,
  tagImpactRanking,
  describeTagImpact,
  tagZoneDistribution,
  tagFeelingBreakdown,
  tagPrimaryZone,
  tagTrend,
  tagCooccurrences,
  analysisMinCount,
  type TrendPoint,
  type TrendDimension,
  type FeelingReasonGroup,
  type PatternsView,
  type TagImpact,
} from '../utils/feelingsStats';
import { sectionsMeta } from '../data/sectionsMeta';
import { addDaysISO, addMonthsISO, todayISO, formatDisplayDate, formatMonthLabel } from '../utils/date';
import type { RootStackParamList } from '../navigation/types';
import type { FeelingZone, FeelingCheckIn } from '../types/sections';
import { themedStyles } from '../theme/runtime';
import { useSettingsStore } from '../store/useSettingsStore';
import { deleteFeelingEntry, logTaskFeeling } from '../utils/taskFeelings';
import { logItemFeeling, mirrorFeelingEdit } from '../utils/itemFeelings';
import { spaceKey } from '../utils/dataSpace';
import { useDailyPlanningStore } from '../store/useDailyPlanningStore';
import { basedOn, filterBySource, overviewInsight, sourceBreakdown, tagInsight, SOURCE_GROUP_LABEL, type SourceGroup } from '../utils/feelingsInsights';
import { CONFIDENCE_NOTE } from '../config/feelingsAnalysis';
import { useUi } from '../components/UiProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'moodCheck'>;

type ResultMode = { type: 'logged'; entryId: string } | { type: 'peek'; zone: FeelingZone; feelingIds: string[] };

type ScreenState =
  | { kind: 'zone' }
  | { kind: 'word'; zone: FeelingZone }
  | { kind: 'secondWord'; zone: FeelingZone; first: PickedFeeling }
  | { kind: 'intensity'; zone: FeelingZone; feelingIds: string[] }
  | { kind: 'reasons'; zone: FeelingZone; feelingIds: string[]; intensities?: Partial<Record<string, 1 | 2 | 3 | 4 | 5>> }
  | { kind: 'result'; mode: ResultMode }
  | { kind: 'trend' }
  | { kind: 'patterns' }
  | { kind: 'analysis' }
  | { kind: 'analysisTag'; tag: string; start: string; end: string }
  | { kind: 'reasonEntries'; feelingId: string; tag: string }
  | { kind: 'bookmarks' };

const intensityLabels: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'Barely there',
  2: 'Mild',
  3: 'Noticeable',
  4: 'Strong',
  5: 'Very strong',
};

function findAnyFeeling(id: string, personalFeelings: ReturnType<typeof useFeelingsStore.getState>['personalFeelings']) {
  return feelings.find((f) => f.id === id) ?? personalFeelings.find((p) => p.id === id);
}

function SupportResourcesCard({ emphasized }: { emphasized?: boolean }) {
  return (
    <Card style={[styles.resourceCard, emphasized && styles.resourceCardEmphasized]}>
      <Eyebrow>If things feel heavier than usual</Eyebrow>
      <Body>
        It can help to talk to someone you trust, or reach out to a support line in your area. You don't have to
        carry it alone — this is always here whenever you want it, not just when things look low.
      </Body>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The three partitions this section is actually built from — Check In,
// Patterns, Analysis — as a persistent, always-visible segmented control,
// not a small icon buried among others. Only shown at the root of each
// partition (stack length 1); a step into a sub-flow (picking a word,
// viewing a tag's detail) replaces it with the normal in-flow back button.
type Partition = 'zone' | 'patterns' | 'analysis';
const PARTITION_LABELS: Record<Partition, string> = { zone: 'Check In', patterns: 'Patterns', analysis: 'Analysis' };

function PartitionTabs({ active, onSelect }: { active: Partition; onSelect: (p: Partition) => void }) {
  return (
    <View style={styles.partitionTabs}>
      {(['zone', 'patterns', 'analysis'] as const).map((p) => (
        <Pressable key={p} onPress={() => onSelect(p)} style={[styles.partitionTab, active === p && styles.partitionTabActive]}>
          <Body style={active === p ? styles.partitionTabTextActive : styles.partitionTabText}>{PARTITION_LABELS[p]}</Body>
        </Pressable>
      ))}
    </View>
  );
}

function ZoneHeader({ onTrend, onBookmarks }: { onTrend: () => void; onBookmarks: () => void }) {
  const entries = useFeelingsStore((s) => s.entries);
  const bookmarks = useFeelingsStore((s) => s.bookmarks);
  const streak = checkInStreak(entries, todayISO());
  const lastEntry = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const showReengagement = lastEntry && lastEntry.date <= addDaysISO(todayISO(), -3);

  return (
    <>
      <View style={styles.headerRow}>
        <ScreenTitle>Identify the Feeling</ScreenTitle>
        <View style={styles.headerLinks}>
          {bookmarks.length > 0 && (
            <Pressable onPress={onBookmarks} style={styles.headerLink}>
              <Ionicons name="bookmark" size={16} color={colors.amber} />
            </Pressable>
          )}
          <Pressable onPress={onTrend} style={styles.headerLink} accessibilityRole="button" accessibilityLabel="Feelings Log">
            <Ionicons name="list-outline" size={16} color={colors.inkSoft} />
          </Pressable>
        </View>
      </View>
      <Caption style={styles.subtitle}>Where are you right now?</Caption>

      {streak > 0 && (
        <Caption style={styles.streakText}>
          {streak} {streak === 1 ? 'day' : 'days'} of checking in — showing up counts, however the days feel.
        </Caption>
      )}
      {showReengagement && (
        <Card style={styles.reengagementCard}>
          <Caption>It's been a few days since your last check-in — no pressure, just an open invitation.</Caption>
        </Card>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Step 3 (optional, skippable): a second word, since feelings blend.
// ---------------------------------------------------------------------------
function SecondWordStage({
  zone,
  first,
  onPick,
  onSkip,
}: {
  zone: FeelingZone;
  first: PickedFeeling;
  onPick: (feeling: PickedFeeling) => void;
  onSkip: () => void;
}) {
  const meta = zoneMeta(zone);
  const others = feelingsInZone(zone).filter((f) => f.id !== first.id);
  return (
    <>
      <ScreenTitle style={{ color: meta.accent }}>Add a second word?</ScreenTitle>
      <Caption style={styles.subtitle}>Feelings often blend — optional, skip if one word is enough.</Caption>
      <View style={styles.wordGrid}>
        {others.map((f) => (
          <Pressable key={f.id} onPress={() => onPick(f)} style={[styles.wordChip, { borderColor: meta.accent }]}>
            <Body style={{ color: meta.accent }}>{f.name}</Body>
          </Pressable>
        ))}
      </View>
      <PrimaryButton label="Skip, just one word" variant="outline" onPress={onSkip} style={styles.doneButton} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Step 3 (optional, skippable): intensity — one row per feeling, so a
// two-word blend gets both rated instead of only the second one (the v2 bug).
// ---------------------------------------------------------------------------
function IntensityRow({
  label,
  accent,
  value,
  onPick,
}: {
  label: string;
  accent: string;
  value: 1 | 2 | 3 | 4 | 5 | undefined;
  onPick: (n: 1 | 2 | 3 | 4 | 5) => void;
}) {
  return (
    <View style={styles.intensityBlock}>
      <Eyebrow style={{ color: accent }}>How strong is {label}?</Eyebrow>
      <View style={styles.intensityRow}>
        {([1, 2, 3, 4, 5] as const).map((n) => (
          <Pressable
            key={n}
            onPress={() => onPick(n)}
            style={[styles.intensityChip, { borderColor: accent }, value === n && { backgroundColor: accent }]}
          >
            <SectionHeading style={value === n ? styles.intensityNumActive : { color: accent }}>{n}</SectionHeading>
            <Caption style={[styles.intensityLabel, value === n && styles.intensityLabelActive]}>{intensityLabels[n]}</Caption>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function IntensityStage({
  zone,
  feelings: picked,
  onDone,
  onSkip,
}: {
  zone: FeelingZone;
  feelings: PickedFeeling[];
  onDone: (intensities: Partial<Record<string, 1 | 2 | 3 | 4 | 5>>) => void;
  onSkip: () => void;
}) {
  const meta = zoneMeta(zone);
  const [ratings, setRatings] = useState<Partial<Record<string, 1 | 2 | 3 | 4 | 5>>>({});
  const isDualRating = picked.length > 1;

  return (
    <>
      <ScreenTitle style={{ color: meta.accent }}>How strong is it?</ScreenTitle>
      <Caption style={styles.subtitle}>
        {isDualRating ? "Optional — rate each, or skip both." : "Optional — skip if you'd rather not rate it."}
      </Caption>
      {picked.map((f) => (
        <IntensityRow
          key={f.id}
          label={f.name}
          accent={meta.accent}
          value={ratings[f.id]}
          onPick={(n) => setRatings((prev) => ({ ...prev, [f.id]: n }))}
        />
      ))}
      <PrimaryButton
        label={Object.keys(ratings).length > 0 ? 'Continue' : 'Skip'}
        variant={Object.keys(ratings).length > 0 ? 'primary' : 'outline'}
        onPress={() => (Object.keys(ratings).length > 0 ? onDone(ratings) : onSkip())}
        style={styles.doneButton}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Step 4 (optional, skippable): what's contributing to this.
// ---------------------------------------------------------------------------
function ReasonsStage({ zone, onDone }: { zone: FeelingZone; onDone: (tags: string[]) => void }) {
  const meta = zoneMeta(zone);
  const customReasonTags = useFeelingsStore((s) => s.customReasonTags);
  const addCustomReasonTag = useFeelingsStore((s) => s.addCustomReasonTag);
  const [selected, setSelected] = useState<string[]>([]);
  const [addingCustom, setAddingCustom] = useState(false);
  const [customDraft, setCustomDraft] = useState('');
  const toggle = (tag: string) => setSelected((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));

  const confirmCustom = () => {
    const trimmed = customDraft.trim();
    if (!trimmed) {
      setAddingCustom(false);
      return;
    }
    const created = addCustomReasonTag(trimmed);
    setSelected((prev) => (prev.includes(created) ? prev : [...prev, created]));
    setCustomDraft('');
    setAddingCustom(false);
  };

  return (
    <>
      <ScreenTitle style={{ color: meta.accent }}>What's contributing to this?</ScreenTitle>
      <Caption style={styles.subtitle}>Optional — pick as many as fit, or none.</Caption>
      <View style={styles.wordGrid}>
        {[...reasonTagOptions, ...customReasonTags].map((tag) => (
          <Pressable
            key={tag}
            onPress={() => toggle(tag)}
            style={[styles.wordChip, { borderColor: meta.accent }, selected.includes(tag) && { backgroundColor: meta.accent }]}
          >
            <Body style={selected.includes(tag) ? styles.wordChipTextActive : { color: meta.accent }}>{tag}</Body>
          </Pressable>
        ))}
        {!addingCustom && (
          <Pressable onPress={() => setAddingCustom(true)} style={[styles.wordChip, styles.addChip, { borderColor: meta.accent }]}>
            <Ionicons name="add" size={14} color={meta.accent} />
            <Body style={{ color: meta.accent }}>Add your own</Body>
          </Pressable>
        )}
      </View>
      {addingCustom && (
        <View style={styles.customTagRow}>
          <TextInput
            value={customDraft}
            onChangeText={setCustomDraft}
            placeholder="e.g. Exam, Move, a name..."
            placeholderTextColor={colors.inkSoft}
            style={styles.customTagInput}
            autoFocus
            onSubmitEditing={confirmCustom}
          />
          <PrimaryButton label="Add" onPress={confirmCustom} disabled={!customDraft.trim()} style={styles.customTagAddButton} />
        </View>
      )}
      <PrimaryButton
        label={selected.length > 0 ? 'Continue' : 'Skip'}
        variant={selected.length > 0 ? 'primary' : 'outline'}
        onPress={() => onDone(selected)}
        style={styles.doneButton}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------
function ResultStage({
  mode,
  noteDraft,
  setNoteDraft,
  noteSaved,
  saveNote,
  onDone,
  onLogPeek,
  onJumpZone,
  navigation,
}: {
  mode: ResultMode;
  noteDraft: string;
  setNoteDraft: (t: string) => void;
  noteSaved: boolean;
  saveNote: () => void;
  onDone: () => void;
  onLogPeek: (zone: FeelingZone, feelingIds: string[]) => void;
  onJumpZone: () => void;
  navigation: Props['navigation'];
}) {
  const entries = useFeelingsStore((s) => s.entries);
  const personalFeelings = useFeelingsStore((s) => s.personalFeelings);
  const bookmarks = useFeelingsStore((s) => s.bookmarks);
  const guidanceVotes = useFeelingsStore((s) => s.guidanceVotes);
  const toggleBookmark = useFeelingsStore((s) => s.toggleBookmark);
  const voteGuidance = useFeelingsStore((s) => s.voteGuidance);

  const loggedEntry = mode.type === 'logged' ? entries.find((e) => e.id === mode.entryId) : undefined;
  const zone = mode.type === 'logged' ? loggedEntry?.zone : mode.zone;
  const feelingIds = mode.type === 'logged' ? loggedEntry?.feelingIds ?? [] : mode.feelingIds;
  const intensities = mode.type === 'logged' ? loggedEntry?.intensities : undefined;
  const reasonTags = mode.type === 'logged' ? loggedEntry?.reasonTags : undefined;
  const highestIntensity = intensities ? Math.max(0, ...Object.values(intensities).filter(Boolean) as number[]) : 0;
  if (!zone || feelingIds.length === 0) return null;

  const pickedFeelings = feelingIds.map((id) => findAnyFeeling(id, personalFeelings)).filter(Boolean) as PickedFeeling[];
  const primary = pickedFeelings[0];
  if (!primary) return null;
  const meta = zoneMeta(zone);

  const sustained = mode.type === 'logged' && hasSustainedSafeguardPattern(entries, todayISO());
  const streak = mode.type === 'logged' ? checkInStreak(entries, todayISO()) : 0;
  const suggestions = suggestionsByZone[zone].map((sug) => ({
    ...sug,
    section: sectionsMeta.find((m) => m.id === sug.section)!,
  }));

  const siblings = !isPersonalFeeling(primary) ? siblingFeelings(primary.id).filter((s) => !feelingIds.includes(s.id)) : [];
  const isHighArousal = feelingIds.some((id) => highArousalFeelingIds.includes(id));

  return (
    <>
      <Pressable onPress={onJumpZone} style={styles.backLink}>
        <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
        <Caption> All zones</Caption>
      </Pressable>

      <View style={styles.resultTitleRow}>
        <ScreenTitle>{mode.type === 'peek' ? 'Saved for later' : 'Your reflection'}</ScreenTitle>
        <Pressable hitSlop={8} onPress={() => toggleBookmark(primary.id)}>
          <Ionicons name={bookmarks.includes(primary.id) ? 'bookmark' : 'bookmark-outline'} size={22} color={colors.amber} />
        </Pressable>
      </View>

      <Card style={[styles.resultCard, { borderLeftColor: meta.accent, borderLeftWidth: 4 }]}>
        <Eyebrow style={{ color: meta.accent }}>{meta.label}</Eyebrow>
        <SectionHeading>{pickedFeelings.map((f) => f.name).join(' & ')}</SectionHeading>
        {pickedFeelings.map((f) => (
          <View key={f.id}>
            {isPersonalFeeling(f) ? (
              <Body>Your own word — name it, notice where you feel it, and take one small next step.</Body>
            ) : (
              <Body>{f.definition}</Body>
            )}
            {intensities?.[f.id] && (
              <Caption style={{ color: meta.accent }}>
                {pickedFeelings.length > 1 ? `${f.name}: ` : ''}
                {intensityLabels[intensities[f.id]!]}
              </Caption>
            )}
          </View>
        ))}
        {reasonTags && reasonTags.length > 0 && (
          <Caption style={styles.reasonTagsText}>Tagged: {reasonTags.join(', ')}</Caption>
        )}
      </Card>

      {!isPersonalFeeling(primary) && (
        <Card style={styles.guidanceCard}>
          <Eyebrow>Ways to work with it</Eyebrow>
          {sortGuidanceByVotes(primary.id, primary.guidance, guidanceVotes).map((line) => {
            const vote = getGuidanceVote(primary.id, line, guidanceVotes);
            return (
              <View key={line} style={styles.guidanceRow}>
                <Body style={styles.guidanceBullet}>•</Body>
                <Body style={styles.guidanceText}>{line}</Body>
                <View style={styles.voteCol}>
                  <Pressable hitSlop={6} onPress={() => voteGuidance(primary.id, line, 1)}>
                    <Ionicons name={vote > 0 ? 'thumbs-up' : 'thumbs-up-outline'} size={14} color={vote > 0 ? colors.teal : colors.inkSoft} />
                  </Pressable>
                  <Pressable hitSlop={6} onPress={() => voteGuidance(primary.id, line, -1)}>
                    <Ionicons name={vote < 0 ? 'thumbs-down' : 'thumbs-down-outline'} size={14} color={vote < 0 ? '#B3413A' : colors.inkSoft} />
                  </Pressable>
                </View>
              </View>
            );
          })}
          <Caption style={styles.voteHint}>Rate what actually helps — it'll surface first next time.</Caption>
        </Card>
      )}

      {(isHighArousal || highestIntensity >= 4) && (
        <Card style={styles.breathingCard}>
          <BreathingExercise accent={meta.accent} />
        </Card>
      )}

      {highestIntensity >= 4 && (
        <Card style={styles.reachOutCard}>
          <Caption>At this intensity, sending one message to someone can help more than working through it alone.</Caption>
        </Card>
      )}

      {siblings.length > 0 && (
        <Card style={styles.siblingsCard}>
          <Eyebrow>You might also be feeling…</Eyebrow>
          <View style={styles.siblingRow}>
            {siblings.slice(0, 2).map((sib) => (
              <View key={sib.id} style={[styles.siblingChip, { borderColor: meta.accent }]}>
                <Body style={{ color: meta.accent }}>{sib.name}</Body>
              </View>
            ))}
          </View>
        </Card>
      )}

      {mode.type === 'peek' ? (
        <PrimaryButton label="Log this feeling now" style={styles.doneButton} onPress={() => onLogPeek(zone, feelingIds)} />
      ) : (
        <>
          <Card style={styles.noteCard}>
            <Eyebrow>What's behind it? (optional)</Eyebrow>
            <TextInput
              value={noteDraft}
              onChangeText={setNoteDraft}
              placeholder="One line on what's contributing..."
              placeholderTextColor={colors.inkSoft}
              style={styles.noteInput}
              multiline
            />
            <PrimaryButton
              label={noteSaved ? 'Saved' : 'Save note'}
              variant="outline"
              disabled={!noteDraft.trim() || noteSaved}
              onPress={saveNote}
            />
          </Card>

          {streak > 0 && (
            <Card style={styles.streakCard} flat>
              <Ionicons name="flame-outline" size={18} color={colors.amber} />
              <Body style={styles.streakCardText}>
                {streak === 1
                  ? 'You checked in today — that is the hardest part.'
                  : `${streak} days in a row. Showing up regularly matters more than how any one day felt.`}
              </Body>
            </Card>
          )}
        </>
      )}

      <SectionHeading style={styles.suggestTitle}>You might find these helpful</SectionHeading>
      <View style={styles.suggestList}>
        {suggestions.map((sug) => (
          <Pressable key={sug.section.id} onPress={() => navigation.navigate(sug.section.id as any)}>
            <Card style={styles.suggestCard}>
              <Ionicons name={sug.section.icon} size={18} color={colors.teal} />
              <View style={styles.suggestBody}>
                <Body>{sug.section.title}</Body>
                <Caption>{sug.reason}</Caption>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.inkSoft} />
            </Card>
          </Pressable>
        ))}
      </View>

      {sustained && (
        <Card style={styles.sustainedBanner}>
          <Eyebrow style={styles.sustainedLabel}>A gentle note</Eyebrow>
          <Body>
            A few specific feelings have come up on most days for a couple of weeks now. That happens, and it might
            be worth talking to someone about it.
          </Body>
        </Card>
      )}
      <SupportResourcesCard emphasized={sustained} />

      {mode.type === 'logged' && <PrimaryButton label="Done" style={styles.doneButton} onPress={onDone} />}
    </>
  );
}

// Edit or delete one entry of the log. For a feeling logged after a task,
// this is the same entry the task shows, so the task follows along.
function EntryEditSheet({ entry, onClose }: { entry: FeelingCheckIn | null; onClose: () => void }) {
  const [zone, setZone] = useState<FeelingZone>('okay');
  const [note, setNote] = useState('');
  const { showDialog, showToast } = useUi();
  useEffect(() => {
    if (!entry) return;
    setZone(entry.zone);
    setNote(entry.note ?? '');
  }, [entry]);
  if (!entry) return null;

  const save = () => {
    // Changing the zone drops words from the old zone (they no longer fit).
    useFeelingsStore.getState().updateEntry(entry.id, { zone, note, ...(zone !== entry.zone ? { feelingIds: [], intensities: undefined } : {}) });
    mirrorFeelingEdit(entry.id); // a linked Quit moment shows the same feeling
    onClose();
  };

  // The sheet closes first: a dialog opened on top of another modal can end
  // up hidden behind it.
  const remove = () => {
    onClose();
    showDialog({
      title: 'Delete this feeling?',
      message: entry.source?.kind === 'task' ? 'It will also be removed from the task it was logged with.' : 'It will be removed from your log and graphs.',
      actions: [
        { label: 'Keep it', style: 'cancel' },
        {
          label: 'Delete',
          style: 'destructive',
          onPress: () => {
            const previous = useFeelingsStore.getState().entries;
            const links = useDailyPlanningStore
              .getState()
              .tasks.flatMap((t) => Object.entries(t.feelingLinks).flatMap(([d, l]) => (['before', 'after'] as const).filter((p) => l[p] === entry.id).map((p) => ({ taskId: t.id, date: d, phase: p }))));
            deleteFeelingEntry(entry.id);
            showToast({
              message: 'Feeling deleted',
              actionLabel: 'Undo',
              onAction: () => {
                useFeelingsStore.getState().restoreEntries(previous);
                links.forEach((l) => useDailyPlanningStore.getState().setFeelingLink(l.taskId, l.date, l.phase, entry.id));
              },
            });
          },
        },
      ],
    });
  };

  return (
    <SheetModal visible onClose={onClose}>
      <SectionHeading>Edit feeling</SectionHeading>
      <Caption>{formatDisplayDate(entry.date)}</Caption>
      <View style={styles.editZones} accessibilityRole="radiogroup" accessibilityLabel="Zone">
        {feelingZones.map((z) => (
          <Pressable
            key={z.id}
            onPress={() => setZone(z.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: zone === z.id }}
            style={[styles.editZone, { borderColor: z.accent }, zone === z.id && { backgroundColor: withAlpha(z.accent, 0.22) }]}
          >
            <Caption>{z.label}</Caption>
          </Pressable>
        ))}
      </View>
      <TextInput value={note} onChangeText={setNote} placeholder="A note (optional)" placeholderTextColor={colors.inkSoft} style={styles.editNote} accessibilityLabel="Note" />
      <View style={styles.editActions}>
        <PrimaryButton label="Delete" variant="outline" style={styles.editAction} onPress={remove} />
        <PrimaryButton label="Save" style={styles.editAction} onPress={save} />
      </View>
    </SheetModal>
  );
}

// ---------------------------------------------------------------------------
// Feelings Log (trend)
// ---------------------------------------------------------------------------
function TrendStage({ onBack, onOpen }: { onBack: () => void; onOpen: (zone: FeelingZone, feelingIds: string[]) => void }) {
  const entries = useFeelingsStore((s) => s.entries);
  const personalFeelings = useFeelingsStore((s) => s.personalFeelings);
  const sorted = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sourceLookup = useFeelingSourceLookup();
  const repeats = topRepeatedFeelings(entries, addDaysISO(todayISO(), -30));
  const [editing, setEditing] = useState<FeelingCheckIn | null>(null);

  const weekCounts = zoneCounts(entries.filter((e) => e.date >= addDaysISO(todayISO(), -6)));
  const topZones = (Object.entries(weekCounts) as [FeelingZone, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([z]) => zoneMeta(z).label);

  return (
    <>
      <View style={styles.headerRow}>
        <ScreenTitle>Feelings Log</ScreenTitle>
        <Pressable onPress={onBack} style={styles.headerLink}>
          <Ionicons name="close" size={20} color={colors.inkSoft} />
        </Pressable>
      </View>
      <Caption style={styles.subtitle}>A real record of what you've named — not a score</Caption>

      {topZones.length > 0 && (
        <Card style={styles.weekSummaryCard}>
          <Caption>This week: mostly {topZones.join(' and ')}</Caption>
        </Card>
      )}

      {repeats.length > 0 && (
        <Card style={styles.repeatsCard}>
          <Eyebrow>Showing up more than once this month</Eyebrow>
          {repeats.map((r) => {
            const feeling = findAnyFeeling(r.feelingId, personalFeelings);
            if (!feeling) return null;
            const meta = zoneMeta(feeling.zone);
            return (
              <Pressable key={r.feelingId} onPress={() => onOpen(feeling.zone, [r.feelingId])} style={styles.repeatRow}>
                <View style={[styles.dot, { backgroundColor: meta.accent }]} />
                <Body style={styles.repeatText}>
                  {feeling.name} — {r.count} times
                </Body>
              </Pressable>
            );
          })}
        </Card>
      )}

      <View style={styles.list}>
        {sorted.length === 0 && <Body style={styles.emptyText}>No check-ins yet.</Body>}
        {sorted.map((e) => {
          const names = e.feelingIds.map((id) => findAnyFeeling(id, personalFeelings)?.name).filter(Boolean);
          const meta = zoneMeta(e.zone);
          const from = describeFeelingSource(e.source, sourceLookup);
          return (
            // Only a named feeling has a reflection page to open; one logged as
            // just a zone (e.g. after a task) opens for editing instead.
            <Pressable key={e.id} onPress={() => (e.feelingIds.length ? onOpen(e.zone, e.feelingIds) : setEditing(e))}>
              <Card style={[styles.historyCard, { borderLeftColor: meta.accent, borderLeftWidth: 3 }]}>
                <View style={styles.historyHeader}>
                  <Body style={styles.flex1}>{names.join(' & ') || meta.label}</Body>
                  <Caption>{formatDisplayDate(e.date)}</Caption>
                  <Pressable onPress={() => setEditing(e)} hitSlop={10} style={styles.entryMore} accessibilityRole="button" accessibilityLabel={`Edit or delete ${names.join(' & ') || meta.label}, ${formatDisplayDate(e.date)}`}>
                    <Ionicons name="ellipsis-horizontal" size={18} color={colors.inkSoft} />
                  </Pressable>
                </View>
                {names.length > 0 && <Caption style={{ color: meta.accent }}>{meta.label}</Caption>}
                {from && <Caption style={from.deleted ? styles.sourceDeleted : undefined}>{from.text}</Caption>}
                {e.note && <Caption style={styles.noteHistoryText}>"{e.note}"</Caption>}
              </Card>
            </Pressable>
          );
        })}
      </View>

      <SupportResourcesCard />
      <EntryEditSheet entry={editing} onClose={() => setEditing(null)} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------
function BookmarksStage({ onBack, onOpen }: { onBack: () => void; onOpen: (zone: FeelingZone, feelingIds: string[]) => void }) {
  const bookmarks = useFeelingsStore((s) => s.bookmarks);
  const personalFeelings = useFeelingsStore((s) => s.personalFeelings);

  return (
    <>
      <View style={styles.headerRow}>
        <ScreenTitle>Bookmarked</ScreenTitle>
        <Pressable onPress={onBack} style={styles.headerLink}>
          <Ionicons name="close" size={20} color={colors.inkSoft} />
        </Pressable>
      </View>
      <Caption style={styles.subtitle}>Quick reference, no need to go through the steps again</Caption>

      <View style={styles.list}>
        {bookmarks.length === 0 && <Body style={styles.emptyText}>Nothing bookmarked yet — tap the bookmark icon on any result.</Body>}
        {bookmarks.map((id) => {
          const feeling = findAnyFeeling(id, personalFeelings);
          if (!feeling) return null;
          const meta = zoneMeta(feeling.zone);
          return (
            <Pressable key={id} onPress={() => onOpen(feeling.zone, [id])}>
              <Card style={[styles.historyCard, { borderLeftColor: meta.accent, borderLeftWidth: 3 }]}>
                <Body>{feeling.name}</Body>
                <Caption style={{ color: meta.accent }}>{meta.label}</Caption>
              </Card>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// Patterns — a week/month/year trend line + stats, separate from the
// Feelings Log list above. The line's height comes from a pleasantness score
// per zone (Lively +2 ... Low -2), and each point/segment is colored by the
// zone its score is closest to, so the line's color shifts as it moves
// between zones instead of just its height changing.
// ---------------------------------------------------------------------------
// Tapping a zone dot isolates it on the graph (the others fade); tapping the
// same dot again shows all zones again.
function ZoneLegend({ isolatedZone, onToggle }: { isolatedZone: FeelingZone | null; onToggle: (zone: FeelingZone) => void }) {
  return (
    <View style={styles.legendRow}>
      {feelingZones.map((z) => (
        <Pressable key={z.id} onPress={() => onToggle(z.id)} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: z.accent }, isolatedZone && isolatedZone !== z.id && styles.legendDotDim]} />
          <Caption style={isolatedZone && isolatedZone !== z.id ? styles.legendTextDim : undefined}>{z.label}</Caption>
        </Pressable>
      ))}
    </View>
  );
}

// The Skia/Victory-Native-XL chart itself lives in components/FeelingsGraph —
// pulled out into its own file since it's a genuinely separate rendering
// stack (GPU canvas, its own gesture pipeline) from the rest of this screen.

const sortLabels: Record<'count' | 'alpha' | 'recent', string> = { count: 'Most used', alpha: 'A–Z', recent: 'Recent' };

function ReasonsBreakdownCard({
  groups,
  sortMode,
  setSortMode,
  personalFeelings,
  onFilterReason,
  onDrillReason,
}: {
  groups: FeelingReasonGroup[];
  sortMode: 'count' | 'alpha' | 'recent';
  setSortMode: (s: 'count' | 'alpha' | 'recent') => void;
  personalFeelings: ReturnType<typeof useFeelingsStore.getState>['personalFeelings'];
  onFilterReason: (tag: string) => void;
  onDrillReason: (feelingId: string, tag: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const named = groups
    .map((g) => ({ ...g, name: findAnyFeeling(g.feelingId, personalFeelings)?.name ?? g.feelingId }))
    .sort((a, b) => (sortMode === 'alpha' ? a.name.localeCompare(b.name) : sortMode === 'recent' ? b.lastDate.localeCompare(a.lastDate) : b.total - a.total));

  return (
    <Card style={styles.statsCard}>
      <View style={styles.breakdownHeaderRow}>
        <Eyebrow>Reasons, by word</Eyebrow>
      </View>
      <View style={styles.reasonFilterRow}>
        {(['count', 'alpha', 'recent'] as const).map((s) => (
          <Pressable key={s} onPress={() => setSortMode(s)} style={[styles.reasonFilterChip, sortMode === s && styles.reasonFilterChipActive]}>
            <Caption style={sortMode === s ? styles.wordChipTextActive : undefined}>{sortLabels[s]}</Caption>
          </Pressable>
        ))}
      </View>
      {named.length === 0 ? (
        <Caption style={styles.emptyText}>No check-ins in this period yet.</Caption>
      ) : (
        named.map((g) => {
          const feeling = findAnyFeeling(g.feelingId, personalFeelings);
          const meta = feeling ? zoneMeta(feeling.zone) : undefined;
          const isExpanded = expandedId === g.feelingId;
          return (
            <View key={g.feelingId} style={styles.breakdownWordBlock}>
              <Pressable onPress={() => setExpandedId(isExpanded ? null : g.feelingId)} style={styles.breakdownWordRow}>
                {meta && <View style={[styles.dot, { backgroundColor: meta.accent }]} />}
                <Body style={styles.breakdownWordName}>{g.name}</Body>
                <Caption style={styles.emptyText}>
                  {g.total} {g.total === 1 ? 'check-in' : 'check-ins'}
                </Caption>
                <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.inkSoft} />
              </Pressable>
              {isExpanded && (
                <View style={styles.breakdownReasonList}>
                  {g.reasons.length === 0 ? (
                    <Caption style={styles.emptyText}>No reasons tagged for this word yet.</Caption>
                  ) : (
                    g.reasons.map((r) => (
                      <View key={r.tag} style={styles.breakdownReasonRow}>
                        <Pressable onPress={() => onFilterReason(r.tag)} style={styles.breakdownReasonLabel}>
                          <Caption>
                            {r.tag} ({r.count}) — see trend
                          </Caption>
                        </Pressable>
                        <Pressable hitSlop={8} onPress={() => onDrillReason(g.feelingId, r.tag)}>
                          <Ionicons name="chevron-forward" size={13} color={colors.inkSoft} />
                        </Pressable>
                      </View>
                    ))
                  )}
                </View>
              )}
            </View>
          );
        })
      )}
    </Card>
  );
}

const DIMENSION_HINT_STORAGE_KEY = 'ona:identify-feeling:dimension-hint-seen';

// Explains the Pleasantness/Energy toggle — the zone system already carries
// two separate dimensions (Russell's circumplex model: how good it feels,
// and how much energy it carries), but the toggle alone doesn't make that
// obvious, so this is available on tap without ever blocking the toggle
// itself.
function DimensionExplanationSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <SheetModal visible={visible} onClose={onClose}>
      <ScreenTitle>Two ways to look at a feeling</ScreenTitle>
      <Body>Every feeling can be described in two different ways:</Body>
      <Body>
        <Body style={styles.dimensionInfoBold}>Pleasantness</Body> — does it feel good or bad?{'\n'}
        <Body style={styles.dimensionInfoBold}>Energy</Body> — does it come with a lot of energy, or very little?
      </Body>
      <Body>
        These are separate from each other. A feeling can be good-and-energized, good-and-calm, bad-and-energized, or
        bad-and-calm.
      </Body>

      <View style={styles.dimensionGridWrap}>
        <View style={styles.dimensionGridColHeadersRow}>
          <View style={styles.dimensionGridCorner} />
          <Caption style={styles.dimensionGridColHeader}>High energy</Caption>
          <Caption style={styles.dimensionGridColHeader}>Low energy</Caption>
        </View>
        <View style={styles.dimensionGridBodyRow}>
          <View style={styles.dimensionGridRowHeaders}>
            <Caption style={styles.dimensionGridRowHeader}>Feels good</Caption>
            <Caption style={styles.dimensionGridRowHeader}>Feels bad</Caption>
          </View>
          <View style={styles.dimensionGridCells}>
            <View style={styles.dimensionGridCellsRow}>
              <View style={[styles.dimensionGridCell, { backgroundColor: zoneMeta('lively').accent }]}>
                <Body style={styles.dimensionGridCellText}>Lively</Body>
              </View>
              <View style={[styles.dimensionGridCell, { backgroundColor: zoneMeta('calm').accent }]}>
                <Body style={styles.dimensionGridCellText}>Calm</Body>
              </View>
            </View>
            <View style={styles.dimensionGridCellsRow}>
              <View style={[styles.dimensionGridCell, { backgroundColor: zoneMeta('tense').accent }]}>
                <Body style={styles.dimensionGridCellText}>Tense</Body>
              </View>
              <View style={[styles.dimensionGridCell, { backgroundColor: zoneMeta('low').accent }]}>
                <Body style={styles.dimensionGridCellText}>Low</Body>
              </View>
            </View>
            <View style={styles.dimensionGridOkayWrap} pointerEvents="none">
              <View style={[styles.dimensionGridOkay, { backgroundColor: zoneMeta('okay').accent }]}>
                <Caption style={styles.dimensionGridCellText}>Okay</Caption>
              </View>
            </View>
          </View>
        </View>
      </View>

      <Body>
        The Pleasantness graph shows if your days are trending good or bad. The Energy graph shows if they're
        trending energized or calm. Together, they tell you more than either one alone — for example, a month could
        be pleasant and calm, or pleasant and energized, and those are pretty different experiences.
      </Body>

      <PrimaryButton label="Got it" onPress={onClose} style={styles.doneButton} />
    </SheetModal>
  );
}

function PatternsStage({ onBack, onOpenDate, onOpenReason }: { onBack: () => void; onOpenDate: (date: string) => void; onOpenReason: (feelingId: string, tag: string) => void }) {
  const entries = useFeelingsStore((s) => s.entries);
  const personalFeelings = useFeelingsStore((s) => s.personalFeelings);
  const [view, setView] = useState<PatternsView>(() => useSettingsStore.getState().feelingsPatternsDefault);
  const [month, setMonth] = useState(todayISO());
  const [customRange, setCustomRange] = useState({ start: addDaysISO(todayISO(), -13), end: todayISO() });
  const [pickingRangeField, setPickingRangeField] = useState<'start' | 'end' | null>(null);
  const [dimension, setDimension] = useState<TrendDimension>('pleasantness');
  const [smoothing, setSmoothing] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [isolatedZone, setIsolatedZone] = useState<FeelingZone | null>(null);
  const [reasonFilterZone, setReasonFilterZone] = useState<FeelingZone | null>(null);
  const [reasonFilter, setReasonFilter] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<'count' | 'alpha' | 'recent'>('count');
  const [showDimensionInfo, setShowDimensionInfo] = useState(false);
  const [showDimensionHint, setShowDimensionHint] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // Landscape only adds real value on this one screen (more horizontal room
  // for a long time range), so it's unlocked only while the fullscreen graph
  // is open, and relocked to the app's normal portrait-only the moment it
  // closes — everything else in the app stays portrait.
  useEffect(() => {
    if (!fullscreen) return;
    ScreenOrientation.unlockAsync().catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, [fullscreen]);

  const swipeCloseResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gestureState) => gestureState.dy > 8 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderRelease: (_evt, gestureState) => {
        if (gestureState.dy > 60) setFullscreen(false);
      },
    })
  ).current;

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(spaceKey(DIMENSION_HINT_STORAGE_KEY))
      .then((seen) => {
        if (mounted && !seen) setShowDimensionHint(true);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const dismissDimensionHint = () => {
    setShowDimensionHint(false);
    AsyncStorage.setItem(spaceKey(DIMENSION_HINT_STORAGE_KEY), '1').catch(() => {});
  };

  const { start, end, granularity } = patternsNaturalRange(view, month, customRange, todayISO());
  const spanDays = daysBetweenISO(start, end) + 1;
  const prevEnd = addDaysISO(start, -1);
  const prevStart = addDaysISO(prevEnd, -(spanDays - 1));

  const periodEntriesAll = entries.filter((e) => e.date >= start && e.date <= end);
  const previousPeriodEntriesAll = entries.filter((e) => e.date >= prevStart && e.date <= prevEnd);
  const matchesFilters = (e: FeelingCheckIn) => (!reasonFilterZone || e.zone === reasonFilterZone) && (!reasonFilter || (e.reasonTags ?? []).includes(reasonFilter));
  const chartEntries = periodEntriesAll.filter(matchesFilters);
  const compareEntries = previousPeriodEntriesAll.filter(matchesFilters);

  const common = mostCommonZone(periodEntriesAll);
  const streak = longestZoneStreak(periodEntriesAll);
  const comparison = compareZonePeriods(periodEntriesAll, previousPeriodEntriesAll);

  let chartPoints =
    granularity === 'day'
      ? dailyTrendPoints(chartEntries, datesInRange(start, end), dimension)
      : monthlyTrendPointsInRange(chartEntries, start.slice(0, 7), end.slice(0, 7), dimension);
  const smoothingWindow = spanDays <= 14 ? 3 : spanDays <= 60 ? 7 : 2;
  if (smoothing) chartPoints = rollingAverageTrend(chartPoints, smoothingWindow, dimension);

  let comparePoints: TrendPoint[] | undefined;
  if (compareMode) {
    comparePoints =
      granularity === 'day'
        ? dailyTrendPoints(compareEntries, datesInRange(prevStart, prevEnd), dimension)
        : monthlyTrendPointsInRange(compareEntries, prevStart.slice(0, 7), prevEnd.slice(0, 7), dimension);
    if (smoothing) comparePoints = rollingAverageTrend(comparePoints, smoothingWindow, dimension);
  }

  // Every point's x position is its fixed slot in the FULL period (domain
  // slot count = every day 1..last-day-of-month, or 1..12 months for Year),
  // not its index in whatever points happen to have data — see the comment
  // on domainIndexForDate in feelingsStats.ts for why that distinction is
  // the actual fix for the "graph stops early" bug.
  const domainSlots = domainSlotCount(start, end, granularity);
  const positionedPoints: PositionedPoint[] = chartPoints.map((p) => ({ ...p, domainIndex: domainIndexForDate(start, p.date, granularity) }));
  const positionedComparePoints: PositionedPoint[] | undefined = comparePoints?.map((p) => ({
    ...p,
    domainIndex: domainIndexForDate(prevStart, p.date, granularity),
  }));
  // The chart formats an axis label for any domain index d3 decides to tick,
  // computed live from the real date at that slot rather than a
  // precomputed sparse array — see FeelingsGraph for why.
  const formatLabel = (index: number) => {
    if (granularity === 'month') {
      const date = addMonthsISO(`${start.slice(0, 7)}-01`, index);
      return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: 'short' });
    }
    return String(Number(addDaysISO(start, index).slice(-2)));
  };

  const breakdownGroups = reasonBreakdownByFeeling(chartEntries);

  const handlePointPress = (point: PositionedPoint) => {
    if (granularity === 'month') {
      setView('month');
      setMonth(point.date);
    } else {
      onOpenDate(point.date);
    }
  };

  const segmentedControl = (
    <View style={styles.segmented}>
      {(['week', 'month', 'year', 'custom'] as const).map((v) => (
        <Pressable key={v} onPress={() => setView(v)} style={[styles.segment, view === v && styles.segmentActive]}>
          <Caption style={view === v ? styles.segmentTextActive : undefined}>{v === 'custom' ? 'Custom' : v[0].toUpperCase() + v.slice(1)}</Caption>
        </Pressable>
      ))}
    </View>
  );

  // The graph plus its immediate controls (range, dimension, smoothing,
  // compare, zone-isolation legend) — identical in the compact Patterns tab
  // and the fullscreen page, so zoom/pan/dimension/etc. behave exactly the
  // same in both; only the surrounding layout differs.
  const graphSection = (
    <>
      {segmentedControl}

      {view === 'custom' && (
        <View style={styles.customRangeRow}>
          <Pressable onPress={() => setPickingRangeField(pickingRangeField === 'start' ? null : 'start')} style={[styles.chip, pickingRangeField === 'start' && styles.chipActive]}>
            <Caption style={pickingRangeField === 'start' ? styles.wordChipTextActive : undefined}>From {formatDisplayDate(customRange.start)}</Caption>
          </Pressable>
          <Pressable onPress={() => setPickingRangeField(pickingRangeField === 'end' ? null : 'end')} style={[styles.chip, pickingRangeField === 'end' && styles.chipActive]}>
            <Caption style={pickingRangeField === 'end' ? styles.wordChipTextActive : undefined}>To {formatDisplayDate(customRange.end)}</Caption>
          </Pressable>
        </View>
      )}
      {view === 'custom' && pickingRangeField && (
        <MonthCalendar
          accent={colors.teal}
          month={pickingRangeField === 'start' ? customRange.start : customRange.end}
          onMonthChange={() => {}}
          onDayPress={(date) => {
            setCustomRange((prev) =>
              pickingRangeField === 'start'
                ? { start: date, end: date > prev.end ? date : prev.end }
                : { end: date, start: date < prev.start ? date : prev.start }
            );
            setPickingRangeField(null);
          }}
          disableFuture={false}
        />
      )}

      {(view === 'month' || view === 'year') && (
        <View style={styles.chartNavRow}>
          <Pressable hitSlop={8} onPress={() => setMonth(addMonthsISO(month, view === 'month' ? -1 : -12))}>
            <Ionicons name="chevron-back" size={20} color={colors.ink} />
          </Pressable>
          <SectionHeading>{view === 'month' ? formatMonthLabel(month) : month.slice(0, 4)}</SectionHeading>
          <Pressable hitSlop={8} onPress={() => setMonth(addMonthsISO(month, view === 'month' ? 1 : 12))}>
            <Ionicons name="chevron-forward" size={20} color={colors.ink} />
          </Pressable>
        </View>
      )}

      <View style={styles.dimensionHeaderRow}>
        <View style={styles.dimensionRow}>
          {(['pleasantness', 'energy'] as const).map((d) => (
            <Pressable key={d} onPress={() => setDimension(d)} style={[styles.dimensionChip, dimension === d && styles.dimensionChipActive]}>
              <Caption style={dimension === d ? styles.wordChipTextActive : undefined}>{d === 'pleasantness' ? 'Pleasantness' : 'Energy'}</Caption>
            </Pressable>
          ))}
        </View>
        <Pressable hitSlop={8} onPress={() => setShowDimensionInfo(true)} style={styles.dimensionInfoButton}>
          <Ionicons name="information-circle-outline" size={20} color={colors.inkSoft} />
        </Pressable>
      </View>

      {showDimensionHint && (
        <Card style={styles.coachmarkCard}>
          <Caption>Tap here to see if your days were more good-vs-bad, or more energized-vs-calm.</Caption>
          <View style={styles.coachmarkRow}>
            <Pressable
              onPress={() => {
                setShowDimensionInfo(true);
                dismissDimensionHint();
              }}
            >
              <Caption style={{ color: colors.teal }}>Learn more</Caption>
            </Pressable>
            <Pressable onPress={dismissDimensionHint}>
              <Caption style={{ color: colors.inkSoft }}>Got it</Caption>
            </Pressable>
          </View>
        </Card>
      )}

      <View style={styles.toggleRow}>
        <Pressable onPress={() => setSmoothing((v) => !v)} style={[styles.toggleChip, smoothing && styles.toggleChipActive]}>
          <Caption style={smoothing ? styles.wordChipTextActive : undefined}>Smooth</Caption>
        </Pressable>
        <Pressable onPress={() => setCompareMode((v) => !v)} style={[styles.toggleChip, compareMode && styles.toggleChipActive]}>
          <Caption style={compareMode ? styles.wordChipTextActive : undefined}>Compare to last period</Caption>
        </Pressable>
      </View>

      <View style={styles.chartWithExpandWrap}>
        <React.Suspense fallback={<View style={styles.chartLoading} />}>
          <FeelingsGraph
            points={positionedPoints}
            domainSlots={domainSlots}
            formatLabel={formatLabel}
            onPointPress={handlePointPress}
            isolatedZone={isolatedZone}
            comparePoints={positionedComparePoints}
          />
        </React.Suspense>
        {!fullscreen && (
          <Pressable
            hitSlop={8}
            onPress={() => setFullscreen(true)}
            style={styles.expandButton}
            accessibilityLabel="Expand graph to fullscreen"
            testID="patterns-expand-button"
          >
            <Ionicons name="expand-outline" size={16} color={colors.inkSoft} />
          </Pressable>
        )}
      </View>

      <ZoneLegend isolatedZone={isolatedZone} onToggle={(z) => setIsolatedZone((prev) => (prev === z ? null : z))} />
    </>
  );

  return (
    <>
      <View style={styles.headerRow}>
        <ScreenTitle>Patterns</ScreenTitle>
        <Pressable onPress={onBack} style={styles.headerLink}>
          <Ionicons name="close" size={20} color={colors.inkSoft} />
        </Pressable>
      </View>
      <Caption style={styles.subtitle}>Gentle, factual observations — never a diagnosis</Caption>

      {graphSection}

      <DimensionExplanationSheet visible={showDimensionInfo} onClose={() => setShowDimensionInfo(false)} />

      <Modal visible={fullscreen} animationType="slide" statusBarTranslucent onRequestClose={() => setFullscreen(false)} supportedOrientations={['portrait', 'landscape']}>
        <View style={styles.fullscreenRoot}>
          <View style={styles.fullscreenHandleBar} {...swipeCloseResponder.panHandlers}>
            <View style={styles.fullscreenHandlePill} />
            <Pressable
              hitSlop={8}
              onPress={() => setFullscreen(false)}
              style={styles.fullscreenCloseButton}
              accessibilityLabel="Close fullscreen graph"
              testID="patterns-fullscreen-close"
            >
              <Ionicons name="close" size={22} color={colors.ink} />
            </Pressable>
          </View>
          <View style={styles.fullscreenContent}>{graphSection}</View>
        </View>
      </Modal>

      <Card style={styles.statsCard}>
        {common ? (
          <Caption>
            Most common: {zoneMeta(common.zone).label} ({common.count} {common.count === 1 ? 'check-in' : 'check-ins'})
          </Caption>
        ) : (
          <Caption style={styles.emptyText}>No check-ins in this period yet.</Caption>
        )}
        {streak && (
          <Caption>
            Longest streak in one zone: {streak.days} days ({zoneMeta(streak.zone).label})
          </Caption>
        )}
        {comparison && (
          <Caption>
            This period vs. last: {comparison.direction} {zoneMeta(comparison.zone).label} days
          </Caption>
        )}
      </Card>

      <Card style={styles.statsCard}>
        <Eyebrow>Filter reasons by zone</Eyebrow>
        <View style={styles.reasonFilterRow}>
          <Pressable onPress={() => setReasonFilterZone(null)} style={[styles.reasonFilterChip, !reasonFilterZone && styles.reasonFilterChipActive]}>
            <Caption style={!reasonFilterZone ? styles.wordChipTextActive : undefined}>All zones</Caption>
          </Pressable>
          {feelingZones.map((z) => (
            <Pressable
              key={z.id}
              onPress={() => setReasonFilterZone(z.id)}
              style={[styles.reasonFilterChip, reasonFilterZone === z.id && { backgroundColor: z.accent }]}
            >
              <Caption style={reasonFilterZone === z.id ? styles.wordChipTextActive : { color: z.accent }}>{z.label}</Caption>
            </Pressable>
          ))}
        </View>
        {reasonFilter && (
          <Pressable onPress={() => setReasonFilter(null)} style={styles.activeReasonFilterChip}>
            <Caption style={styles.wordChipTextActive}>Filtered by: {reasonFilter} ✕</Caption>
          </Pressable>
        )}
      </Card>

      <ReasonsBreakdownCard
        groups={breakdownGroups}
        sortMode={sortMode}
        setSortMode={setSortMode}
        personalFeelings={personalFeelings}
        onFilterReason={(tag) => setReasonFilter((prev) => (prev === tag ? null : tag))}
        onDrillReason={onOpenReason}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Drilling into a specific "word x reason" pair from the Patterns breakdown
// — the actual list of check-ins behind a count like "Overwhelmed → Work (6)".
// ---------------------------------------------------------------------------
function ReasonEntriesStage({
  feelingId,
  tag,
  onBack,
  onOpen,
}: {
  feelingId: string;
  tag: string;
  onBack: () => void;
  onOpen: (zone: FeelingZone, feelingIds: string[]) => void;
}) {
  const entries = useFeelingsStore((s) => s.entries);
  const personalFeelings = useFeelingsStore((s) => s.personalFeelings);
  const feeling = findAnyFeeling(feelingId, personalFeelings);
  const matches = entries
    .filter((e) => e.feelingIds.includes(feelingId) && (e.reasonTags ?? []).includes(tag))
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <View style={styles.headerRow}>
        <ScreenTitle>{feeling?.name ?? 'Feeling'} & {tag}</ScreenTitle>
        <Pressable onPress={onBack} style={styles.headerLink}>
          <Ionicons name="close" size={20} color={colors.inkSoft} />
        </Pressable>
      </View>
      <Caption style={styles.subtitle}>
        Check-ins where {feeling?.name ?? 'this'} was tagged alongside {tag} — not "caused by," just logged together.
      </Caption>
      <View style={styles.list}>
        {matches.length === 0 && <Body style={styles.emptyText}>Nothing here anymore.</Body>}
        {matches.map((e) => {
          const meta = zoneMeta(e.zone);
          return (
            <Pressable key={e.id} onPress={() => onOpen(e.zone, e.feelingIds)}>
              <Card style={[styles.historyCard, { borderLeftColor: meta.accent, borderLeftWidth: 3 }]}>
                <View style={styles.historyHeader}>
                  <Body>{e.feelingIds.map((id) => findAnyFeeling(id, personalFeelings)?.name).filter(Boolean).join(' & ')}</Body>
                  <Caption>{formatDisplayDate(e.date)}</Caption>
                </View>
                <Caption style={{ color: meta.accent }}>{meta.label}</Caption>
                {e.note && <Caption style={styles.noteHistoryText}>"{e.note}"</Caption>}
              </Card>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// Analysis — a third partition alongside Check In and Patterns: not "how
// often was this tag used" (that's Patterns' own reasons list), but "what
// does this tag tend to mean for you." Everything here is correlational —
// "associated with," never "causes" — and every ranking is gated by
// analysisMinCount() so a couple of unusual days never reads as a
// pattern.
// ---------------------------------------------------------------------------
const ZONE_BAR_ORDER: FeelingZone[] = ['lively', 'calm', 'okay', 'tense', 'low'];

function TagZoneBar({ tag, entries }: { tag: string; entries: FeelingCheckIn[] }) {
  const dist = tagZoneDistribution(entries, tag);
  if (!dist) return null;
  const segments = ZONE_BAR_ORDER.map((zone) => ({ zone, pct: dist.percentages[zone] })).filter((s) => s.pct > 0);
  return (
    <View style={styles.zoneBarWrap}>
      <View style={styles.zoneBar}>
        {segments.map((s) => (
          <View key={s.zone} style={{ flex: s.pct, backgroundColor: zoneMeta(s.zone).accent }} />
        ))}
      </View>
      <View style={styles.zoneBarLegend}>
        {segments.map((s) => (
          <Caption key={s.zone} style={{ color: zoneMeta(s.zone).accent }}>
            {zoneMeta(s.zone).label} {s.pct}%
          </Caption>
        ))}
      </View>
    </View>
  );
}

// The specific feeling words behind a tag — e.g. tagging "Work" might mostly
// mean "Stressed," but sometimes "Calm." This is the detail the zone bar
// above necessarily flattens away.
function TagFeelingList({ tag, entries }: { tag: string; entries: FeelingCheckIn[] }) {
  const breakdown = tagFeelingBreakdown(entries, tag);
  if (breakdown.length === 0) return null;
  return (
    <View style={styles.feelingBreakdownList}>
      {breakdown.map((row) => (
        <View key={row.feeling} style={styles.feelingBreakdownItem}>
          <View style={styles.feelingBreakdownRow}>
            <Body style={styles.feelingBreakdownName}>{row.feeling}</Body>
            <Caption style={styles.feelingBreakdownCount}>
              {row.count} {row.count === 1 ? 'time' : 'times'} · {row.percentage}%
            </Caption>
          </View>
          {row.notes.map((note, i) => (
            <Caption key={i} style={styles.noteHistoryText}>
              "{note}"
            </Caption>
          ))}
        </View>
      ))}
    </View>
  );
}

// The "Biggest impact" headline card — bold presentation (large tag name,
// colored zone badge, a big confident one-liner), but every word in it is
// still correlational. Bold typography earns attention; the wording is what
// earns trust, since a real third factor (bad sleep on workdays, a specific
// deadline) could be the actual driver behind both the tag and the feeling.
function TagImpactCard({ impact, entries, onPress }: { impact: TagImpact; entries: FeelingCheckIn[]; onPress: () => void }) {
  const primary = tagPrimaryZone(entries, impact.tag);
  const insight = tagInsight(entries, impact.tag);
  if (!primary || !insight) return null;
  const meta = zoneMeta(primary.zone);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityHint="Opens what came up with this tag">
      <Card style={[styles.impactCard, { borderLeftColor: meta.accent }]}>
        <View style={styles.impactCardHeader}>
          <SectionHeading style={styles.impactCardTag}>{impact.tag}</SectionHeading>
          <View style={styles.impactZoneBadge}>
            <View style={[styles.dot, { backgroundColor: meta.accent }]} />
            <Body style={{ color: meta.accent }}>{meta.label}</Body>
          </View>
        </View>
        <ScreenTitle style={styles.impactCardHeadline}>{insight.headline}</ScreenTitle>
        <Caption style={styles.impactCardStat}>
          {describeTagImpact(impact)} {basedOn(insight.n)}.
        </Caption>
      </Card>
    </Pressable>
  );
}

type AnalysisView = 'all' | 'week' | 'month' | 'custom';

function analysisRange(
  view: AnalysisView,
  customRange: { start: string; end: string },
  today: string,
  earliestDate: string
): { start: string; end: string } {
  if (view === 'all') return { start: earliestDate, end: today };
  // Both trailing windows ending today, not calendar week/month — Analysis
  // has no month-navigation the way Patterns does, so "this calendar month"
  // would mean almost no data at all on, say, October 1st, even with a full
  // history sitting one day earlier in September. A rolling window always
  // has a full window's worth of history to draw from, regardless of what
  // day of the month it happens to be.
  if (view === 'week') return { start: addDaysISO(today, -6), end: today };
  if (view === 'month') return { start: addDaysISO(today, -29), end: today };
  return customRange;
}

// A real two-tap range picker on one calendar: the first tap sets the start
// (shown as a single highlighted day while a second tap is pending), the
// second tap sets the end and fills in every day between — never a
// "one field opens its own picker, then the other" back-and-forth.
function AnalysisRangePicker({
  view,
  setView,
  customRange,
  setCustomRange,
}: {
  view: AnalysisView;
  setView: (v: AnalysisView) => void;
  customRange: { start: string; end: string };
  setCustomRange: (updater: (prev: { start: string; end: string }) => { start: string; end: string }) => void;
}) {
  const [calendarMonth, setCalendarMonth] = useState(customRange.end);
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);

  const handleDayPress = (date: string) => {
    if (rangeAnchor == null) {
      setRangeAnchor(date);
      setCustomRange(() => ({ start: date, end: date }));
    } else {
      setCustomRange(() => (date < rangeAnchor ? { start: date, end: rangeAnchor } : { start: rangeAnchor, end: date }));
      setRangeAnchor(null);
    }
  };

  return (
    <>
      <View style={styles.segmented}>
        {(['all', 'week', 'month', 'custom'] as const).map((v) => (
          <Pressable key={v} onPress={() => setView(v)} style={[styles.segment, view === v && styles.segmentActive]}>
            <Caption style={view === v ? styles.segmentTextActive : undefined}>{v === 'all' ? 'All' : v === 'custom' ? 'Custom' : v[0].toUpperCase() + v.slice(1)}</Caption>
          </Pressable>
        ))}
      </View>

      {view === 'custom' && (
        <>
          <Caption style={styles.customRangeHint}>
            {rangeAnchor == null
              ? `${formatDisplayDate(customRange.start)} – ${formatDisplayDate(customRange.end)} · tap a day to start a new range`
              : `Pick the last day of the range (starting ${formatDisplayDate(rangeAnchor)})`}
          </Caption>
          <MonthCalendar
            accent={colors.teal}
            month={calendarMonth}
            onMonthChange={setCalendarMonth}
            getDayColor={(date) => (date >= customRange.start && date <= customRange.end ? colors.teal : undefined)}
            onDayPress={handleDayPress}
            disableFuture={false}
          />
        </>
      )}
    </>
  );
}

// Analysis from the very first entry: facts first, "so far" with a few,
// "tends to" with more (config/feelingsAnalysis.ts). Every card says how many
// entries it's based on. Nothing is locked.
function AnalysisStage({ onBack, onOpenTag }: { onBack: () => void; onOpenTag: (tag: string, start: string, end: string) => void }) {
  const allEntries = useFeelingsStore((s) => s.entries);
  const personalFeelings = useFeelingsStore((s) => s.personalFeelings);
  const [showAllImpact, setShowAllImpact] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);
  const [group, setGroup] = useState<SourceGroup>('all');
  // "All" by default, so a short history isn't split into empty windows.
  const [view, setView] = useState<AnalysisView>('all');
  const [customRange, setCustomRange] = useState({ start: addDaysISO(todayISO(), -13), end: todayISO() });

  const earliestDate = allEntries.reduce((min, e) => (e.date < min ? e.date : min), todayISO());
  const { start, end } = analysisRange(view, customRange, todayISO(), earliestDate);
  const inRange = allEntries.filter((e) => e.date >= start && e.date <= end);
  const groups = sourceBreakdown(inRange);
  const entries = filterBySource(inRange, group);
  const minCount = analysisMinCount(daysBetweenISO(start, end) + 1);
  const nameOf = (id: string) => findAnyFeeling(id, personalFeelings)?.name;

  const overview = overviewInsight(entries, nameOf);
  const ranking = tagImpactRanking(entries, minCount);
  const cooccurrences = tagCooccurrences(entries, minCount);
  const visibleRanking = showAllImpact ? ranking : ranking.slice(0, 4);

  // Every tag, from its first use: facts at first, a pattern only later.
  const tagCounts = new Map<string, number>();
  entries.forEach((e) => (e.reasonTags ?? []).forEach((t) => tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)));
  const tagList = Array.from(tagCounts.entries())
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
    .map(([tag]) => tag);
  const visibleTags = showAllTags ? tagList : tagList.slice(0, 6);
  const rangeWord = view === 'all' ? '' : view === 'custom' ? ' in this range' : ` this ${view}`;

  return (
    <>
      <View style={styles.headerRow}>
        <ScreenTitle>Analysis</ScreenTitle>
        <Pressable onPress={onBack} style={styles.headerLink} accessibilityRole="button" accessibilityLabel="Close Analysis">
          <Ionicons name="close" size={20} color={colors.inkSoft} />
        </Pressable>
      </View>
      <Caption style={styles.subtitle}>What came up together. Never what caused what.</Caption>

      <AnalysisRangePicker view={view} setView={setView} customRange={customRange} setCustomRange={setCustomRange} />

      {groups.length > 2 && (
        <View style={styles.sourceChips} accessibilityRole="radiogroup" accessibilityLabel="Where the feeling was logged">
          {groups.map((g) => (
            <Pressable
              key={g.group}
              onPress={() => setGroup(g.group)}
              accessibilityRole="radio"
              accessibilityState={{ selected: group === g.group }}
              style={[styles.sourceChip, group === g.group && styles.sourceChipActive]}
            >
              <Caption style={group === g.group ? styles.sourceChipTextActive : undefined}>
                {SOURCE_GROUP_LABEL[g.group]} {g.count}
              </Caption>
            </Pressable>
          ))}
        </View>
      )}

      {!overview ? (
        <Card style={styles.statsCard}>
          {allEntries.length === 0 ? (
            <>
              <Body>Your first check-in shows up here.</Body>
              <Caption style={styles.emptyText}>What you felt, how strongly, and any tags. There's nothing to unlock: it starts with one entry.</Caption>
            </>
          ) : (
            <>
              <Body>
                Nothing logged{rangeWord}
                {group !== 'all' ? ` from "${SOURCE_GROUP_LABEL[group]}"` : ''} yet.
              </Body>
              <Caption style={styles.emptyText}>Try "All" to see your full history.</Caption>
            </>
          )}
        </Card>
      ) : (
        <>
          <Card style={styles.statsCard}>
            <Eyebrow>Your feelings</Eyebrow>
            <Body style={styles.insightHeadline}>{overview.headline}</Body>
            {!!overview.detail && <Caption>{overview.detail}</Caption>}
            {overview.level === 'facts' && (
              <View style={styles.rawTagList}>
                {[...entries].reverse().map((e) => {
                  const words = e.feelingIds
                    .map((id) => {
                      const name = nameOf(id);
                      const level = e.intensities?.[id];
                      return name ? `${name.toLowerCase()}${level ? ` (${level} of 5)` : ''}` : undefined;
                    })
                    .filter(Boolean);
                  const tags = e.reasonTags ?? [];
                  return (
                    <Caption key={e.id}>
                      {`${formatDisplayDate(e.date)}: ${zoneMeta(e.zone).label}${words.length ? `, ${words.join(' & ')}` : ''}${tags.length ? ` · ${tags.join(', ')}` : ''}`}
                    </Caption>
                  );
                })}
              </View>
            )}
            <Caption style={styles.basedOn}>{basedOn(overview.n)}</Caption>
          </Card>

          {tagList.length > 0 && (
            <Card style={styles.statsCard}>
              <Eyebrow>Tags</Eyebrow>
              {visibleTags.map((tag) => {
                const t = tagInsight(entries, tag)!;
                return (
                  <Pressable key={tag} onPress={() => onOpenTag(tag, start, end)} accessibilityRole="button" style={styles.tagInsightRow}>
                    <Body>{t.headline}</Body>
                    <Caption style={styles.basedOn}>{basedOn(t.n)}</Caption>
                  </Pressable>
                );
              })}
              {tagList.length > 6 && (
                <Pressable onPress={() => setShowAllTags((v) => !v)} style={styles.seeAllLink}>
                  <Caption style={{ color: colors.teal }}>{showAllTags ? 'Show fewer' : `See all ${tagList.length}`}</Caption>
                </Pressable>
              )}
            </Card>
          )}

          {ranking.length > 0 && (
            <>
              <Eyebrow style={styles.impactSectionLabel}>Furthest from your usual</Eyebrow>
              {visibleRanking.map((impact) => (
                <TagImpactCard key={impact.tag} impact={impact} entries={entries} onPress={() => onOpenTag(impact.tag, start, end)} />
              ))}
              {ranking.length > 4 && (
                <Pressable onPress={() => setShowAllImpact((v) => !v)} style={styles.seeAllLink}>
                  <Caption style={{ color: colors.teal }}>{showAllImpact ? 'Show fewer' : `See all ${ranking.length}`}</Caption>
                </Pressable>
              )}
            </>
          )}

          {cooccurrences.length > 0 && (
            <Card style={styles.statsCard}>
              <Eyebrow>Often tagged together</Eyebrow>
              {cooccurrences.slice(0, 5).map((pair) => (
                <Caption key={`${pair.tagA}-${pair.tagB}`}>{`${pair.tagA} + ${pair.tagB}: ${pair.count} check-ins`}</Caption>
              ))}
            </Card>
          )}

          <View style={styles.infoNote}>
            <Ionicons name="information-circle-outline" size={16} color={colors.inkSoft} />
            <Caption style={styles.infoNoteText}>{CONFIDENCE_NOTE}</Caption>
          </View>
        </>
      )}
    </>
  );
}

function AnalysisTagDetailStage({ tag, start, end, onBack }: { tag: string; start: string; end: string; onBack: () => void }) {
  const allEntries = useFeelingsStore((s) => s.entries);
  const entries = allEntries.filter((e) => e.date >= start && e.date <= end);
  const spanDays = daysBetweenISO(start, end) + 1;
  const impact = tagImpactRanking(entries, analysisMinCount(spanDays)).find((r) => r.tag === tag);

  // The comparison period is the equivalent stretch immediately before the
  // one currently selected — a week vs. the week before, a month vs. the
  // month before, a custom range vs. an equal-length range right before it.
  const prevEnd = addDaysISO(start, -1);
  const prevStart = addDaysISO(prevEnd, -(spanDays - 1));
  const previousEntries = allEntries.filter((e) => e.date >= prevStart && e.date <= prevEnd);
  const trend = tagTrend(entries, previousEntries, tag);
  const periodLabel = spanDays <= 7 ? 'week' : spanDays <= 31 ? 'month' : 'period';

  return (
    <>
      <View style={styles.headerRow}>
        <ScreenTitle>{tag}</ScreenTitle>
        <Pressable onPress={onBack} style={styles.headerLink}>
          <Ionicons name="close" size={20} color={colors.inkSoft} />
        </Pressable>
      </View>
      <Caption style={styles.subtitle}>
        {formatDisplayDate(start)} – {formatDisplayDate(end)} · tagged alongside {impact?.count ?? 0} check-ins — never the cause, just logged together
      </Caption>

      {impact && (
        <Card style={styles.statsCard}>
          <Eyebrow>Impact</Eyebrow>
          <Body>{describeTagImpact(impact)}</Body>
        </Card>
      )}

      <Card style={styles.statsCard}>
        <Eyebrow>Feelings breakdown</Eyebrow>
        <TagZoneBar tag={tag} entries={entries} />
        <TagFeelingList tag={tag} entries={entries} />
      </Card>

      <Card style={styles.statsCard}>
        <Eyebrow>Trend</Eyebrow>
        {trend.currentCount === 0 && trend.previousCount === 0 ? (
          <Caption style={styles.emptyText}>Not tagged this {periodLabel} or the previous one.</Caption>
        ) : trend.percentChange != null ? (
          <Body>
            {tag} tagged {Math.abs(trend.percentChange)}% {trend.percentChange >= 0 ? 'more' : 'fewer'} often this {periodLabel} than the previous one.
          </Body>
        ) : (
          <Body>
            {tag} was tagged {trend.currentCount} {trend.currentCount === 1 ? 'time' : 'times'} this {periodLabel} — not tagged in the previous one.
          </Body>
        )}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export function MoodCheckScreen({ navigation, route }: Props) {
  // "Be more specific" from a task can start at the zone already chosen there.
  const startZone = route.params?.startZone;
  const [stack, setStack] = useState<ScreenState[]>(() => (startZone ? [{ kind: 'zone' }, { kind: 'word', zone: startZone }] : [{ kind: 'zone' }]));
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);
  const addEntry = useFeelingsStore((s) => s.addEntry);
  const setEntryNote = useFeelingsStore((s) => s.setEntryNote);

  // Launched from inside another feature (a habit/skill's "how did that
  // feel?" step) rather than opened directly — a light add-on, so once it's
  // logged we return straight to the caller instead of showing the full
  // result/guidance detour, which only makes sense as a destination in itself.
  const source = route.params?.source;

  const current = stack[stack.length - 1];
  const push = (s: ScreenState) => setStack((prev) => [...prev, s]);
  const stepBack = () => setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  const resetToZone = () => setStack([{ kind: 'zone' }]);

  // Leaving after a habit/skill feeling check is logged. useBackHandler
  // intercepts every removal while there are internal steps to step back
  // through, so calling goBack() straight from finalize would just pop one
  // internal step (reasons -> intensity) and loop the user through the flow
  // again. Disarm the handler first, then leave once that render has landed.
  const [leaving, setLeaving] = useState(false);
  React.useEffect(() => {
    if (leaving) navigation.goBack();
  }, [leaving, navigation]);

  const personalFeelings = useFeelingsStore((s) => s.personalFeelings);

  const finalize = (
    zone: FeelingZone,
    feelingIds: string[],
    intensities?: Partial<Record<string, 1 | 2 | 3 | 4 | 5>>,
    reasonTags?: string[]
  ) => {
    if (leaving) return;
    // A task's feeling is linked both ways (and carries the task's tags);
    // a habit's, skill's or Quit moment's carries that item's name as a tag.
    const id =
      source?.kind === 'task'
        ? logTaskFeeling({ taskId: source.refId, date: source.date ?? todayISO(), phase: source.phase ?? 'after', zone, feelingIds, intensities, reasonTags }) ??
          addEntry(zone, feelingIds, intensities, reasonTags, source)
        : source && (source.kind === 'habit' || source.kind === 'skill' || source.kind === 'quitHabit')
          ? logItemFeeling({ source, zone, feelingIds, intensities, reasonTags: [...(route.params?.tags ?? []), ...(reasonTags ?? [])], note: route.params?.note })
          : addEntry(zone, feelingIds, intensities, reasonTags, source);
    if (source) {
      setLeaving(true);
      return;
    }
    setNoteDraft('');
    setNoteSaved(false);
    setStack((prev) => [...prev.slice(0, 1), { kind: 'result', mode: { type: 'logged', entryId: id } }]);
  };

  const openDateInPatterns = (date: string) => {
    const dayEntries = useFeelingsStore.getState().entries.filter((e) => e.date === date);
    const entry = dayEntries[dayEntries.length - 1];
    if (entry) push({ kind: 'result', mode: { type: 'peek', zone: entry.zone, feelingIds: entry.feelingIds } });
  };

  const saveNote = () => {
    if (current.kind === 'result' && current.mode.type === 'logged' && noteDraft.trim()) {
      setEntryNote(current.mode.entryId, noteDraft);
      setNoteSaved(true);
    }
  };

  useBackHandler({
    dirty: !leaving && current.kind === 'result' && current.mode.type === 'logged' && !!noteDraft.trim() && !noteSaved,
    onSave: saveNote,
    stepBack: !leaving && stack.length > 1 ? stepBack : undefined,
  });

  // Settings → Sections → Identify the Feeling: which optional steps to ask.
  const askIntensity = useSettingsStore((s) => s.feelingsAskIntensity);
  const askSecondWord = useSettingsStore((s) => s.feelingsTwoWords);
  const askReasons = useSettingsStore((s) => s.feelingsReasonTags);
  const switchPartition = (p: Partition) => setStack([{ kind: p }]);

  // The optional steps after naming the feeling, each skipped when turned off.
  const afterIntensity = (zone: FeelingZone, feelingIds: string[], intensities?: Partial<Record<string, 1 | 2 | 3 | 4 | 5>>) =>
    askReasons ? push({ kind: 'reasons', zone, feelingIds, intensities }) : finalize(zone, feelingIds, intensities, []);
  const afterWords = (zone: FeelingZone, feelingIds: string[]) =>
    askIntensity ? push({ kind: 'intensity', zone, feelingIds }) : afterIntensity(zone, feelingIds);

  return (
    <Screen>
      {!source && stack.length === 1 && (current.kind === 'zone' || current.kind === 'patterns' || current.kind === 'analysis') && (
        <PartitionTabs active={current.kind} onSelect={switchPartition} />
      )}

      {(current.kind === 'zone' || current.kind === 'word') && (
        <FeelingPicker
          step={current}
          subtitle={null}
          zoneHeader={<ZoneHeader onTrend={() => push({ kind: 'trend' })} onBookmarks={() => push({ kind: 'bookmarks' })} />}
          zoneFooter={<SupportResourcesCard />}
          onPickZone={(zone) => push({ kind: 'word', zone })}
          onBack={resetToZone}
          onPickFeeling={(f) => {
            if (current.kind !== 'word') return;
            if (askSecondWord) push({ kind: 'secondWord', zone: current.zone, first: f });
            else afterWords(current.zone, [f.id]);
          }}
        />
      )}

      {current.kind === 'secondWord' && (
        <SecondWordStage
          zone={current.zone}
          first={current.first}
          onPick={(second) => afterWords(current.zone, [current.first.id, second.id])}
          onSkip={() => afterWords(current.zone, [current.first.id])}
        />
      )}

      {current.kind === 'intensity' && (
        <IntensityStage
          zone={current.zone}
          feelings={current.feelingIds.map((id) => findAnyFeeling(id, personalFeelings)).filter(Boolean) as PickedFeeling[]}
          onDone={(intensities) => afterIntensity(current.zone, current.feelingIds, intensities)}
          onSkip={() => afterIntensity(current.zone, current.feelingIds)}
        />
      )}

      {current.kind === 'reasons' && (
        <ReasonsStage
          zone={current.zone}
          onDone={(tags) => finalize(current.zone, current.feelingIds, current.intensities, tags)}
        />
      )}

      {current.kind === 'result' && (
        <ResultStage
          mode={current.mode}
          noteDraft={noteDraft}
          setNoteDraft={(t) => {
            setNoteDraft(t);
            setNoteSaved(false);
          }}
          noteSaved={noteSaved}
          saveNote={saveNote}
          onDone={resetToZone}
          onLogPeek={(zone, feelingIds) => finalize(zone, feelingIds)}
          onJumpZone={resetToZone}
          navigation={navigation}
        />
      )}

      {current.kind === 'trend' && (
        <TrendStage onBack={resetToZone} onOpen={(zone, feelingIds) => push({ kind: 'result', mode: { type: 'peek', zone, feelingIds } })} />
      )}

      {current.kind === 'patterns' && (
        <PatternsStage
          onBack={resetToZone}
          onOpenDate={openDateInPatterns}
          onOpenReason={(feelingId, tag) => push({ kind: 'reasonEntries', feelingId, tag })}
        />
      )}

      {current.kind === 'reasonEntries' && (
        <ReasonEntriesStage
          feelingId={current.feelingId}
          tag={current.tag}
          onBack={stepBack}
          onOpen={(zone, feelingIds) => push({ kind: 'result', mode: { type: 'peek', zone, feelingIds } })}
        />
      )}

      {current.kind === 'analysis' && (
        <AnalysisStage onBack={resetToZone} onOpenTag={(tag, start, end) => push({ kind: 'analysisTag', tag, start, end })} />
      )}

      {current.kind === 'analysisTag' && (
        <AnalysisTagDetailStage tag={current.tag} start={current.start} end={current.end} onBack={stepBack} />
      )}

      {current.kind === 'bookmarks' && (
        <BookmarksStage onBack={resetToZone} onOpen={(zone, feelingIds) => push({ kind: 'result', mode: { type: 'peek', zone, feelingIds } })} />
      )}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLinks: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  headerLink: {
    padding: spacing.xs,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    marginTop: 2,
    marginBottom: spacing.md,
  },
  streakText: {
    marginBottom: spacing.md,
    color: colors.teal,
  },
  reengagementCard: {
    backgroundColor: withAlpha(colors.amber, 0.1),
    marginBottom: spacing.md,
  },
  wordGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  wordChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: 1.5,
    backgroundColor: colors.surface,
  },
  intensityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  intensityChip: {
    flex: 1,
    minWidth: 60,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    gap: 2,
  },
  intensityLabel: {
    textAlign: 'center',
  },
  resultTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultCard: {
    gap: 4,
    marginBottom: spacing.md,
  },
  guidanceCard: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  guidanceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  guidanceBullet: {
    color: colors.teal,
  },
  guidanceText: {
    flex: 1,
  },
  voteCol: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingTop: 2,
  },
  voteHint: {
    fontStyle: 'italic',
  },
  breathingCard: {
    marginBottom: spacing.md,
  },
  reachOutCard: {
    marginBottom: spacing.md,
    backgroundColor: withAlpha(colors.amber, 0.08),
  },
  siblingsCard: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  siblingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  siblingChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: 1.5,
  },
  noteCard: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  noteInput: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    minHeight: 44,
    textAlignVertical: 'top',
  },
  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: withAlpha(colors.amber, 0.1),
    marginBottom: spacing.md,
  },
  streakCardText: {
    flex: 1,
    fontSize: 14,
  },
  suggestTitle: {
    marginBottom: spacing.sm,
  },
  suggestList: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  suggestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  suggestBody: {
    flex: 1,
    gap: 2,
  },
  sustainedBanner: {
    gap: spacing.xs,
    marginBottom: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: '#B3413A',
  },
  sustainedLabel: {
    color: '#B3413A',
  },
  resourceCard: {
    backgroundColor: colors.stone,
    borderLeftWidth: 3,
    borderLeftColor: colors.amber,
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  resourceCardEmphasized: {
    borderLeftWidth: 4,
    backgroundColor: withAlpha(colors.amber, 0.1),
  },
  doneButton: {
    marginBottom: spacing.lg,
  },
  weekSummaryCard: {
    marginBottom: spacing.md,
    backgroundColor: withAlpha(colors.teal, 0.08),
  },
  repeatsCard: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  repeatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radii.full,
  },
  repeatText: {},
  list: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  emptyText: {
    color: colors.inkSoft,
  },
  flex1: { flex: 1 },
  entryMore: { marginLeft: spacing.sm, paddingHorizontal: 4, minHeight: 28, justifyContent: 'center' },
  editZones: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.md },
  editZone: { paddingVertical: 8, paddingHorizontal: spacing.sm + 2, borderRadius: radii.full, borderWidth: 1.5, minHeight: 40, justifyContent: 'center' },
  editNote: { fontFamily: fonts.body, fontSize: 16, color: colors.ink, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line, marginTop: spacing.md },
  editActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  editAction: { flex: 1 },
  historyCard: {
    gap: 2,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  noteHistoryText: {
    fontStyle: 'italic',
  },
  sourceDeleted: {
    fontStyle: 'italic',
    opacity: 0.7,
  },
  wordChipTextActive: {
    color: colors.white,
  },
  reasonTagsText: {
    color: colors.inkSoft,
    marginTop: 2,
  },
  intensityBlock: {
    marginBottom: spacing.md,
  },
  intensityNumActive: {
    color: colors.white,
  },
  intensityLabelActive: {
    color: withAlpha(colors.white, 0.85),
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 2,
    marginBottom: spacing.md,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: colors.teal,
  },
  segmentTextActive: {
    color: colors.white,
    fontFamily: fonts.bodyMedium,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginVertical: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: radii.full,
  },
  chartNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  statsCard: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  reasonFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  reasonFilterChip: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  reasonFilterChipActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  customTagRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  customTagInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  customTagAddButton: {
    marginBottom: 0,
  },
  legendDotDim: {
    opacity: 0.3,
  },
  legendTextDim: {
    color: colors.inkSoft,
  },
  customRangeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  customRangeHint: {
    marginBottom: spacing.sm,
    color: colors.inkSoft,
  },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  dimensionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  dimensionInfoButton: {
    padding: 2,
  },
  coachmarkCard: {
    gap: spacing.xs,
    marginBottom: spacing.md,
    backgroundColor: withAlpha(colors.teal, 0.1),
    borderLeftWidth: 3,
    borderLeftColor: colors.teal,
  },
  coachmarkRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  dimensionInfoBold: {
    fontFamily: fonts.bodyMedium,
  },
  dimensionGridWrap: {
    marginVertical: spacing.sm,
  },
  dimensionGridColHeadersRow: {
    flexDirection: 'row',
  },
  dimensionGridCorner: {
    width: 78,
  },
  dimensionGridColHeader: {
    flex: 1,
    textAlign: 'center',
  },
  dimensionGridBodyRow: {
    flexDirection: 'row',
  },
  dimensionGridRowHeaders: {
    width: 78,
    justifyContent: 'space-around',
  },
  dimensionGridRowHeader: {
    flex: 1,
    textAlignVertical: 'center',
  },
  dimensionGridCells: {
    flex: 1,
    position: 'relative',
  },
  dimensionGridCellsRow: {
    flexDirection: 'row',
    gap: 2,
    marginBottom: 2,
  },
  dimensionGridCell: {
    flex: 1,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
  },
  dimensionGridCellText: {
    color: colors.white,
    fontFamily: fonts.bodyMedium,
  },
  dimensionGridOkayWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimensionGridOkay: {
    width: 52,
    height: 52,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  dimensionRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    flex: 1,
  },
  dimensionChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  dimensionChipActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  toggleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  toggleChip: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  toggleChipActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  activeReasonFilterChip: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.teal,
  },
  breakdownHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownWordBlock: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  breakdownWordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  breakdownWordName: {
    flex: 1,
  },
  breakdownReasonList: {
    marginTop: spacing.xs,
    marginLeft: spacing.md,
    gap: 6,
  },
  breakdownReasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  breakdownReasonLabel: {
    flex: 1,
  },
  chartWithExpandWrap: {
    position: 'relative',
  },
  chartLoading: {
    height: 200,
  },
  expandButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    padding: 4,
    zIndex: 1,
  },
  fullscreenRoot: {
    flex: 1,
    backgroundColor: colors.stone,
  },
  fullscreenHandleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    position: 'relative',
  },
  fullscreenHandlePill: {
    position: 'absolute',
    left: '50%',
    marginLeft: -18,
    top: 8,
    width: 36,
    height: 4,
    borderRadius: radii.full,
    backgroundColor: colors.line,
  },
  fullscreenCloseButton: {
    position: 'absolute',
    right: spacing.lg,
    top: 4,
    padding: spacing.xs,
  },
  fullscreenContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  impactSectionLabel: {
    marginBottom: spacing.xs,
  },
  insightHeadline: {
    fontFamily: fonts.bodyMedium,
    marginTop: spacing.xs,
  },
  basedOn: {
    color: colors.inkSoft,
    marginTop: 2,
  },
  tagInsightRow: {
    paddingVertical: spacing.xs,
  },
  sourceChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  sourceChip: { paddingVertical: 6, paddingHorizontal: spacing.sm + 2, borderRadius: radii.full, borderWidth: 1, borderColor: colors.line, minHeight: 34, justifyContent: 'center' },
  sourceChipActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  sourceChipTextActive: { color: colors.white },
  infoNote: { flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start', marginTop: spacing.sm, marginBottom: spacing.lg },
  infoNoteText: { flex: 1, color: colors.inkSoft },
  rawTagList: {
    gap: 2,
    marginTop: spacing.sm,
  },
  impactCard: {
    borderLeftWidth: 4,
    gap: spacing.xs,
    marginBottom: spacing.md,
    paddingVertical: spacing.lg,
  },
  impactCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  impactCardTag: {
    fontSize: 22,
  },
  impactZoneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  impactCardStat: {
    color: colors.inkSoft,
  },
  impactCardHeadline: {
    fontSize: 19,
    marginTop: spacing.xs,
  },
  seeAllLink: {
    marginBottom: spacing.md,
    alignSelf: 'flex-start',
  },
  zoneBarWrap: {
    gap: spacing.xs,
  },
  zoneBar: {
    flexDirection: 'row',
    height: 20,
    borderRadius: radii.sm,
    overflow: 'hidden',
  },
  zoneBarLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  feelingBreakdownList: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  feelingBreakdownItem: {
    gap: 2,
  },
  feelingBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  feelingBreakdownName: {
    fontWeight: '600',
  },
  feelingBreakdownCount: {
    color: colors.inkSoft,
  },
  partitionTabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 3,
    marginBottom: spacing.lg,
  },
  partitionTab: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.full,
    alignItems: 'center',
  },
  partitionTabActive: {
    backgroundColor: colors.teal,
  },
  partitionTabText: {
    color: colors.inkSoft,
  },
  partitionTabTextActive: {
    color: colors.white,
    fontFamily: fonts.bodyMedium,
  },
}));
