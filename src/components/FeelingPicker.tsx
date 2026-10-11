import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { TextInput } from './TextInput';
import { Card } from './Card';
import { PrimaryButton } from './PrimaryButton';
import { ScreenTitle, SectionHeading, Body, Caption } from './Typography';
import { colors, fonts, radii, spacing } from '../theme';
import { withAlpha } from '../utils/color';
import { feelings, feelingsInZone, zoneMeta, feelingZones } from '../data/feelingsWheel';
import { useFeelingsStore } from '../store/useFeelingsStore';
import type { Feeling, FeelingZone, PersonalFeeling } from '../types/sections';
import { themedStyles } from '../theme/runtime';

export type PickedFeeling = Feeling | PersonalFeeling;

export function isPersonalFeeling(f: PickedFeeling): f is PersonalFeeling {
  return !('definition' in f);
}

// The shared two-step Feelings Wheel v2 picker (zone → word) — the same flow
// built for Identify the Feeling, reused as-is wherever a screen needs the
// user to name a feeling with a real definition rather than a plain label.
// Fully controlled: the caller owns the current step and decides what
// "select" means (log a check-in, attach to a note, etc). Personal words are
// owned by the shared store, since they're a cross-cutting user list, not
// per-screen state.
export type FeelingPickerStep = { kind: 'zone' } | { kind: 'word'; zone: FeelingZone };

interface FeelingPickerProps {
  step: FeelingPickerStep;
  onPickZone: (zone: FeelingZone) => void;
  onPickFeeling: (feeling: PickedFeeling) => void;
  onBack: () => void; // word step -> zone step
  // The zone step's default subtitle. Pass `null` to suppress it entirely
  // when zoneHeader already supplies its own subtitle text at the right
  // position (e.g. Identify the Feeling's streak/re-engagement layout).
  subtitle?: string | null;
  // Rendered on the zone step only, above/below the zone grid — for a
  // caller-specific header (title, streak) or footer (support-resources card).
  zoneHeader?: React.ReactNode;
  zoneFooter?: React.ReactNode;
}

function WordChip({
  label,
  accent,
  active,
  onPress,
}: {
  label: string;
  accent: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.wordChip, { borderColor: accent }, active && { backgroundColor: accent }]}>
      <Body style={active ? styles.wordChipTextActive : { color: accent }}>{label}</Body>
    </Pressable>
  );
}

export function FeelingPicker({
  step,
  onPickZone,
  onPickFeeling,
  onBack,
  subtitle,
  zoneHeader,
  zoneFooter,
}: FeelingPickerProps) {
  const personalFeelings = useFeelingsStore((s) => s.personalFeelings);
  const addPersonalFeeling = useFeelingsStore((s) => s.addPersonalFeeling);

  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<PickedFeeling | null>(null);
  const [writingOwnWord, setWritingOwnWord] = useState(false);
  const [ownWord, setOwnWord] = useState('');

  const resetWordStageLocalState = () => {
    setQuery('');
    setPreview(null);
    setWritingOwnWord(false);
    setOwnWord('');
  };

  // Computed unconditionally (not just on the 'word' step) so hook order
  // never changes between renders — React requires this.
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const staticMatches = feelings.filter((f) => f.name.toLowerCase().includes(q));
    const personalMatches = personalFeelings.filter((p) => p.name.toLowerCase().includes(q));
    return [...staticMatches, ...personalMatches];
  }, [query, personalFeelings]);

  if (step.kind === 'zone') {
    return (
      <>
        {zoneHeader}
        {subtitle !== null && <Caption style={styles.subtitle}>{subtitle ?? 'Where are you right now?'}</Caption>}
        <View style={styles.zoneGrid}>
          {feelingZones.map((z) => (
            <Pressable key={z.id} onPress={() => { resetWordStageLocalState(); onPickZone(z.id); }}>
              <Card style={[styles.zoneCard, { borderLeftColor: z.accent, borderLeftWidth: 4 }]}>
                <SectionHeading style={{ color: z.accent }}>{z.label}</SectionHeading>
                <Body style={styles.zoneDesc}>{z.description}</Body>
                <Caption style={styles.zoneExamples}>{z.exampleWords.join(', ')}</Caption>
              </Card>
            </Pressable>
          ))}
        </View>
        {zoneFooter}
      </>
    );
  }

  // step.kind === 'word'
  const meta = zoneMeta(step.zone);
  const zoneWords: PickedFeeling[] = [
    ...feelingsInZone(step.zone),
    ...personalFeelings.filter((p) => p.zone === step.zone),
  ];

  if (preview) {
    const zoneAccent = zoneMeta(preview.zone).accent;
    return (
      <>
        <Pressable onPress={() => setPreview(null)} style={styles.backLink}>
          <Caption style={styles.backLinkText}>‹ Back to words</Caption>
        </Pressable>
        <ScreenTitle style={{ color: zoneAccent }}>{preview.name}</ScreenTitle>
        {isPersonalFeeling(preview) ? (
          <Body style={styles.definitionText}>Your own word — saved to your list in {zoneMeta(preview.zone).label}.</Body>
        ) : (
          <Body style={styles.definitionText}>{preview.definition}</Body>
        )}
        <PrimaryButton label={`Select "${preview.name}"`} onPress={() => onPickFeeling(preview)} style={styles.confirmButton} />
      </>
    );
  }

  return (
    <>
      <Pressable onPress={onBack} style={styles.backLink}>
        <Caption style={styles.backLinkText}>‹ All zones</Caption>
      </Pressable>
      <ScreenTitle style={{ color: meta.accent }}>{meta.label}</ScreenTitle>
      <Caption style={styles.subtitle}>Find the word — mild to strong</Caption>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search any word, any zone..."
        placeholderTextColor={colors.inkSoft}
        style={styles.searchInput}
      />

      {query.trim() ? (
        <View style={styles.wordGrid}>
          {searchResults.length === 0 && <Caption style={styles.noResults}>No matching word.</Caption>}
          {searchResults.map((f) => (
            <WordChip
              key={f.id}
              label={f.name}
              accent={zoneMeta(f.zone).accent}
              active={false}
              onPress={() => setPreview(f)}
            />
          ))}
        </View>
      ) : (
        <View style={styles.wordGrid}>
          {zoneWords.map((f) => (
            <WordChip key={f.id} label={f.name} accent={meta.accent} active={false} onPress={() => setPreview(f)} />
          ))}
        </View>
      )}

      {!writingOwnWord ? (
        <Pressable onPress={() => setWritingOwnWord(true)} style={styles.ownWordLink}>
          <Caption style={styles.ownWordLinkText}>Something else? Write your own word</Caption>
        </Pressable>
      ) : (
        <View style={styles.ownWordRow}>
          <TextInput
            value={ownWord}
            onChangeText={setOwnWord}
            placeholder="Your word..."
            placeholderTextColor={colors.inkSoft}
            style={styles.ownWordInput}
            autoFocus
          />
          <PrimaryButton
            label="Save"
            variant="outline"
            disabled={!ownWord.trim()}
            onPress={() => {
              const created = addPersonalFeeling(ownWord, step.zone);
              onPickFeeling(created);
            }}
          />
        </View>
      )}

      <Pressable onPress={() => onPickFeeling(feelingsInZone(step.zone)[0])} style={styles.notSureLink}>
        <Caption style={styles.notSureText}>Not sure yet — just log {meta.label}</Caption>
      </Pressable>
    </>
  );
}

const styles = themedStyles(() => ({
  subtitle: {
    marginTop: 2,
    marginBottom: spacing.md,
  },
  zoneGrid: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  zoneCard: {
    gap: 2,
  },
  zoneDesc: {
    color: colors.inkSoft,
  },
  zoneExamples: {
    fontStyle: 'italic',
  },
  backLink: {
    marginBottom: spacing.sm,
  },
  backLinkText: {
    color: colors.inkSoft,
  },
  searchInput: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
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
  wordChipTextActive: {
    color: colors.white,
  },
  noResults: {
    color: colors.inkSoft,
  },
  ownWordLink: {
    marginBottom: spacing.md,
    paddingVertical: spacing.xs,
  },
  ownWordLinkText: {
    color: colors.teal,
  },
  ownWordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  ownWordInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: spacing.sm,
  },
  notSureLink: {
    marginBottom: spacing.lg,
    paddingVertical: spacing.sm,
  },
  notSureText: {
    color: colors.teal,
    textAlign: 'center',
  },
  definitionText: {
    marginBottom: spacing.lg,
  },
  confirmButton: {
    marginBottom: spacing.lg,
  },
}));
