// "How do you feel?" after a habit, a practice session or a Quit moment.
// Optional and skippable: Skip is the same size as Save, and nothing is saved
// unless a zone is picked. "Be more specific" opens Identify the Feeling for
// the word and intensity. The feeling goes to the Feelings log with the
// item's name as a tag (utils/itemFeelings.ts).
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SheetModal } from './SheetModal';
import { TextInput } from './TextInput';
import { PrimaryButton } from './PrimaryButton';
import { Caption, Eyebrow, SectionHeading } from './Typography';
import { feelingZones, reasonTagOptions } from '../data/feelingsWheel';
import { useFeelingsStore } from '../store/useFeelingsStore';
import { withAlpha } from '../utils/color';
import { colors, fonts, radii, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';
import type { FeelingSource, FeelingZone } from '../types/sections';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { logFeeling } from '../feelings/logFeeling';

export interface ItemFeelingDraft {
  zone: FeelingZone | undefined;
  reasonTags: string[];
  note: string;
}

export function ItemFeelingSheet({
  visible,
  context,
  heading = 'How do you feel?',
  gentle = false,
  onSave,
  onSkip,
  onMoreSpecific,
}: {
  visible: boolean;
  context: string; // e.g. "Done: Morning walk"
  heading?: string;
  // Quit: softer words, and the same calm weight on both buttons.
  gentle?: boolean;
  onSave: (draft: ItemFeelingDraft & { zone: FeelingZone }) => void;
  onSkip: () => void;
  // Opens Identify the Feeling (optionally at the chosen zone), carrying over what's been filled in.
  onMoreSpecific: (draft: ItemFeelingDraft) => void;
}) {
  const customTags = useFeelingsStore((s) => s.customReasonTags);
  const [zone, setZone] = useState<FeelingZone | undefined>(undefined);
  const [reasonTags, setReasonTags] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [showTags, setShowTags] = useState(false);

  // A fresh sheet each time it opens.
  useEffect(() => {
    if (!visible) return;
    setZone(undefined);
    setReasonTags([]);
    setNote('');
    setShowTags(false);
  }, [visible]);

  const toggleTag = (t: string) => setReasonTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  const tags = [...reasonTagOptions, ...customTags.filter((t) => !(reasonTagOptions as readonly string[]).includes(t))];

  return (
    <SheetModal visible={visible} onClose={onSkip}>
      <Caption style={styles.muted} numberOfLines={2}>
        {context}
      </Caption>
      <SectionHeading accessibilityRole="header">{heading}</SectionHeading>
      <Caption style={styles.muted}>
        {gentle ? 'Only if you want to. It goes into your Feelings log.' : 'Optional. It goes into your Feelings log, tagged with this name.'}
      </Caption>

      <View style={styles.zones} accessibilityRole="radiogroup" accessibilityLabel={heading}>
        {feelingZones.map((z) => {
          const active = zone === z.id;
          return (
            <Pressable
              key={z.id}
              onPress={() => setZone(active ? undefined : z.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${z.label}: ${z.description}`}
              hitSlop={4}
              style={[styles.zone, { borderColor: z.accent }, active && { backgroundColor: withAlpha(z.accent, 0.22) }]}
            >
              <View style={[styles.dot, { backgroundColor: z.accent }]} />
              <Caption style={[styles.zoneText, active && styles.zoneTextActive]}>{z.label}</Caption>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        style={styles.linkRow}
        onPress={() => onMoreSpecific({ zone, reasonTags, note })}
        accessibilityRole="button"
        accessibilityHint="Opens Identify the Feeling to name the exact feeling and how strong it is"
      >
        <Ionicons name="search-outline" size={15} color={colors.teal} />
        <Caption style={styles.link}>Be more specific</Caption>
      </Pressable>

      <Pressable style={styles.linkRow} onPress={() => setShowTags((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showTags }}>
        <Ionicons name={showTags ? 'chevron-up' : 'chevron-down'} size={15} color={colors.inkSoft} />
        <Caption style={styles.muted}>What was going on? (optional){reasonTags.length ? ` · ${reasonTags.length} picked` : ''}</Caption>
      </Pressable>
      {showTags && (
        <>
          <Eyebrow style={styles.label}>Reasons</Eyebrow>
          <View style={styles.zones}>
            {tags.map((t) => {
              const active = reasonTags.includes(t);
              return (
                <Pressable
                  key={t}
                  onPress={() => toggleTag(t)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: active }}
                  hitSlop={4}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Caption style={active ? styles.chipTextActive : undefined}>{t}</Caption>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="A note (optional)"
        placeholderTextColor={colors.inkSoft}
        style={styles.note}
        maxLength={160}
        returnKeyType="done"
        accessibilityLabel="Note"
      />

      <View style={styles.actions}>
        <PrimaryButton label="Skip" variant="outline" style={styles.action} onPress={onSkip} />
        <PrimaryButton label="Save" style={styles.action} disabled={!zone} onPress={() => zone && onSave({ zone, reasonTags, note })} />
      </View>
    </SheetModal>
  );
}

const styles = themedStyles(() => ({
  muted: { color: colors.inkSoft },
  label: { marginTop: spacing.sm },
  zones: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  zone: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: spacing.sm + 2, borderRadius: radii.full, borderWidth: 1.5, minHeight: 40 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  zoneText: { color: colors.ink },
  zoneTextActive: { fontFamily: fonts.bodyMedium },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, alignSelf: 'flex-start' },
  link: { color: colors.teal, fontFamily: fonts.bodyMedium },
  chip: { paddingVertical: 6, paddingHorizontal: spacing.sm + 2, borderRadius: radii.full, borderWidth: 1, borderColor: colors.line, minHeight: 36, justifyContent: 'center' },
  chipActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  chipTextActive: { color: colors.white },
  note: { fontFamily: fonts.body, fontSize: 16, color: colors.ink, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line, marginTop: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  // Skip and Save are the same size: skipping is just as fine.
  action: { flex: 1 },
}));

// The sheet wired up: saves to the Feelings log, or hands over to Identify
// the Feeling with the same source (and whatever was filled in so far).
export function ItemFeelingPrompt({
  visible,
  source,
  context,
  heading,
  gentle,
  onDone,
  onSaved,
}: {
  visible: boolean;
  source: FeelingSource;
  context: string;
  heading?: string;
  gentle?: boolean;
  onDone: () => void;
  onSaved?: () => void;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <ItemFeelingSheet
      visible={visible}
      context={context}
      heading={heading}
      gentle={gentle}
      onSkip={onDone}
      onSave={(d) => {
        logFeeling({ source, zone: d.zone, tags: d.reasonTags, note: d.note });
        onSaved?.();
        onDone();
      }}
      onMoreSpecific={(d) => {
        onDone();
        navigation.push('moodCheck', { source, ...(d.zone ? { startZone: d.zone } : {}), note: d.note.trim() || undefined, tags: d.reasonTags });
      }}
    />
  );
}
